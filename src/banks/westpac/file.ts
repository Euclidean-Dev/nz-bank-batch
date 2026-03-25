import { AdapterError, DateError, FieldError } from '../../shared/errors.js';
import type { FixedWidthFieldInput } from '../../shared/fixed-width.js';
import { renderFixedWidthRecord } from '../../shared/fixed-width.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import { ensureRenderedRecord, renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok } from '../../shared/result.js';
import { assertNzAccount, decomposeNzAccount, parseNzAccount } from '../../nz/account.js';
import { computeBranchBaseHashTotal } from '../../nz/hash-total.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  WestpacPaymentFile,
  WestpacPaymentFileConfig,
  WestpacPaymentFormat,
  WestpacPaymentTransaction
} from './types.js';

const ASCII_PRINTABLE = /^[ -~]*$/;
const DDMMYY_PATTERN = /^(\d{2})(\d{2})(\d{2})$/;
const DDMMYYYY_PATTERN = /^(\d{2})(\d{2})(\d{4})$/;
const MAX_PAYMENT_CENTS = 999_999_999n;
const HEADER_FIELD_WIDTHS = [1, 6, 2, 4, 30, 6, 20, 6, 105] as const;
const DETAIL_FIELD_WIDTHS = [1, 6, 2, 4, 8, 4, 2, 2, 15, 20, 12, 12, 12, 2, 4, 8, 4, 20, 42] as const;
const ORIGINATING_BANK = '03';
const PAYMENT_TRANSACTION_CODE = '50';
const PAYMENT_MTS_SOURCE = 'DC';

type StoredTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payeeAnalysis: string;
  readonly payeeParticulars: string;
};

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function currentDdMmYy(): string {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = String(now.getUTCFullYear() % 100).padStart(2, '0');
  return `${day}${month}${year}`;
}

function normaliseUppercase(value: string): string {
  return value.toUpperCase();
}

function assertDdMmYy(input: string): string {
  const trimmed = input.trim();
  const shortMatch = DDMMYY_PATTERN.exec(trimmed);

  if (shortMatch) {
    const [, dayRaw, monthRaw, yearRaw] = shortMatch;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = 2000 + Number(yearRaw);

    if (!isValidDate(year, month, day)) {
      throw new DateError('INVALID_DATE', 'Westpac scheduledDate must be a valid calendar day.', {
        input
      });
    }

    return trimmed;
  }

  const longMatch = DDMMYYYY_PATTERN.exec(trimmed);

  if (!longMatch) {
    throw new DateError('INVALID_DATE', 'Westpac scheduledDate must be in DDMMYY format.', {
      input
    });
  }

  const [, dayRaw, monthRaw, yearRaw] = longMatch;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (!isValidDate(year, month, day)) {
    throw new DateError('INVALID_DATE', 'Westpac scheduledDate must be a valid calendar day.', {
      input
    });
  }

  return `${dayRaw!}${monthRaw!}${yearRaw!.slice(2)}`;
}

function ensureAscii(name: string, value: string): string {
  const trimmed = value.trimEnd();

  if (!ASCII_PRINTABLE.test(trimmed)) {
    throw new FieldError('FIELD_ASCII', `Field ${name} must contain printable ASCII only.`, {
      field: name,
      value
    });
  }

  return trimmed;
}

function ensureLength(name: string, value: string, maxLength: number): string {
  if (value.length > maxLength) {
    throw new FieldError('FIELD_LENGTH', `Field ${name} exceeds max length ${String(maxLength)}.`, {
      field: name,
      value,
      maxLength
    });
  }

  return value;
}

function ensureRequiredAscii(name: string, value: string, maxLength: number): string {
  const prepared = ensureLength(name, ensureAscii(name, value), maxLength);

  if (prepared.length === 0) {
    throw new FieldError('FIELD_REQUIRED', `Field ${name} is required.`, {
      field: name
    });
  }

  return prepared;
}

function ensureOptionalAscii(name: string, value: string | undefined, maxLength: number): string {
  return ensureLength(name, ensureAscii(name, value ?? ''), maxLength);
}

function ensureCsvField(name: string, value: string): string {
  if (value.includes(',') || value.includes('"')) {
    throw new FieldError('FIELD_ASCII', `Field ${name} must not contain commas or double quotes.`, {
      field: name,
      value
    });
  }

  return value;
}

function renderCsvRecord(fields: readonly string[]): string {
  return fields.join(',');
}

function formatCentsAmount(cents: bigint, width: number, field: string): string {
  const formatted = cents.toString();

  if (formatted.length > width) {
    throw new FieldError('FIELD_LENGTH', `Field ${field} exceeds fixed width ${String(width)}.`, {
      field,
      value: formatted,
      length: width
    });
  }

  return formatted.padStart(width, '0');
}

function createFixedField(
  name: string,
  length: number,
  value: string,
  options?: {
    readonly required?: boolean;
    readonly align?: 'left' | 'right';
    readonly pad?: string;
  }
): FixedWidthFieldInput {
  return {
    value,
    spec: {
      name,
      length,
      ...(options?.required !== undefined ? { required: options.required } : {}),
      ...(options?.align !== undefined ? { align: options.align } : {}),
      ...(options?.pad !== undefined ? { pad: options.pad } : {}),
      allowedPattern: ASCII_PRINTABLE
    }
  };
}

function makeSummary(transactions: readonly StoredTransaction[]): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0n);

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: computeBranchBaseHashTotal(
      transactions.map((transaction) => transaction.toAccount)
    )
  };
}

function renderHeaderCsv(config: {
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
  readonly sequenceNumber: string;
}): string {
  return renderCsvRecord([
    ensureCsvField('recordType', 'A'),
    ensureCsvField('sequenceNumber', config.sequenceNumber),
    ensureCsvField('originatingBank', ORIGINATING_BANK),
    ensureCsvField('originatingBranch', config.originatingBranch),
    ensureCsvField('customerName', config.customerName),
    ensureCsvField('customerNumber', ''),
    ensureCsvField('description', config.fileReference),
    ensureCsvField('scheduledDate', config.scheduledDate),
    ensureCsvField('spare', '')
  ]);
}

function renderTransactionCsv(config: {
  readonly fromAccount: NzAccountNumber;
  readonly payerName: string;
  readonly sequenceNumber: string;
  readonly transaction: StoredTransaction;
}): string {
  const toParts = decomposeNzAccount(config.transaction.toAccount);
  const fromParts = decomposeNzAccount(config.fromAccount);

  return renderCsvRecord([
    ensureCsvField('recordType', 'D'),
    ensureCsvField('sequenceNumber', config.sequenceNumber),
    ensureCsvField('payeeBank', toParts.bankId),
    ensureCsvField('payeeBranch', toParts.branch),
    ensureCsvField('payeeAccount', toParts.paddedBase),
    ensureCsvField('payeeSuffix', toParts.paddedSuffix),
    ensureCsvField('transactionCode', PAYMENT_TRANSACTION_CODE),
    ensureCsvField('mtsSource', PAYMENT_MTS_SOURCE),
    ensureCsvField('amount', config.transaction.amountCents.toString()),
    ensureCsvField('payeeName', config.transaction.accountName),
    ensureCsvField('payeeParticulars', config.transaction.payeeParticulars),
    ensureCsvField('payeeAnalysis', config.transaction.payeeAnalysis),
    ensureCsvField('payerReference', config.transaction.payerReference),
    ensureCsvField('fundingBank', fromParts.bankId),
    ensureCsvField('fundingBranch', fromParts.branch),
    ensureCsvField('fundingAccount', fromParts.paddedBase),
    ensureCsvField('fundingSuffix', fromParts.paddedSuffix),
    ensureCsvField('payerName', config.payerName),
    ensureCsvField('spare', '')
  ]);
}

function renderHeaderFixed(config: {
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
  readonly sequenceNumber: string;
}) {
  return renderFixedWidthRecord([
    createFixedField('recordType', HEADER_FIELD_WIDTHS[0], 'A', { required: true }),
    createFixedField('sequenceNumber', HEADER_FIELD_WIDTHS[1], config.sequenceNumber, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('originatingBank', HEADER_FIELD_WIDTHS[2], ORIGINATING_BANK, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('originatingBranch', HEADER_FIELD_WIDTHS[3], config.originatingBranch, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('customerName', HEADER_FIELD_WIDTHS[4], config.customerName, { required: false }),
    createFixedField('customerNumber', HEADER_FIELD_WIDTHS[5], ''),
    createFixedField('description', HEADER_FIELD_WIDTHS[6], config.fileReference, { required: false }),
    createFixedField('scheduledDate', HEADER_FIELD_WIDTHS[7], config.scheduledDate, { required: true }),
    createFixedField('spare', HEADER_FIELD_WIDTHS[8], '')
  ]);
}

function renderTransactionFixed(config: {
  readonly fromAccount: NzAccountNumber;
  readonly payerName: string;
  readonly sequenceNumber: string;
  readonly transaction: StoredTransaction;
}) {
  const toParts = decomposeNzAccount(config.transaction.toAccount);
  const fromParts = decomposeNzAccount(config.fromAccount);

  return renderFixedWidthRecord([
    createFixedField('recordType', DETAIL_FIELD_WIDTHS[0], 'D', { required: true }),
    createFixedField('sequenceNumber', DETAIL_FIELD_WIDTHS[1], config.sequenceNumber, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('bankCode', DETAIL_FIELD_WIDTHS[2], toParts.bankId, { required: true, align: 'right', pad: '0' }),
    createFixedField('branchCode', DETAIL_FIELD_WIDTHS[3], toParts.branch, { required: true, align: 'right', pad: '0' }),
    createFixedField('accountNumber', DETAIL_FIELD_WIDTHS[4], toParts.paddedBase, { required: true, align: 'right', pad: '0' }),
    createFixedField('accountSuffix', DETAIL_FIELD_WIDTHS[5], toParts.paddedSuffix, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('transactionCode', DETAIL_FIELD_WIDTHS[6], PAYMENT_TRANSACTION_CODE, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('mtsSource', DETAIL_FIELD_WIDTHS[7], PAYMENT_MTS_SOURCE, { required: true }),
    createFixedField(
      'paymentAmount',
      DETAIL_FIELD_WIDTHS[8],
      formatCentsAmount(config.transaction.amountCents, DETAIL_FIELD_WIDTHS[8], 'paymentAmount'),
      { required: true, align: 'right', pad: '0' }
    ),
    createFixedField('payeeName', DETAIL_FIELD_WIDTHS[9], config.transaction.accountName, {
      required: false
    }),
    createFixedField('payeeParticulars', DETAIL_FIELD_WIDTHS[10], config.transaction.payeeParticulars),
    createFixedField('payeeAnalysis', DETAIL_FIELD_WIDTHS[11], config.transaction.payeeAnalysis),
    createFixedField('payerReference', DETAIL_FIELD_WIDTHS[12], config.transaction.payerReference),
    createFixedField('fundingBankCode', DETAIL_FIELD_WIDTHS[13], fromParts.bankId, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('fundingBranchCode', DETAIL_FIELD_WIDTHS[14], fromParts.branch, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('fundingAccountNumber', DETAIL_FIELD_WIDTHS[15], fromParts.paddedBase, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('fundingAccountSuffix', DETAIL_FIELD_WIDTHS[16], fromParts.paddedSuffix, {
      required: true,
      align: 'right',
      pad: '0'
    }),
    createFixedField('payerName', DETAIL_FIELD_WIDTHS[17], config.payerName),
    createFixedField('spare', DETAIL_FIELD_WIDTHS[18], '')
  ]);
}

function validateConfig(config: WestpacPaymentFileConfig): {
  readonly fromAccount: NzAccountNumber;
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
} {
  const fromAccount = assertNzAccount(config.fromAccount);
  const fromParts = decomposeNzAccount(fromAccount);

  return {
    fromAccount,
    originatingBranch: fromParts.branch,
    customerName: normaliseUppercase(
      ensureOptionalAscii('customerName', config.customerName, HEADER_FIELD_WIDTHS[4])
    ),
    fileReference: normaliseUppercase(
      ensureOptionalAscii('fileReference', config.fileReference, HEADER_FIELD_WIDTHS[6])
    ),
    scheduledDate: assertDdMmYy(config.scheduledDate ?? currentDdMmYy())
  };
}

function createWestpacFile(
  kind: WestpacPaymentFormat,
  config: WestpacPaymentFileConfig
): WestpacPaymentFile {
  const normalised = validateConfig(config);
  const transactions: StoredTransaction[] = [];

  const validateRender = () => {
    const header =
      kind === 'payment-csv'
        ? renderHeaderCsv({ ...normalised, sequenceNumber: '000001' })
        : ensureRenderedRecord(renderHeaderFixed({ ...normalised, sequenceNumber: '000001' }));

    if (header.length === 0) {
      throw new AdapterError('ADAPTER_CONFIG', 'Westpac header could not be rendered.');
    }
  };

  validateRender();

  const file: WestpacPaymentFile = {
    kind,
    addTransaction(transaction: WestpacPaymentTransaction) {
      const toAccountResult = parseNzAccount(transaction.toAccount);

      if (!toAccountResult.ok) {
        return toAccountResult;
      }

      const amountResult = parseCents(transaction.amount);

      if (!amountResult.ok) {
        return amountResult;
      }

      const amountCents = amountResult.value as bigint;

      if (amountCents <= 0n || amountCents > MAX_PAYMENT_CENTS) {
        return err(
          new AdapterError(
            'ADAPTER_TRANSACTION',
            'Westpac EFT payment amount must be between 0.01 and 9,999,999.99 NZD.',
            { amountCents }
          )
        );
      }

      let stored: StoredTransaction;

      try {
        stored = {
          toAccount: toAccountResult.value,
          amountCents,
          accountName: ensureRequiredAscii('accountName', transaction.accountName, DETAIL_FIELD_WIDTHS[9]),
          payerReference: normaliseUppercase(
            ensureOptionalAscii('payerReference', transaction.payerReference, DETAIL_FIELD_WIDTHS[12])
          ),
          payeeAnalysis: normaliseUppercase(
            ensureOptionalAscii('payeeAnalysis', transaction.payeeAnalysis, DETAIL_FIELD_WIDTHS[11])
          ),
          payeeParticulars: normaliseUppercase(
            ensureOptionalAscii(
              'payeeParticulars',
              transaction.payeeParticulars,
              DETAIL_FIELD_WIDTHS[10]
            )
          )
        };
      } catch (error) {
        return err(error as AdapterError | DateError | FieldError);
      }

      try {
        if (kind === 'payment-csv') {
          renderTransactionCsv({
            fromAccount: normalised.fromAccount,
            payerName: normalised.customerName,
            sequenceNumber: '000002',
            transaction: stored
          });
        } else {
          const rendered = renderTransactionFixed({
            fromAccount: normalised.fromAccount,
            payerName: normalised.customerName,
            sequenceNumber: '000002',
            transaction: stored
          });

          if (!rendered.ok) {
            return err(rendered.error);
          }
        }
      } catch (error) {
        return err(error as AdapterError | DateError | FieldError);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      return makeSummary(transactions);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const summary = file.summary();
      const records = [
        kind === 'payment-csv'
          ? renderHeaderCsv({ ...normalised, sequenceNumber: '000001' })
          : ensureRenderedRecord(renderHeaderFixed({ ...normalised, sequenceNumber: '000001' })),
        ...transactions.map((transaction, index) => {
          const sequenceNumber = String(index + 2).padStart(6, '0');

          if (kind === 'payment-csv') {
            return renderTransactionCsv({
              fromAccount: normalised.fromAccount,
              payerName: normalised.customerName,
              sequenceNumber,
              transaction
            });
          }

          return ensureRenderedRecord(
            renderTransactionFixed({
              fromAccount: normalised.fromAccount,
              payerName: normalised.customerName,
              sequenceNumber,
              transaction
            })
          );
        })
      ];

      void summary;

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createPaymentCsvFile(config: WestpacPaymentFileConfig): WestpacPaymentFile {
  return createWestpacFile('payment-csv', config);
}

export function createPaymentFixedLengthFile(config: WestpacPaymentFileConfig): WestpacPaymentFile {
  return createWestpacFile('payment-fixed-length', config);
}