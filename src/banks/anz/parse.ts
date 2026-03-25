import { AdapterError } from '../../shared/errors.js';
import { err, ok, type Result } from '../../shared/result.js';
import { isValidNzBankBranch } from '../../nz/banks.js';
import { assertYyyyMmDd } from '../../nz/date.js';
import { toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountError } from '../../shared/errors.js';
import type {
  AnzDomesticExtendedFileError,
  AnzDomesticExtendedTransactionCode,
  ParsedAnzDomesticExtendedFile,
  ParsedAnzDomesticExtendedTransaction
} from './types.js';

const RECORD_TYPE_HEADER = '1';
const RECORD_TYPE_TRANSACTION = '2';
const RECORD_TYPE_TRAILER = '3';

function fail(message: string, context?: Record<string, unknown>) {
  return err(new AdapterError('ADAPTER_CONFIG', message, context));
}

function splitLines(input: string | Buffer): string[] {
  const text = typeof input === 'string' ? input : input.toString('utf8');
  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

function parseDate(field: string, fieldName: string, lineNumber: number) {
  try {
    return ok(assertYyyyMmDd(field));
  } catch (error) {
    return err(
      new AdapterError('ADAPTER_CONFIG', `Invalid ANZ domestic extended ${fieldName}.`, {
        lineNumber,
        field: fieldName,
        value: field,
        cause: error
      })
    );
  }
}

function parsePositiveInteger(field: string, fieldName: string, lineNumber: number) {
  if (!/^\d+$/.test(field)) {
    return fail(`Invalid ANZ domestic extended ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      value: field
    });
  }

  return ok(BigInt(field));
}

function parseRenderedAccount(
  rendered: string,
  lineNumber: number
): Result<{ readonly toAccount: string; readonly hashContribution: bigint }, AdapterError | NzAccountError> {
  if (!/^\d{16,17}$/.test(rendered)) {
    return fail('Invalid ANZ domestic extended rendered account.', {
      lineNumber,
      value: rendered
    });
  }

  const bankId = rendered.slice(0, 2);
  const branch = rendered.slice(2, 6);
  const base = rendered.slice(6, -3);
  const suffixDigits = rendered.slice(-3);

  if (!/^\d{7,8}$/.test(base) || !isValidNzBankBranch(bankId, branch)) {
    return fail('Invalid ANZ domestic extended account structure.', {
      lineNumber,
      value: rendered,
      bankId,
      branch,
      base
    });
  }

  const suffixValue = Number(suffixDigits);

  if (!/^\d{3}$/.test(suffixDigits) || suffixValue > 99) {
    return fail('Invalid ANZ domestic extended account suffix.', {
      lineNumber,
      value: rendered,
      suffix: suffixDigits
    });
  }

  const suffix = String(suffixValue).padStart(2, '0');
  const hashBase = base.length === 8 ? base.slice(1) : base;

  return ok({
    toAccount: `${bankId}-${branch}-${base}-${suffix}`,
    hashContribution: BigInt(`${branch}${hashBase}`)
  });
}

function normaliseHashTotal(value: bigint): bigint {
  const digits = value.toString();
  return BigInt(digits.length > 11 ? digits.slice(-11) : digits.padStart(11, '0'));
}

function buildSummary(transactions: readonly { readonly amount: bigint; readonly hashContribution: bigint }[]): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0n);
  const hash = transactions.reduce((sum, transaction) => sum + transaction.hashContribution, 0n);

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: normaliseHashTotal(hash)
  };
}

export function parseDomesticExtendedFile(
  input: string | Buffer
): Result<ParsedAnzDomesticExtendedFile, AnzDomesticExtendedFileError> {
  const lines = splitLines(input);

  if (lines.length < 2) {
    return fail('ANZ domestic extended file must contain at least a header and control record.');
  }

  const header = lines[0]!.split(',');

  if (header.length !== 9 || header[0] !== RECORD_TYPE_HEADER) {
    return fail('Invalid ANZ domestic extended header record.', {
      lineNumber: 1,
      record: lines[0]
    });
  }

  const batchDueDateResult = parseDate(header[6] ?? '', 'batchDueDate', 1);

  if (!batchDueDateResult.ok) {
    return batchDueDateResult;
  }

  const batchCreationDateResult = parseDate(header[7] ?? '', 'batchCreationDate', 1);

  if (!batchCreationDateResult.ok) {
    return batchCreationDateResult;
  }

  const transactions: (ParsedAnzDomesticExtendedTransaction & {
    readonly hashContribution: bigint;
    readonly amountRaw: bigint;
  })[] = [];

  for (const [index, line] of lines.slice(1, -1).entries()) {
    const lineNumber = index + 2;
    const fields = line.split(',');

    if (fields[0] !== RECORD_TYPE_TRANSACTION) {
      return fail('Invalid ANZ domestic extended transaction record type.', {
        lineNumber,
        value: fields[0]
      });
    }

    while (fields.length < 13) {
      fields.push('');
    }

    if (fields.length > 13) {
      return fail('Invalid ANZ domestic extended transaction field count.', {
        lineNumber,
        fieldCount: fields.length
      });
    }

    const accountResult = parseRenderedAccount(fields[1] ?? '', lineNumber);

    if (!accountResult.ok) {
      return accountResult;
    }

    const amountResult = parsePositiveInteger(fields[3] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    const transactionCode = (fields[2] ?? '') as AnzDomesticExtendedTransactionCode;

    if (!['50', '52', '00'].includes(transactionCode)) {
      return fail('Unsupported ANZ domestic extended transaction code.', {
        lineNumber,
        value: fields[2]
      });
    }

    transactions.push({
      toAccount: accountResult.value.toAccount,
      renderedAccount: fields[1] ?? '',
      amount: toCents(amountResult.value),
      transactionCode,
      otherPartyName: fields[4] ?? '',
      otherPartyReference: fields[5] ?? '',
      otherPartyAnalysisCode: fields[6] ?? '',
      otherPartyAlphaReference: fields[7] ?? '',
      otherPartyParticulars: fields[8] ?? '',
      subscriberName: fields[9] ?? '',
      subscriberAnalysisCode: fields[10] ?? '',
      subscriberReference: fields[11] ?? '',
      subscriberParticulars: fields[12] ?? '',
      hashContribution: accountResult.value.hashContribution,
      amountRaw: amountResult.value
    });
  }

  const controlLineNumber = lines.length;
  const control = lines.at(-1)!.split(',');

  if (control.length !== 4 || control[0] !== RECORD_TYPE_TRAILER) {
    return fail('Invalid ANZ domestic extended control record.', {
      lineNumber: controlLineNumber,
      record: lines.at(-1)
    });
  }

  const totalResult = parsePositiveInteger(control[1] ?? '', 'totalCents', controlLineNumber);

  if (!totalResult.ok) {
    return totalResult;
  }

  const countResult = parsePositiveInteger(control[2] ?? '', 'count', controlLineNumber);

  if (!countResult.ok) {
    return countResult;
  }

  const hashResult = parsePositiveInteger(control[3] ?? '', 'hashTotal', controlLineNumber);

  if (!hashResult.ok) {
    return hashResult;
  }

  const summary = buildSummary(
    transactions.map((transaction) => ({
      amount: transaction.amountRaw,
      hashContribution: transaction.hashContribution
    }))
  );

  if (countResult.value !== BigInt(transactions.length)) {
    return fail('ANZ domestic extended control count does not match transaction count.', {
      lineNumber: controlLineNumber,
      expected: transactions.length,
      actual: Number(countResult.value)
    });
  }

  if (totalResult.value !== (summary.totalCents as bigint)) {
    return fail('ANZ domestic extended control total does not match transaction total.', {
      lineNumber: controlLineNumber,
      expected: (summary.totalCents as bigint).toString(),
      actual: totalResult.value.toString()
    });
  }

  if (hashResult.value !== summary.hashTotal) {
    return fail('ANZ domestic extended control hash does not match computed hash total.', {
      lineNumber: controlLineNumber,
      expected: summary.hashTotal.toString(),
      actual: hashResult.value.toString()
    });
  }

  return ok({
    kind: 'domestic-extended',
    batchDueDate: batchDueDateResult.value,
    batchCreationDate: batchCreationDateResult.value,
    transactions: transactions.map((transaction) => ({
      toAccount: transaction.toAccount,
      renderedAccount: transaction.renderedAccount,
      amount: transaction.amount,
      transactionCode: transaction.transactionCode,
      otherPartyName: transaction.otherPartyName,
      otherPartyReference: transaction.otherPartyReference,
      otherPartyAnalysisCode: transaction.otherPartyAnalysisCode,
      otherPartyAlphaReference: transaction.otherPartyAlphaReference,
      otherPartyParticulars: transaction.otherPartyParticulars,
      subscriberName: transaction.subscriberName,
      subscriberAnalysisCode: transaction.subscriberAnalysisCode,
      subscriberReference: transaction.subscriberReference,
      subscriberParticulars: transaction.subscriberParticulars
    })),
    summary
  });
}

export const parseFile = parseDomesticExtendedFile;