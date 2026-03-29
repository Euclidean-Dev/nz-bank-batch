import { AdapterError, FieldError } from '../../shared/errors.js';
import { renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok } from '../../shared/result.js';
import {
  assertNzAccount,
  assertNzBankAccount,
  decomposeNzAccount
} from '../../nz/account.js';
import { assertDdMmYy, assertDdMmYyyy } from '../../nz/date.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  TsbDirectCreditFile,
  TsbDirectCreditFileConfig,
  TsbDirectCreditTransaction,
  TsbFile,
  TsbFileConfig,
  TsbTrailerRecordType
} from './types.js';

const ASCII_PRINTABLE = /^[ -~]*$/;
const MAX_AMOUNT_CENTS = 99_999_999_999n;

type StoredTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly batchNumber: string;
  readonly originatingBank: string;
  readonly originatingBranch: string;
  readonly originatorAccount?: NzAccountNumber;
  readonly status: '' | 'N';
  readonly inputDate: string;
};

function ensureAscii(name: string, value: string): string {
  const trimmed = value.trimEnd();

  if (!ASCII_PRINTABLE.test(trimmed)) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${name} must contain printable ASCII only.`,
      { field: name, value }
    );
  }

  if (trimmed.includes(',') || trimmed.includes('"')) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${name} must not contain commas or double quotes.`,
      { field: name, value }
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

function formatDigits(
  name: string,
  value: string | number | undefined,
  width: number,
  required = false
): string {
  if (value === undefined || value === '') {
    if (required) {
      throw new FieldError('FIELD_REQUIRED', `Field ${name} is required.`, {
        field: name
      });
    }

    return '';
  }

  const digits = String(value).trim();

  if (!/^\d+$/.test(digits)) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${name} must contain digits only.`,
      { field: name, value }
    );
  }

  if (digits.length > width) {
    throw new FieldError(
      'FIELD_LENGTH',
      `Field ${name} exceeds max length ${String(width)}.`,
      {
        field: name,
        value,
        maxLength: width
      }
    );
  }

  return digits.padStart(width, '0');
}

function formatAmount(amountCents: bigint): string {
  if (amountCents < 0n || amountCents > MAX_AMOUNT_CENTS) {
    throw new FieldError('FIELD_LENGTH', 'Field amount exceeds max length 11.', {
      field: 'amount',
      value: amountCents.toString(),
      maxLength: 11
    });
  }

  return amountCents.toString().padStart(11, '0');
}

function renderCsvRecord(fields: readonly string[]): string {
  return fields.join(',');
}

function currentDdMmYy(): string {
  return assertDdMmYy(new Date());
}

function headerHashFromDueDate(dueDate: string): string {
  const day = Number(dueDate.slice(0, 2));
  const month = Number(dueDate.slice(2, 4));
  const year = Number(dueDate.slice(4, 6));

  return String(day + month + year).padStart(3, '0');
}

function trailerHashFromTransactions(
  transactions: readonly StoredTransaction[]
): bigint {
  return BigInt(
    transactions.reduce((sum, transaction) => {
      const parts = decomposeNzAccount(transaction.toAccount);
      return sum + Number(parts.paddedBase.at(-1) ?? '0');
    }, 0)
  );
}

function makeSummary(transactions: readonly StoredTransaction[]): BatchFileSummary {
  const total = transactions.reduce(
    (sum, transaction) => sum + transaction.amountCents,
    0n
  );

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: trailerHashFromTransactions(transactions)
  };
}

function validateFileConfig(config: TsbDirectCreditFileConfig) {
  return {
    fromAccount: assertNzBankAccount(config.fromAccount, ['15'] as const),
    originatorName: ensureRequiredAscii(
      'originatorName',
      config.originatorName,
      20
    ),
    dueDate: assertDdMmYy(config.dueDate ?? currentDdMmYy()),
    batchNumber: formatDigits('batchNumber', config.batchNumber, 4),
    trailerRecordType: config.trailerRecordType ?? 'T' satisfies TsbTrailerRecordType
  };
}

function validateTransaction(
  transaction: TsbDirectCreditTransaction
): StoredTransaction {
  const amountResult = parseCents(transaction.amount);

  if (!amountResult.ok) {
    throw amountResult.error;
  }

  return {
    toAccount: assertNzAccount(transaction.toAccount),
    amountCents: amountResult.value,
    accountName: ensureRequiredAscii('accountName', transaction.accountName, 20),
    particulars: ensureRequiredAscii('particulars', transaction.particulars, 12),
    code: ensureOptionalAscii('code', transaction.code, 12),
    reference: ensureOptionalAscii('reference', transaction.reference, 12),
    batchNumber: formatDigits('batchNumber', transaction.batchNumber, 4),
    originatingBank: formatDigits('originatingBank', transaction.originatingBank, 2),
    originatingBranch: formatDigits(
      'originatingBranch',
      transaction.originatingBranch,
      4
    ),
    ...(transaction.originatorAccount !== undefined
      ? { originatorAccount: assertNzAccount(transaction.originatorAccount) }
      : {}),
    status: transaction.status ?? '',
    inputDate:
      transaction.inputDate !== undefined && transaction.inputDate !== ''
        ? assertDdMmYyyy(transaction.inputDate)
        : ''
  };
}

function renderHeader(config: ReturnType<typeof validateFileConfig>): string {
  const parts = decomposeNzAccount(config.fromAccount);

  return renderCsvRecord([
    'A',
    '0',
    config.dueDate,
    config.batchNumber,
    headerHashFromDueDate(config.dueDate),
    parts.bankId,
    parts.branch,
    parts.paddedBase,
    parts.paddedSuffix,
    '0000',
    ''
  ]);
}

function renderDetail(
  fileConfig: ReturnType<typeof validateFileConfig>,
  transaction: StoredTransaction
): string {
  const creditParts = decomposeNzAccount(transaction.toAccount);
  const originatorParts =
    transaction.originatorAccount !== undefined
      ? decomposeNzAccount(transaction.originatorAccount)
      : undefined;

  return renderCsvRecord([
    'D',
    '0',
    creditParts.bankId,
    creditParts.branch,
    creditParts.paddedBase,
    creditParts.paddedSuffix,
    '000000',
    formatAmount(transaction.amountCents),
    '',
    transaction.originatingBank,
    transaction.originatingBranch,
    transaction.batchNumber || fileConfig.batchNumber,
    transaction.accountName,
    transaction.particulars,
    transaction.code,
    transaction.reference,
    fileConfig.originatorName,
    '0',
    originatorParts?.bankId ?? '',
    originatorParts?.branch ?? '',
    originatorParts?.paddedBase ?? '',
    originatorParts?.paddedSuffix ?? '',
    transaction.status,
    transaction.inputDate,
    ''
  ]);
}

function renderTrailer(
  trailerRecordType: TsbTrailerRecordType,
  summary: BatchFileSummary
): string {
  return renderCsvRecord([
    trailerRecordType,
    formatDigits('count', summary.count, 4, true),
    formatAmount(summary.totalCents),
    formatDigits('hashTotal', summary.hashTotal.toString(), 4, true),
    ''
  ]);
}

export function createDirectCreditFile(
  config: TsbDirectCreditFileConfig
): TsbDirectCreditFile {
  const fileConfig = validateFileConfig(config);
  const transactions: StoredTransaction[] = [];

  return {
    kind: 'direct-credit',
    addTransaction(transaction) {
      try {
        const stored = validateTransaction(transaction);
        transactions.push(stored);
        return ok(undefined);
      } catch (error) {
        if (error instanceof Error) {
          return err(error as never);
        }

        throw error;
      }
    },
    summary() {
      return makeSummary(transactions);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(this.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      if (transactions.length === 0) {
        throw new AdapterError(
          'ADAPTER_CONFIG',
          'TSB direct credit file must contain at least one detail record.'
        );
      }

      const summary = makeSummary(transactions);

      return renderCsvFile(
        [
          renderHeader(fileConfig),
          ...transactions.map((transaction) => renderDetail(fileConfig, transaction)),
          renderTrailer(fileConfig.trailerRecordType, summary)
        ],
        options
      );
    }
  };
}

export const createFile = createDirectCreditFile satisfies (
  config: TsbFileConfig
) => TsbFile;