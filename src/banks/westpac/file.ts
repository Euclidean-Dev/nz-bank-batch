import { AdapterError, FieldError } from '../../shared/errors.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import { renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok } from '../../shared/result.js';
import {
  assertNzBankAccount,
  decomposeNzAccount,
  parseNzAccount
} from '../../nz/account.js';
import { assertDdMmYy } from '../../nz/date.js';
import { computeBranchBaseHashTotal } from '../../nz/hash-total.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  WestpacDirectCreditFile,
  WestpacDirectCreditFileConfig,
  WestpacDirectCreditTransaction,
  WestpacDirectCreditTransactionCode,
  WestpacDirectDebitFile,
  WestpacDirectDebitFileConfig,
  WestpacDirectDebitTransaction,
  WestpacPaymentFile,
  WestpacPaymentFileConfig
} from './types.js';

const ASCII_PRINTABLE = /^[ -~]*$/;
const MAX_PAYMENT_CENTS = 999_999_999n;
const HEADER_FIELD_WIDTHS = [1, 6, 2, 4, 30, 6, 20, 6, 105] as const;
const DETAIL_FIELD_WIDTHS = [
  1, 6, 2, 4, 8, 4, 2, 2, 15, 20, 12, 12, 12, 2, 4, 8, 4, 20, 42
] as const;
const ORIGINATING_BANK = '03';
const DIRECT_DEBIT_TRANSACTION_CODE = '00';
const DIRECT_DEBIT_MTS_SOURCE = 'DD';
const DIRECT_CREDIT_MTS_SOURCE = 'DC';

type StoredDirectCreditTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payeeAnalysis: string;
  readonly payeeParticulars: string;
  readonly transactionCode: WestpacDirectCreditTransactionCode;
};

type StoredDirectDebitTransaction = {
  readonly fromAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payerAnalysis: string;
  readonly payerParticulars: string;
};

function currentDdMmYy(): string {
  return assertDdMmYy(new Date());
}

function normaliseUppercase(value: string): string {
  return value.toUpperCase();
}

function ensureAscii(name: string, value: string): string {
  const trimmed = value.trimEnd();

  if (!ASCII_PRINTABLE.test(trimmed)) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${name} must contain printable ASCII only.`,
      {
        field: name,
        value
      }
    );
  }

  return trimmed;
}

function ensureLength(name: string, value: string, maxLength: number): string {
  if (value.length > maxLength) {
    throw new FieldError(
      'FIELD_LENGTH',
      `Field ${name} exceeds max length ${String(maxLength)}.`,
      {
        field: name,
        value,
        maxLength
      }
    );
  }

  return value;
}

function ensureRequiredAscii(
  name: string,
  value: string,
  maxLength: number
): string {
  const prepared = ensureLength(name, ensureAscii(name, value), maxLength);

  if (prepared.length === 0) {
    throw new FieldError('FIELD_REQUIRED', `Field ${name} is required.`, {
      field: name
    });
  }

  return prepared;
}

function ensureOptionalAscii(
  name: string,
  value: string | undefined,
  maxLength: number
): string {
  return ensureLength(name, ensureAscii(name, value ?? ''), maxLength);
}

function ensureCsvField(name: string, value: string): string {
  if (value.includes(',') || value.includes('"')) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${name} must not contain commas or double quotes.`,
      {
        field: name,
        value
      }
    );
  }

  return value;
}

function renderCsvRecord(fields: readonly string[]): string {
  return fields.join(',');
}

function makeSummary(
  transactions: readonly {
    readonly amountCents: bigint;
  }[]
): BatchFileSummary {
  const total = transactions.reduce(
    (sum, transaction) => sum + transaction.amountCents,
    0n
  );

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: 0n
  };
}

function makeDirectCreditSummary(
  transactions: readonly StoredDirectCreditTransaction[]
): BatchFileSummary {
  return {
    ...makeSummary(transactions),
    hashTotal: computeBranchBaseHashTotal(
      transactions.map((transaction) => transaction.toAccount)
    )
  };
}

function makeDirectDebitSummary(
  transactions: readonly StoredDirectDebitTransaction[]
): BatchFileSummary {
  return {
    ...makeSummary(transactions),
    hashTotal: computeBranchBaseHashTotal(
      transactions.map((transaction) => transaction.fromAccount)
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

function renderDirectCreditTransactionCsv(config: {
  readonly fromAccount: NzAccountNumber;
  readonly payerName: string;
  readonly sequenceNumber: string;
  readonly transaction: StoredDirectCreditTransaction;
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
    ensureCsvField('transactionCode', config.transaction.transactionCode),
    ensureCsvField('mtsSource', DIRECT_CREDIT_MTS_SOURCE),
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

function renderDirectDebitTransactionCsv(config: {
  readonly toAccount: NzAccountNumber;
  readonly collectorName: string;
  readonly sequenceNumber: string;
  readonly transaction: StoredDirectDebitTransaction;
}): string {
  const payerParts = decomposeNzAccount(config.transaction.fromAccount);
  const collectorParts = decomposeNzAccount(config.toAccount);

  return renderCsvRecord([
    ensureCsvField('recordType', 'D'),
    ensureCsvField('sequenceNumber', config.sequenceNumber),
    ensureCsvField('payerBank', payerParts.bankId),
    ensureCsvField('payerBranch', payerParts.branch),
    ensureCsvField('payerAccount', payerParts.paddedBase),
    ensureCsvField('payerSuffix', payerParts.paddedSuffix),
    ensureCsvField('transactionCode', DIRECT_DEBIT_TRANSACTION_CODE),
    ensureCsvField('mtsSource', DIRECT_DEBIT_MTS_SOURCE),
    ensureCsvField('amount', config.transaction.amountCents.toString()),
    ensureCsvField('payerName', config.transaction.accountName),
    ensureCsvField('payerParticulars', config.transaction.payerParticulars),
    ensureCsvField('payerAnalysis', config.transaction.payerAnalysis),
    ensureCsvField('payerReference', config.transaction.payerReference),
    ensureCsvField('collectorBank', collectorParts.bankId),
    ensureCsvField('collectorBranch', collectorParts.branch),
    ensureCsvField('collectorAccount', collectorParts.paddedBase),
    ensureCsvField('collectorSuffix', collectorParts.paddedSuffix),
    ensureCsvField('collectorName', config.collectorName),
    ensureCsvField('spare', '')
  ]);
}

function validateDirectCreditConfig(config: WestpacDirectCreditFileConfig): {
  readonly fromAccount: NzAccountNumber;
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
} {
  const fromAccount = assertNzBankAccount(config.fromAccount, ['03'] as const);
  const fromParts = decomposeNzAccount(fromAccount);

  return {
    fromAccount,
    originatingBranch: fromParts.branch,
    customerName: normaliseUppercase(
      ensureOptionalAscii(
        'customerName',
        config.customerName,
        HEADER_FIELD_WIDTHS[4]
      )
    ),
    fileReference: normaliseUppercase(
      ensureOptionalAscii(
        'fileReference',
        config.fileReference,
        HEADER_FIELD_WIDTHS[6]
      )
    ),
    scheduledDate: assertDdMmYy(config.scheduledDate ?? currentDdMmYy())
  };
}

function validateDirectDebitConfig(config: WestpacDirectDebitFileConfig): {
  readonly toAccount: NzAccountNumber;
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
} {
  const toAccount = assertNzBankAccount(config.toAccount, ['03'] as const);
  const toParts = decomposeNzAccount(toAccount);

  return {
    toAccount,
    originatingBranch: toParts.branch,
    customerName: normaliseUppercase(
      ensureOptionalAscii(
        'customerName',
        config.customerName,
        HEADER_FIELD_WIDTHS[4]
      )
    ),
    fileReference: normaliseUppercase(
      ensureOptionalAscii(
        'fileReference',
        config.fileReference,
        HEADER_FIELD_WIDTHS[6]
      )
    ),
    scheduledDate: assertDdMmYy(config.scheduledDate ?? currentDdMmYy())
  };
}

function validateHeaderRender(config: {
  readonly originatingBranch: string;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
}) {
  const header = renderHeaderCsv({ ...config, sequenceNumber: '000001' });

  if (header.length === 0) {
    throw new AdapterError(
      'ADAPTER_CONFIG',
      'Westpac header could not be rendered.'
    );
  }
}

export function createDirectCreditFile(
  config: WestpacDirectCreditFileConfig
): WestpacDirectCreditFile {
  const normalised = validateDirectCreditConfig(config);
  const transactions: StoredDirectCreditTransaction[] = [];

  validateHeaderRender(normalised);

  const file: WestpacDirectCreditFile = {
    kind: 'direct-credit',
    addTransaction(transaction: WestpacDirectCreditTransaction) {
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

      let stored: StoredDirectCreditTransaction;

      try {
        stored = {
          toAccount: toAccountResult.value,
          amountCents,
          accountName: ensureRequiredAscii(
            'accountName',
            transaction.accountName,
            DETAIL_FIELD_WIDTHS[9]
          ),
          payerReference: normaliseUppercase(
            ensureOptionalAscii(
              'payerReference',
              transaction.payerReference,
              DETAIL_FIELD_WIDTHS[12]
            )
          ),
          payeeAnalysis: normaliseUppercase(
            ensureOptionalAscii(
              'payeeAnalysis',
              transaction.payeeAnalysis,
              DETAIL_FIELD_WIDTHS[11]
            )
          ),
          payeeParticulars: normaliseUppercase(
            ensureOptionalAscii(
              'payeeParticulars',
              transaction.payeeParticulars,
              DETAIL_FIELD_WIDTHS[10]
            )
          ),
          transactionCode: transaction.transactionCode ?? '50'
        };
      } catch (error) {
        return err(error as AdapterError | FieldError);
      }

      try {
        renderDirectCreditTransactionCsv({
          fromAccount: normalised.fromAccount,
          payerName: normalised.customerName,
          sequenceNumber: '000002',
          transaction: stored
        });
      } catch (error) {
        return err(error as AdapterError | FieldError);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      return makeDirectCreditSummary(transactions);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const records = [
        renderHeaderCsv({ ...normalised, sequenceNumber: '000001' }),
        ...transactions.map((transaction, index) => {
          const sequenceNumber = String(index + 2).padStart(6, '0');

          return renderDirectCreditTransactionCsv({
            fromAccount: normalised.fromAccount,
            payerName: normalised.customerName,
            sequenceNumber,
            transaction
          });
        })
      ];

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createDirectDebitFile(
  config: WestpacDirectDebitFileConfig
): WestpacDirectDebitFile {
  const normalised = validateDirectDebitConfig(config);
  const transactions: StoredDirectDebitTransaction[] = [];

  validateHeaderRender(normalised);

  const file: WestpacDirectDebitFile = {
    kind: 'direct-debit',
    addTransaction(transaction: WestpacDirectDebitTransaction) {
      const fromAccountResult = parseNzAccount(transaction.fromAccount);

      if (!fromAccountResult.ok) {
        return fromAccountResult;
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
            'Westpac EFT direct debit amount must be between 0.01 and 9,999,999.99 NZD.',
            { amountCents }
          )
        );
      }

      let stored: StoredDirectDebitTransaction;

      try {
        stored = {
          fromAccount: fromAccountResult.value,
          amountCents,
          accountName: ensureRequiredAscii(
            'accountName',
            transaction.accountName,
            DETAIL_FIELD_WIDTHS[9]
          ),
          payerReference: normaliseUppercase(
            ensureOptionalAscii(
              'payerReference',
              transaction.payerReference,
              DETAIL_FIELD_WIDTHS[12]
            )
          ),
          payerAnalysis: normaliseUppercase(
            ensureOptionalAscii(
              'payerAnalysis',
              transaction.payerAnalysis,
              DETAIL_FIELD_WIDTHS[11]
            )
          ),
          payerParticulars: normaliseUppercase(
            ensureOptionalAscii(
              'payerParticulars',
              transaction.payerParticulars,
              DETAIL_FIELD_WIDTHS[10]
            )
          )
        };
      } catch (error) {
        return err(error as AdapterError | FieldError);
      }

      try {
        renderDirectDebitTransactionCsv({
          toAccount: normalised.toAccount,
          collectorName: normalised.customerName,
          sequenceNumber: '000002',
          transaction: stored
        });
      } catch (error) {
        return err(error as AdapterError | FieldError);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      return makeDirectDebitSummary(transactions);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const records = [
        renderHeaderCsv({ ...normalised, sequenceNumber: '000001' }),
        ...transactions.map((transaction, index) => {
          const sequenceNumber = String(index + 2).padStart(6, '0');

          return renderDirectDebitTransactionCsv({
            toAccount: normalised.toAccount,
            collectorName: normalised.customerName,
            sequenceNumber,
            transaction
          });
        })
      ];

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createPaymentCsvFile(
  config: WestpacPaymentFileConfig
): WestpacPaymentFile {
  return createDirectCreditFile(config);
}
