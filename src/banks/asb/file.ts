import { AdapterError } from '../../shared/errors.js';
import type { FixedWidthFieldInput } from '../../shared/fixed-width.js';
import { renderFixedWidthRecord } from '../../shared/fixed-width.js';
import { renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok } from '../../shared/result.js';
import { assertNzAccount, decomposeNzAccount, parseNzAccount } from '../../nz/account.js';
import { assertYyMmDd, assertYyyyMmDd } from '../../nz/date.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  AsbCreditTransactionCode,
  AsbDirectCreditFileConfig,
  AsbDirectCreditTransaction,
  AsbDirectDebitFileConfig,
  AsbDirectDebitTransaction,
  AsbDueDate,
  AsbFile,
  AsbOtherPartyDetails,
  AsbPartyDetails,
  CreateAsbFileConfig
} from './types.js';

const ASB_ALLOWED_PATTERN = /^[0-9A-Za-z ()*+\-=?[\]_{}~/&,.']*$/;
const MAX_AMOUNT = 9_999_999_999n;
const HASH_LIMIT = 10n ** 11n;

type StoredDirectCreditTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly transactionCode: AsbCreditTransactionCode;
  readonly internalReference: string;
  readonly thisParty: AsbPartyDetails;
  readonly otherParty: Required<AsbOtherPartyDetails>;
};

type StoredDirectDebitTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly thisParty: AsbPartyDetails;
  readonly otherParty: Required<AsbOtherPartyDetails>;
};

type StoredDirectDebitContra = {
  readonly account: NzAccountNumber;
  readonly code: string;
  readonly alphaReference: string;
  readonly particulars: string;
  readonly otherPartyName: string;
};

function createAsbField(
  name: string,
  length: number,
  value: string | bigint,
  options?: {
    readonly align?: 'left' | 'right';
    readonly pad?: string;
    readonly truncate?: boolean;
    readonly required?: boolean;
  }
): FixedWidthFieldInput {
  return {
    value,
    spec: {
      name,
      length,
      allowedPattern: ASB_ALLOWED_PATTERN,
      ...(options?.align !== undefined ? { align: options.align } : {}),
      ...(options?.pad !== undefined ? { pad: options.pad } : {}),
      ...(options?.truncate !== undefined ? { truncate: options.truncate } : {}),
      ...(options?.required !== undefined ? { required: options.required } : {})
    }
  };
}

function assertAsbDueDate(input: string | AsbDueDate): AsbDueDate {
  const trimmed = String(input).trim();
  return trimmed.length === 6 ? assertYyMmDd(trimmed) : assertYyyyMmDd(trimmed);
}

function computeMt9ImportCheckTotal(accounts: readonly NzAccountNumber[]): bigint {
  let total = 0n;

  for (const account of accounts) {
    const parts = decomposeNzAccount(account);
    total = (total + BigInt(`${parts.branch}${parts.base}`)) % HASH_LIMIT;
  }

  return total;
}

function renderHeaderSuffix(account: NzAccountNumber): string {
  const { suffix } = decomposeNzAccount(account);

  if (suffix.length !== 2) {
    throw new AdapterError(
      'ADAPTER_CONFIG',
      'ASB MT9 header and contra accounts must use a 2-digit suffix.',
      { account }
    );
  }

  return suffix.padEnd(3, ' ');
}

function renderDetailSuffix(account: NzAccountNumber): string {
  const { suffix } = decomposeNzAccount(account);
  return suffix.length === 2 ? suffix.padEnd(3, ' ') : suffix.padStart(3, '0');
}

function normaliseCreditOtherParty(
  clientShortName: string,
  otherParty?: AsbOtherPartyDetails
): Required<AsbOtherPartyDetails> {
  return {
    name: otherParty?.name ?? clientShortName,
    code: otherParty?.code ?? '',
    alphaReference: otherParty?.alphaReference ?? '',
    particulars: otherParty?.particulars ?? ''
  };
}

function normaliseDebitOtherParty(
  otherParty?: AsbOtherPartyDetails
): Required<AsbOtherPartyDetails> {
  return {
    name: otherParty?.name ?? '',
    code: otherParty?.code ?? '',
    alphaReference: otherParty?.alphaReference ?? '',
    particulars: otherParty?.particulars ?? ''
  };
}

function validateRegistrationId(input: string): string {
  const trimmed = input.trim();

  if (!/^\d{15}$/.test(trimmed)) {
    throw new AdapterError('ADAPTER_CONFIG', 'ASB MT9 direct debit registrationId must be 15 digits.', {
      registrationId: input
    });
  }

  return trimmed;
}

function renderDirectCreditHeaderRecord(config: {
  readonly fromAccount: NzAccountNumber;
  readonly dueDate: AsbDueDate;
  readonly clientShortName: string;
}) {
  const parts = decomposeNzAccount(config.fromAccount);

  return renderFixedWidthRecord([
    createAsbField('fileType', 2, '12', { required: true }),
    createAsbField('bankNumber', 2, parts.bankId, { required: true }),
    createAsbField('branchNumber', 4, parts.branch, { required: true }),
    createAsbField('uniqueNumber', 7, parts.base, { required: true }),
    createAsbField('suffix', 3, renderHeaderSuffix(config.fromAccount), { required: true }),
    createAsbField('dueDate', 13, config.dueDate, { required: true }),
    createAsbField('clientShortName', 20, config.clientShortName, { truncate: true }),
    createAsbField('filler', 109, '')
  ]);
}

function renderDirectCreditDetailRecord(transaction: StoredDirectCreditTransaction) {
  const parts = decomposeNzAccount(transaction.toAccount);

  return renderFixedWidthRecord([
    createAsbField('recordType', 2, '13', { required: true }),
    createAsbField('bankNumber', 2, parts.bankId, { required: true }),
    createAsbField('branchNumber', 4, parts.branch, { required: true }),
    createAsbField('uniqueNumber', 7, parts.base, { required: true }),
    createAsbField('suffix', 3, renderDetailSuffix(transaction.toAccount), { required: true }),
    createAsbField('transactionCode', 3, transaction.transactionCode, {
      align: 'right',
      pad: '0',
      required: true
    }),
    createAsbField('amount', 10, transaction.amountCents, {
      align: 'right',
      pad: '0',
      required: true
    }),
    createAsbField('payeeName', 20, transaction.thisParty.name, { truncate: true, required: true }),
    createAsbField('internalReference', 12, transaction.internalReference, { truncate: true }),
    createAsbField('payeeCode', 12, transaction.thisParty.code, { truncate: true, required: true }),
    createAsbField('payeeReference', 12, transaction.thisParty.alphaReference ?? '', { truncate: true }),
    createAsbField('payeeParticulars', 12, transaction.thisParty.particulars ?? '', { truncate: true }),
    createAsbField('filler', 1, ''),
    createAsbField('payerName', 20, transaction.otherParty.name, { truncate: true }),
    createAsbField('payerCode', 12, transaction.otherParty.code, { truncate: true }),
    createAsbField('payerReference', 12, transaction.otherParty.alphaReference, { truncate: true }),
    createAsbField('payerParticulars', 12, transaction.otherParty.particulars, { truncate: true }),
    createAsbField('endFiller', 4, '')
  ]);
}

function renderDirectDebitHeaderRecord(config: {
  readonly registrationId: string;
  readonly dueDate: AsbDueDate;
  readonly clientShortName: string;
}) {
  return renderFixedWidthRecord([
    createAsbField('fileType', 2, '20', { required: true }),
    createAsbField('registrationId', 15, config.registrationId, { required: true }),
    createAsbField('filler', 1, ''),
    createAsbField('dueDate', 13, config.dueDate, { required: true }),
    createAsbField('clientShortName', 20, config.clientShortName, { truncate: true }),
    createAsbField('endFiller', 109, '')
  ]);
}

function renderDirectDebitDetailRecord(transaction: StoredDirectDebitTransaction) {
  const parts = decomposeNzAccount(transaction.toAccount);

  return renderFixedWidthRecord([
    createAsbField('recordType', 2, '13', { required: true }),
    createAsbField('bankNumber', 2, parts.bankId, { required: true }),
    createAsbField('branchNumber', 4, parts.branch, { required: true }),
    createAsbField('uniqueNumber', 7, parts.base, { required: true }),
    createAsbField('suffix', 3, renderDetailSuffix(transaction.toAccount), { required: true }),
    createAsbField('transactionCode', 3, '000', { required: true }),
    createAsbField('amount', 10, transaction.amountCents, {
      align: 'right',
      pad: '0',
      required: true
    }),
    createAsbField('payerName', 20, transaction.thisParty.name, { truncate: true, required: true }),
    createAsbField('numericReference', 12, '000000000000', { required: true }),
    createAsbField('payerCode', 12, transaction.thisParty.code, { truncate: true, required: true }),
    createAsbField('payerReference', 12, transaction.thisParty.alphaReference ?? '', { truncate: true }),
    createAsbField('payerParticulars', 12, transaction.thisParty.particulars ?? '', { truncate: true }),
    createAsbField('filler', 1, ''),
    createAsbField('otherPartyName', 20, transaction.otherParty.name, { truncate: true }),
    createAsbField('payeeCode', 12, transaction.otherParty.code, { truncate: true }),
    createAsbField('payeeReference', 12, transaction.otherParty.alphaReference, { truncate: true }),
    createAsbField('payeeParticulars', 12, transaction.otherParty.particulars, { truncate: true }),
    createAsbField('endFiller', 4, '')
  ]);
}

function renderDirectDebitContraRecord(contra: StoredDirectDebitContra, amountCents: bigint) {
  const parts = decomposeNzAccount(contra.account);

  return renderFixedWidthRecord([
    createAsbField('recordType', 2, '13', { required: true }),
    createAsbField('bankNumber', 2, parts.bankId, { required: true }),
    createAsbField('branchNumber', 4, parts.branch, { required: true }),
    createAsbField('uniqueNumber', 7, parts.base, { required: true }),
    createAsbField('suffix', 3, renderHeaderSuffix(contra.account), { required: true }),
    createAsbField('transactionCode', 3, '051', { required: true }),
    createAsbField('amount', 10, amountCents, {
      align: 'right',
      pad: '0',
      required: true
    }),
    createAsbField('thisPartyName', 20, ''),
    createAsbField('numericReference', 12, '000000000000', { required: true }),
    createAsbField('payeeCode', 12, contra.code, { truncate: true }),
    createAsbField('payeeReference', 12, contra.alphaReference, { truncate: true }),
    createAsbField('payeeParticulars', 12, contra.particulars, { truncate: true }),
    createAsbField('filler', 1, ''),
    createAsbField('otherPartyName', 20, contra.otherPartyName, { truncate: true }),
    createAsbField('otherPartyCode', 12, ''),
    createAsbField('otherPartyReference', 12, ''),
    createAsbField('otherPartyParticulars', 12, ''),
    createAsbField('endFiller', 4, '')
  ]);
}

function renderTrailerRecord(summary: BatchFileSummary) {
  return renderFixedWidthRecord([
    createAsbField('recordType', 2, '13', { required: true }),
    createAsbField('keyField', 2, '99', { required: true }),
    createAsbField('hashTotal', 11, summary.hashTotal.toString().padStart(11, '0'), { required: true }),
    createAsbField('filler', 6, ''),
    createAsbField('totalAmount', 10, summary.totalCents as bigint, {
      align: 'right',
      pad: '0',
      required: true
    }),
    createAsbField('endFiller', 129, '')
  ]);
}

function summarizeDirectCredit(transactions: readonly StoredDirectCreditTransaction[]): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0n);

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: computeMt9ImportCheckTotal(transactions.map((transaction) => transaction.toAccount))
  };
}

function summarizeDirectDebit(
  transactions: readonly StoredDirectDebitTransaction[],
  contra?: StoredDirectDebitContra
): BatchFileSummary {
  const detailTotal = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0n);
  const accounts = contra === undefined
    ? transactions.map((transaction) => transaction.toAccount)
    : [...transactions.map((transaction) => transaction.toAccount), contra.account];

  return {
    count: transactions.length + (contra === undefined ? 0 : 1),
    totalCents: toCents(detailTotal + (contra === undefined ? 0n : detailTotal)),
    hashTotal: computeMt9ImportCheckTotal(accounts)
  };
}

export function createDirectCreditFile(
  config: AsbDirectCreditFileConfig
): AsbFile<AsbDirectCreditTransaction> {
  const fromAccount = assertNzAccount(config.fromAccount);
  const dueDate = assertAsbDueDate(config.dueDate);
  const clientShortName = config.clientShortName ?? '';
  renderHeaderSuffix(fromAccount);

  const headerValidation = renderDirectCreditHeaderRecord({ fromAccount, dueDate, clientShortName });

  if (!headerValidation.ok) {
    throw new AdapterError('ADAPTER_CONFIG', headerValidation.error.message, {
      cause: headerValidation.error
    });
  }

  const transactions: StoredDirectCreditTransaction[] = [];

  const file: AsbFile<AsbDirectCreditTransaction> = {
    kind: 'direct-credit',
    addTransaction(transaction) {
      const accountResult = parseNzAccount(transaction.toAccount);

      if (!accountResult.ok) {
        return accountResult;
      }

      const amountResult = parseCents(transaction.amount);

      if (!amountResult.ok) {
        return amountResult;
      }

      const amountCents = amountResult.value as bigint;

      if (amountCents <= 0n || amountCents > MAX_AMOUNT) {
        return err(
          new AdapterError('ADAPTER_TRANSACTION', 'ASB MT9 transaction amount must be between 1 and 9,999,999,999 cents.', {
            amountCents
          })
        );
      }

      const transactionCode = transaction.transactionCode ?? '051';

      if (!['051', '052'].includes(transactionCode)) {
        return err(
          new AdapterError('ADAPTER_TRANSACTION', `Invalid ASB MT9 transaction code ${transactionCode} for direct-credit.`, {
            transactionCode
          })
        );
      }

      const nextTotal = transactions.reduce((total, item) => total + item.amountCents, 0n) + amountCents;

      if (nextTotal > MAX_AMOUNT) {
        return err(
          new AdapterError('ADAPTER_TRANSACTION', 'ASB MT9 batch total exceeds the maximum supported amount.', {
            totalCents: nextTotal
          })
        );
      }

      const stored: StoredDirectCreditTransaction = {
        toAccount: accountResult.value,
        amountCents,
        transactionCode,
        internalReference: transaction.internalReference ?? '',
        thisParty: {
          name: transaction.thisParty.name,
          code: transaction.thisParty.code,
          ...(transaction.thisParty.alphaReference !== undefined
            ? { alphaReference: transaction.thisParty.alphaReference }
            : {}),
          ...(transaction.thisParty.particulars !== undefined
            ? { particulars: transaction.thisParty.particulars }
            : {})
        },
        otherParty: normaliseCreditOtherParty(clientShortName, transaction.otherParty)
      };

      const detailValidation = renderDirectCreditDetailRecord(stored);

      if (!detailValidation.ok) {
        return err(detailValidation.error);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      return summarizeDirectCredit(transactions);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const summary = file.summary();
      const records = [
        renderDirectCreditHeaderRecord({ fromAccount, dueDate, clientShortName }),
        ...transactions.map((transaction) => renderDirectCreditDetailRecord(transaction)),
        renderTrailerRecord(summary)
      ].map((record) => {
        if (!record.ok) {
          throw record.error;
        }

        return record.value;
      });

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createDirectDebitFile(
  config: AsbDirectDebitFileConfig
): AsbFile<AsbDirectDebitTransaction> {
  const registrationId = validateRegistrationId(config.registrationId);
  const dueDate = assertAsbDueDate(config.dueDate);
  const clientShortName = config.clientShortName ?? '';
  const contra = config.contra === undefined
    ? undefined
    : {
        account: assertNzAccount(config.contra.account),
        code: config.contra.code ?? '',
        alphaReference: config.contra.alphaReference ?? '',
        particulars: config.contra.particulars ?? '',
        otherPartyName: config.contra.otherPartyName ?? ''
      } satisfies StoredDirectDebitContra;

  const headerValidation = renderDirectDebitHeaderRecord({ registrationId, dueDate, clientShortName });

  if (!headerValidation.ok) {
    throw new AdapterError('ADAPTER_CONFIG', headerValidation.error.message, {
      cause: headerValidation.error
    });
  }

  if (contra !== undefined) {
    renderHeaderSuffix(contra.account);
  }

  const transactions: StoredDirectDebitTransaction[] = [];

  const file: AsbFile<AsbDirectDebitTransaction> = {
    kind: 'direct-debit',
    addTransaction(transaction) {
      const accountResult = parseNzAccount(transaction.toAccount);

      if (!accountResult.ok) {
        return accountResult;
      }

      const amountResult = parseCents(transaction.amount);

      if (!amountResult.ok) {
        return amountResult;
      }

      const amountCents = amountResult.value as bigint;

      if (amountCents <= 0n || amountCents > MAX_AMOUNT) {
        return err(
          new AdapterError('ADAPTER_TRANSACTION', 'ASB MT9 transaction amount must be between 1 and 9,999,999,999 cents.', {
            amountCents
          })
        );
      }

      const detailTotal = transactions.reduce((total, item) => total + item.amountCents, 0n) + amountCents;
      const trailerTotal = contra === undefined ? detailTotal : detailTotal * 2n;

      if (trailerTotal > MAX_AMOUNT) {
        return err(
          new AdapterError('ADAPTER_TRANSACTION', 'ASB MT9 receipt trailer total exceeds the maximum supported amount.', {
            totalCents: trailerTotal
          })
        );
      }

      const stored: StoredDirectDebitTransaction = {
        toAccount: accountResult.value,
        amountCents,
        thisParty: {
          name: transaction.thisParty.name,
          code: transaction.thisParty.code,
          ...(transaction.thisParty.alphaReference !== undefined
            ? { alphaReference: transaction.thisParty.alphaReference }
            : {}),
          ...(transaction.thisParty.particulars !== undefined
            ? { particulars: transaction.thisParty.particulars }
            : {})
        },
        otherParty: normaliseDebitOtherParty(transaction.otherParty)
      };

      const detailValidation = renderDirectDebitDetailRecord(stored);

      if (!detailValidation.ok) {
        return err(detailValidation.error);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      return summarizeDirectDebit(transactions, contra);
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const detailTotal = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0n);
      const summary = file.summary();
      const records = [
        renderDirectDebitHeaderRecord({ registrationId, dueDate, clientShortName }),
        ...transactions.map((transaction) => renderDirectDebitDetailRecord(transaction)),
        ...(contra === undefined ? [] : [renderDirectDebitContraRecord(contra, detailTotal)]),
        renderTrailerRecord(summary)
      ].map((record) => {
        if (!record.ok) {
          throw record.error;
        }

        return record.value;
      });

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createFile(config: CreateAsbFileConfig): AsbFile {
  return config.type === 'direct-credit'
  ? (createDirectCreditFile(config) as AsbFile)
  : (createDirectDebitFile(config) as AsbFile);
}