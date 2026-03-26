import {
  AdapterError,
  FieldError,
  NzAccountError
} from '../../shared/errors.js';
import { renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok } from '../../shared/result.js';
import { assertYyyyMmDd } from '../../nz/date.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import { isValidNzBankBranch } from '../../nz/banks.js';
import type { DateInput, YyyyMmDd } from '../../nz/types.js';
import type {
  AnzDirectCreditFile,
  AnzDirectCreditFileConfig,
  AnzDirectCreditTransaction,
  AnzDirectDebitFile,
  AnzDirectDebitFileConfig,
  AnzDirectDebitTransaction,
  AnzDomesticExtendedFile,
  AnzDomesticExtendedFileConfig,
  AnzDomesticExtendedTransaction,
  AnzDomesticExtendedTransactionCode
} from './types.js';

const RECORD_TYPE_HEADER = '1';
const RECORD_TYPE_TRANSACTION = '2';
const RECORD_TYPE_TRAILER = '3';
const DEFAULT_TRANSACTION_CODE: AnzDomesticExtendedTransactionCode = '50';
const MAX_TRANSACTION_CENTS = 9_999_999_999n;
const ALLOWED_TEXT_PATTERN = /^[ -~]*$/;
const FORBIDDEN_TEXT_CHARACTERS = [
  ',',
  '[',
  ']',
  '{',
  '}',
  '\\',
  '|',
  '`',
  '~',
  '^'
] as const;

type StoredTransaction = {
  readonly renderedAccount: string;
  readonly amountCents: bigint;
  readonly transactionCode: AnzDomesticExtendedTransactionCode;
  readonly otherPartyName: string;
  readonly otherPartyReference: string;
  readonly otherPartyAnalysisCode: string;
  readonly otherPartyAlphaReference: string;
  readonly otherPartyParticulars: string;
  readonly subscriberName: string;
  readonly subscriberAnalysisCode: string;
  readonly subscriberReference: string;
  readonly subscriberParticulars: string;
  readonly hashContribution: bigint;
};

type ParsedAnzDomesticExtendedAccount = {
  readonly rendered: string;
  readonly hashContribution: bigint;
};

function currentYyyyMmDd(): YyyyMmDd {
  return assertYyyyMmDd(new Date());
}

function failAccount(message: string, input: string): NzAccountError {
  return new NzAccountError('NZ_ACCOUNT_FORMAT', message, { input });
}

function parseAnzDomesticExtendedAccount(
  input: string
): ParsedAnzDomesticExtendedAccount {
  const trimmed = input.trim();
  const segmented = trimmed
    .split(/[-\s]+/)
    .filter((segment) => segment.length > 0);

  let bankId: string;
  let branch: string;
  let base: string;
  let suffix: string;

  if (
    segmented.length === 4 &&
    segmented.every((segment) => /^\d+$/.test(segment))
  ) {
    bankId = segmented[0]!;
    branch = segmented[1]!;
    base = segmented[2]!;
    suffix = segmented[3]!;
  } else {
    const digits = trimmed.replace(/[-\s]+/g, '');

    if (!/^\d+$/.test(digits)) {
      throw failAccount('Account number must contain digits only.', input);
    }

    if (digits.length === 15) {
      bankId = digits.slice(0, 2);
      branch = digits.slice(2, 6);
      base = digits.slice(6, 13);
      suffix = digits.slice(13, 15);
    } else if (digits.length === 16) {
      bankId = digits.slice(0, 2);
      branch = digits.slice(2, 6);
      base = digits.slice(6, 13);
      suffix = digits.slice(13, 16);
    } else if (digits.length === 17) {
      bankId = digits.slice(0, 2);
      branch = digits.slice(2, 6);
      base = digits.slice(6, 14);
      suffix = digits.slice(14, 17);
    } else {
      throw failAccount(
        'ANZ domestic extended account number must be 15, 16, or 17 digits.',
        input
      );
    }
  }

  if (!/^\d{2}$/.test(bankId) || !/^\d{4}$/.test(branch)) {
    throw failAccount(
      'ANZ domestic extended account must contain a 2-digit bank and 4-digit branch.',
      input
    );
  }

  if (!/^\d{7,8}$/.test(base)) {
    throw failAccount(
      'ANZ domestic extended account base must be 7 or 8 digits.',
      input
    );
  }

  if (!/^\d{2,3}$/.test(suffix)) {
    throw failAccount(
      'ANZ domestic extended account suffix must be 2 or 3 digits.',
      input
    );
  }

  if (Number(suffix) > 99) {
    throw failAccount(
      'ANZ domestic extended account suffix cannot be greater than 99.',
      input
    );
  }

  if (!isValidNzBankBranch(bankId, branch)) {
    throw new NzAccountError(
      'NZ_ACCOUNT_BRANCH',
      'ANZ domestic extended account has an invalid NZ bank/branch combination.',
      {
        input,
        bankId,
        branch
      }
    );
  }

  const renderedSuffix = suffix.padStart(3, '0');
  const hashBase = base.length === 8 ? base.slice(1) : base;

  return {
    rendered: `${bankId}${branch}${base}${renderedSuffix}`,
    hashContribution: BigInt(`${branch}${hashBase}`)
  };
}

function normaliseText(
  field: string,
  value: string | undefined,
  maxLength: number,
  required = false
): string {
  const normalised = (value ?? '').trim().toUpperCase();

  if (required && normalised.length === 0) {
    throw new FieldError('FIELD_REQUIRED', `Field ${field} is required.`, {
      field
    });
  }

  if (
    !ALLOWED_TEXT_PATTERN.test(normalised) ||
    FORBIDDEN_TEXT_CHARACTERS.some((character) =>
      normalised.includes(character)
    )
  ) {
    throw new FieldError(
      'FIELD_ASCII',
      `Field ${field} contains unsupported characters.`,
      {
        field,
        value
      }
    );
  }

  if (normalised.length > maxLength) {
    throw new FieldError(
      'FIELD_LENGTH',
      `Field ${field} exceeds max length ${String(maxLength)}.`,
      {
        field,
        value: normalised,
        maxLength
      }
    );
  }

  return normalised;
}

function renderHeaderRecord(config: {
  readonly batchDueDate: YyyyMmDd;
  readonly batchCreationDate: YyyyMmDd;
}): string {
  return [
    RECORD_TYPE_HEADER,
    '',
    '',
    '',
    '',
    '',
    config.batchDueDate,
    config.batchCreationDate,
    ''
  ].join(',');
}

function renderTransactionRecord(transaction: StoredTransaction): string {
  const fields = [
    RECORD_TYPE_TRANSACTION,
    transaction.renderedAccount,
    transaction.transactionCode,
    transaction.amountCents.toString(),
    transaction.otherPartyName,
    transaction.otherPartyReference,
    transaction.otherPartyAnalysisCode,
    transaction.otherPartyAlphaReference,
    transaction.otherPartyParticulars,
    transaction.subscriberName,
    transaction.subscriberAnalysisCode,
    transaction.subscriberReference,
    transaction.subscriberParticulars
  ];

  while (fields.length > 5 && fields.at(-1) === '') {
    fields.pop();
  }

  return fields.join(',');
}

function normaliseHashTotal(value: bigint): bigint {
  const digits = value.toString();
  return BigInt(
    digits.length > 11 ? digits.slice(-11) : digits.padStart(11, '0')
  );
}

function renderControlRecord(summary: BatchFileSummary): string {
  return [
    RECORD_TYPE_TRAILER,
    (summary.totalCents as bigint).toString(),
    String(summary.count),
    summary.hashTotal.toString().padStart(11, '0')
  ].join(',');
}

export function createDomesticExtendedFile(
  config: AnzDomesticExtendedFileConfig
): AnzDomesticExtendedFile {
  const batchDueDate = assertYyyyMmDd(config.batchDueDate as DateInput);
  const batchCreationDate =
    config.batchCreationDate !== undefined
      ? assertYyyyMmDd(config.batchCreationDate as DateInput)
      : currentYyyyMmDd();

  renderHeaderRecord({ batchDueDate, batchCreationDate });

  const transactions: StoredTransaction[] = [];

  const file: AnzDomesticExtendedFile = {
    kind: 'domestic-extended',
    addTransaction(transaction: AnzDomesticExtendedTransaction) {
      let parsedAccount: ParsedAnzDomesticExtendedAccount;

      try {
        parsedAccount = parseAnzDomesticExtendedAccount(transaction.toAccount);
      } catch (error) {
        return err(error as NzAccountError);
      }

      const amountResult = parseCents(transaction.amount);

      if (!amountResult.ok) {
        return amountResult;
      }

      const amountCents = amountResult.value as bigint;

      if (amountCents <= 0n || amountCents > MAX_TRANSACTION_CENTS) {
        return err(
          new AdapterError(
            'ADAPTER_TRANSACTION',
            'ANZ domestic extended amount must be between 0.01 and 99,999,999.99 NZD.',
            {
              amountCents
            }
          )
        );
      }

      try {
        const stored: StoredTransaction = {
          renderedAccount: parsedAccount.rendered,
          hashContribution: parsedAccount.hashContribution,
          amountCents,
          transactionCode:
            transaction.transactionCode ?? DEFAULT_TRANSACTION_CODE,
          otherPartyName: normaliseText(
            'otherPartyName',
            transaction.otherPartyName,
            20,
            true
          ),
          otherPartyReference: normaliseText(
            'otherPartyReference',
            transaction.otherPartyReference,
            12
          ),
          otherPartyAnalysisCode: normaliseText(
            'otherPartyAnalysisCode',
            transaction.otherPartyAnalysisCode,
            12
          ),
          otherPartyAlphaReference: normaliseText(
            'otherPartyAlphaReference',
            transaction.otherPartyAlphaReference,
            12
          ),
          otherPartyParticulars: normaliseText(
            'otherPartyParticulars',
            transaction.otherPartyParticulars,
            12
          ),
          subscriberName: normaliseText(
            'subscriberName',
            transaction.subscriberName,
            20
          ),
          subscriberAnalysisCode: normaliseText(
            'subscriberAnalysisCode',
            transaction.subscriberAnalysisCode,
            12
          ),
          subscriberReference: normaliseText(
            'subscriberReference',
            transaction.subscriberReference,
            12
          ),
          subscriberParticulars: normaliseText(
            'subscriberParticulars',
            transaction.subscriberParticulars,
            12
          )
        };

        if (!['50', '52', '00'].includes(stored.transactionCode)) {
          return err(
            new AdapterError(
              'ADAPTER_TRANSACTION',
              `Unsupported ANZ domestic extended transaction code ${stored.transactionCode}.`,
              {
                transactionCode: stored.transactionCode
              }
            )
          );
        }

        renderTransactionRecord(stored);
        transactions.push(stored);
        return ok(undefined);
      } catch (error) {
        return err(error as FieldError | AdapterError);
      }
    },
    summary() {
      const total = transactions.reduce(
        (sum, transaction) => sum + transaction.amountCents,
        0n
      );
      const hashRaw = transactions.reduce(
        (sum, transaction) => sum + transaction.hashContribution,
        0n
      );

      return {
        count: transactions.length,
        totalCents: toCents(total),
        hashTotal: normaliseHashTotal(hashRaw)
      };
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const summary = file.summary();
      const records = [
        renderHeaderRecord({ batchDueDate, batchCreationDate }),
        ...transactions.map((transaction) =>
          renderTransactionRecord(transaction)
        ),
        renderControlRecord(summary)
      ];

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createDirectCreditFile(
  config: AnzDirectCreditFileConfig
): AnzDirectCreditFile {
  const file = createDomesticExtendedFile(config);

  return {
    kind: 'domestic-extended',
    addTransaction(transaction: AnzDirectCreditTransaction) {
      return file.addTransaction({
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        ...(transaction.transactionCode !== undefined
          ? { transactionCode: transaction.transactionCode }
          : {}),
        otherPartyName: transaction.payeeName,
        ...(transaction.payeeReference !== undefined
          ? { otherPartyReference: transaction.payeeReference }
          : {}),
        ...(transaction.payeeAnalysis !== undefined
          ? { otherPartyAnalysisCode: transaction.payeeAnalysis }
          : {}),
        ...(transaction.payeeCode !== undefined
          ? { otherPartyAlphaReference: transaction.payeeCode }
          : {}),
        ...(transaction.payeeParticulars !== undefined
          ? { otherPartyParticulars: transaction.payeeParticulars }
          : {}),
        ...(transaction.originatorName !== undefined
          ? { subscriberName: transaction.originatorName }
          : {}),
        ...(transaction.originatorAnalysis !== undefined
          ? { subscriberAnalysisCode: transaction.originatorAnalysis }
          : {}),
        ...(transaction.originatorReference !== undefined
          ? { subscriberReference: transaction.originatorReference }
          : {}),
        ...(transaction.originatorParticulars !== undefined
          ? { subscriberParticulars: transaction.originatorParticulars }
          : {})
      } satisfies AnzDomesticExtendedTransaction);
    },
    summary() {
      return file.summary();
    },
    toBuffer(options?: RenderFileOptions) {
      return file.toBuffer(options);
    },
    toString(options?: RenderFileOptions) {
      return file.toString(options);
    }
  };
}

export function createDirectDebitFile(
  config: AnzDirectDebitFileConfig
): AnzDirectDebitFile {
  const file = createDomesticExtendedFile(config);

  return {
    kind: 'direct-debit',
    addTransaction(transaction: AnzDirectDebitTransaction) {
      return file.addTransaction({
        toAccount: transaction.fromAccount,
        amount: transaction.amount,
        transactionCode: '00',
        otherPartyName: transaction.organisationName,
        ...(transaction.customerReference !== undefined
          ? { otherPartyReference: transaction.customerReference }
          : {}),
        subscriberName: transaction.organisationName
      } satisfies AnzDomesticExtendedTransaction);
    },
    summary() {
      return file.summary();
    },
    toBuffer(options?: RenderFileOptions) {
      return file.toBuffer(options);
    },
    toString(options?: RenderFileOptions) {
      return file.toString(options);
    }
  };
}

export const createFile = createDomesticExtendedFile;
