import { AdapterError } from '../../shared/errors.js';
import { err, ok, type Result } from '../../shared/result.js';
import { decomposeNzAccount, parseNzAccount } from '../../nz/account.js';
import { parseYyMmDd, parseYyyyMmDd } from '../../nz/date.js';
import { toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountError } from '../../shared/errors.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  AsbCreditTransactionCode,
  AsbDebitTransactionCode,
  AsbParseError,
  ParsedAsbDirectCreditFile,
  ParsedAsbDirectCreditTransaction,
  ParsedAsbDirectDebitContra,
  ParsedAsbDirectDebitFile,
  ParsedAsbDirectDebitTransaction,
  ParsedAsbOtherPartyDetails,
  ParsedAsbPartyDetails,
  ParseAsbDirectCreditFile,
  ParseAsbDirectDebitFile,
  ParseAsbFile
} from './types.js';

const HEADER_WIDTHS = [2, 15, 1, 13, 20, 109] as const;
const DETAIL_WIDTHS = [2, 2, 4, 7, 3, 3, 10, 20, 12, 12, 12, 12, 1, 20, 12, 12, 12, 4] as const;
const TRAILER_WIDTHS = [2, 2, 11, 6, 10, 129] as const;
const DETAIL_RECORD_TYPE = '13';
const TRAILER_KEY_FIELD = '99';

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

function sliceFields(line: string, widths: readonly number[], lineNumber: number) {
  const expectedWidth = widths.reduce((sum, width) => sum + width, 0);

  if (line.length !== expectedWidth) {
    return fail('Invalid ASB MT9 record width.', {
      lineNumber,
      expectedWidth,
      actualWidth: line.length
    });
  }

  const fields: string[] = [];
  let offset = 0;

  for (const width of widths) {
    fields.push(line.slice(offset, offset + width));
    offset += width;
  }

  return ok(fields);
}

function trimField(value: string): string {
  return value.trimEnd();
}

function parsePositiveInteger(field: string, fieldName: string, lineNumber: number): Result<bigint, AdapterError> {
  const trimmed = field.trim();

  if (!/^\d+$/.test(trimmed)) {
    return fail(`Invalid ASB MT9 ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      value: field
    });
  }

  return ok(BigInt(trimmed));
}

function parseAsbDueDate(value: string, lineNumber: number) {
  const trimmed = trimField(value);
  const parsed = trimmed.length === 6 ? parseYyMmDd(trimmed) : parseYyyyMmDd(trimmed);

  if (!parsed.ok) {
    return err(
      new AdapterError('ADAPTER_CONFIG', 'Invalid ASB MT9 due date.', {
        lineNumber,
        value: trimmed,
        cause: parsed.error
      })
    );
  }

  return parsed;
}

function parseAccountFields(
  bank: string,
  branch: string,
  base: string,
  suffix: string,
  lineNumber: number,
  role: string
): Result<NzAccountNumber, AdapterError | NzAccountError> {
  const parsed = parseNzAccount(`${bank}${branch}${base}${trimField(suffix)}`);

  if (!parsed.ok) {
    return err(
      new AdapterError('ADAPTER_CONFIG', `Invalid ASB MT9 ${role} account.`, {
        lineNumber,
        role,
        bank,
        branch,
        base,
        suffix,
        cause: parsed.error
      })
    );
  }

  return parsed;
}

function computeMt9ImportCheckTotal(accounts: readonly NzAccountNumber[]): bigint {
  let total = 0n;

  for (const account of accounts) {
    const parts = decomposeNzAccount(account);
    total = (total + BigInt(`${parts.branch}${parts.base}`)) % (10n ** 11n);
  }

  return total;
}

function buildDirectCreditSummary(transactions: readonly ParsedAsbDirectCreditTransaction[]): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0n);

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: computeMt9ImportCheckTotal(transactions.map((transaction) => transaction.toAccount))
  };
}

function buildDirectDebitSummary(
  transactions: readonly ParsedAsbDirectDebitTransaction[],
  contra?: ParsedAsbDirectDebitContra
): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0n);
  const accounts = contra === undefined
    ? transactions.map((transaction) => transaction.toAccount)
    : [...transactions.map((transaction) => transaction.toAccount), contra.account];

  return {
    count: transactions.length + (contra === undefined ? 0 : 1),
    totalCents: toCents(total + (contra === undefined ? 0n : contra.amount)),
    hashTotal: computeMt9ImportCheckTotal(accounts)
  };
}

function parsePartyDetails(
  fields: readonly string[],
  nameIndex: number,
  codeIndex: number,
  alphaIndex: number,
  particularsIndex: number
): ParsedAsbPartyDetails {
  return {
    name: trimField(fields[nameIndex] ?? ''),
    code: trimField(fields[codeIndex] ?? ''),
    alphaReference: trimField(fields[alphaIndex] ?? ''),
    particulars: trimField(fields[particularsIndex] ?? '')
  };
}

function parseOtherPartyDetails(
  fields: readonly string[],
  nameIndex: number,
  codeIndex: number,
  alphaIndex: number,
  particularsIndex: number
): ParsedAsbOtherPartyDetails {
  return {
    name: trimField(fields[nameIndex] ?? ''),
    code: trimField(fields[codeIndex] ?? ''),
    alphaReference: trimField(fields[alphaIndex] ?? ''),
    particulars: trimField(fields[particularsIndex] ?? '')
  };
}

function parseDirectCreditFileInternal(input: string | Buffer): Result<ParsedAsbDirectCreditFile, AsbParseError> {
  const lines = splitLines(input);

  if (lines.length < 2) {
    return fail('ASB MT9 direct credit file must contain at least a header and trailer record.');
  }

  const headerResult = sliceFields(lines[0]!, HEADER_WIDTHS, 1);

  if (!headerResult.ok) {
    return headerResult;
  }

  const header = headerResult.value;

  if ((header[0] ?? '') !== '12') {
    return fail('Invalid ASB MT9 direct credit file type.', {
      lineNumber: 1,
      value: header[0]
    });
  }

  const fromAccountResult = parseAccountFields(
    (header[1] ?? '').slice(0, 2),
    (header[1] ?? '').slice(2, 6),
    (header[1] ?? '').slice(6, 13),
    (header[1] ?? '').slice(13, 15),
    1,
    'origin'
  );

  if (!fromAccountResult.ok) {
    return fromAccountResult;
  }

  const dueDateResult = parseAsbDueDate(header[3] ?? '', 1);

  if (!dueDateResult.ok) {
    return dueDateResult;
  }

  const clientShortName = trimField(header[4] ?? '');
  const transactions: ParsedAsbDirectCreditTransaction[] = [];

  for (const [index, line] of lines.slice(1, -1).entries()) {
    const lineNumber = index + 2;
    const detailResult = sliceFields(line, DETAIL_WIDTHS, lineNumber);

    if (!detailResult.ok) {
      return detailResult;
    }

    const fields = detailResult.value;

    if ((fields[0] ?? '') !== DETAIL_RECORD_TYPE) {
      return fail('Invalid ASB MT9 direct credit detail record type.', {
        lineNumber,
        value: fields[0]
      });
    }

    const toAccountResult = parseAccountFields(
      fields[1] ?? '',
      fields[2] ?? '',
      fields[3] ?? '',
      fields[4] ?? '',
      lineNumber,
      'payee'
    );

    if (!toAccountResult.ok) {
      return toAccountResult;
    }

    const amountResult = parsePositiveInteger(fields[6] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    const transactionCode = trimField(fields[5] ?? '');

    if (!['051', '052'].includes(transactionCode)) {
      return fail('Invalid ASB MT9 direct credit transaction code.', {
        lineNumber,
        value: transactionCode
      });
    }

    transactions.push({
      toAccount: toAccountResult.value,
      amount: toCents(amountResult.value),
      transactionCode: transactionCode as AsbCreditTransactionCode,
      internalReference: trimField(fields[8] ?? ''),
      thisParty: parsePartyDetails(fields, 7, 9, 10, 11),
      otherParty: parseOtherPartyDetails(fields, 13, 14, 15, 16)
    });
  }

  const trailerLineNumber = lines.length;
  const trailerResult = sliceFields(lines.at(-1)!, TRAILER_WIDTHS, trailerLineNumber);

  if (!trailerResult.ok) {
    return trailerResult;
  }

  const trailer = trailerResult.value;

  if ((trailer[0] ?? '') !== DETAIL_RECORD_TYPE || (trailer[1] ?? '') !== TRAILER_KEY_FIELD) {
    return fail('Invalid ASB MT9 direct credit trailer record.', {
      lineNumber: trailerLineNumber,
      record: lines.at(-1)
    });
  }

  const hashResult = parsePositiveInteger(trailer[2] ?? '', 'hashTotal', trailerLineNumber);

  if (!hashResult.ok) {
    return hashResult;
  }

  const totalResult = parsePositiveInteger(trailer[4] ?? '', 'totalCents', trailerLineNumber);

  if (!totalResult.ok) {
    return totalResult;
  }

  const summary = buildDirectCreditSummary(transactions);

  if (hashResult.value !== summary.hashTotal) {
    return fail('ASB MT9 direct credit trailer hash does not match computed hash total.', {
      lineNumber: trailerLineNumber,
      expected: summary.hashTotal.toString(),
      actual: hashResult.value.toString()
    });
  }

  if (totalResult.value !== (summary.totalCents as bigint)) {
    return fail('ASB MT9 direct credit trailer total does not match computed total.', {
      lineNumber: trailerLineNumber,
      expected: (summary.totalCents as bigint).toString(),
      actual: totalResult.value.toString()
    });
  }

  return ok({
    kind: 'direct-credit',
    fromAccount: fromAccountResult.value,
    dueDate: dueDateResult.value,
    clientShortName,
    transactions,
    summary
  });
}

function parseDirectDebitFileInternal(input: string | Buffer): Result<ParsedAsbDirectDebitFile, AsbParseError> {
  const lines = splitLines(input);

  if (lines.length < 2) {
    return fail('ASB MT9 direct debit file must contain at least a header and trailer record.');
  }

  const headerResult = sliceFields(lines[0]!, HEADER_WIDTHS, 1);

  if (!headerResult.ok) {
    return headerResult;
  }

  const header = headerResult.value;

  if ((header[0] ?? '') !== '20') {
    return fail('Invalid ASB MT9 direct debit file type.', {
      lineNumber: 1,
      value: header[0]
    });
  }

  const registrationId = trimField(header[1] ?? '');

  if (!/^\d{15}$/.test(registrationId)) {
    return fail('Invalid ASB MT9 direct debit registrationId.', {
      lineNumber: 1,
      value: registrationId
    });
  }

  const dueDateResult = parseAsbDueDate(header[3] ?? '', 1);

  if (!dueDateResult.ok) {
    return dueDateResult;
  }

  const clientShortName = trimField(header[4] ?? '');
  const detailTransactions: ParsedAsbDirectDebitTransaction[] = [];
  let contra: ParsedAsbDirectDebitContra | undefined;

  for (const [index, line] of lines.slice(1, -1).entries()) {
    const lineNumber = index + 2;
    const detailResult = sliceFields(line, DETAIL_WIDTHS, lineNumber);

    if (!detailResult.ok) {
      return detailResult;
    }

    const fields = detailResult.value;

    if ((fields[0] ?? '') !== DETAIL_RECORD_TYPE) {
      return fail('Invalid ASB MT9 direct debit detail record type.', {
        lineNumber,
        value: fields[0]
      });
    }

    const accountResult = parseAccountFields(
      fields[1] ?? '',
      fields[2] ?? '',
      fields[3] ?? '',
      fields[4] ?? '',
      lineNumber,
      'receipt'
    );

    if (!accountResult.ok) {
      return accountResult;
    }

    const amountResult = parsePositiveInteger(fields[6] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    const transactionCode = trimField(fields[5] ?? '');

    if (transactionCode === '051') {
      if (contra !== undefined) {
        return fail('ASB MT9 direct debit file contains multiple contra records.', {
          lineNumber
        });
      }

      contra = {
        account: accountResult.value,
        amount: toCents(amountResult.value),
        transactionCode: '051',
        code: trimField(fields[9] ?? ''),
        alphaReference: trimField(fields[10] ?? ''),
        particulars: trimField(fields[11] ?? ''),
        otherPartyName: trimField(fields[13] ?? '')
      };

      continue;
    }

    if (transactionCode !== '000') {
      return fail('Invalid ASB MT9 direct debit transaction code.', {
        lineNumber,
        value: transactionCode
      });
    }

    if (trimField(fields[8] ?? '') !== '000000000000') {
      return fail('Invalid ASB MT9 this-party numeric reference field.', {
        lineNumber,
        value: fields[8]
      });
    }

    detailTransactions.push({
      toAccount: accountResult.value,
      amount: toCents(amountResult.value),
      transactionCode: '000' as AsbDebitTransactionCode,
      thisParty: parsePartyDetails(fields, 7, 9, 10, 11),
      otherParty: parseOtherPartyDetails(fields, 13, 14, 15, 16)
    });
  }

  const trailerLineNumber = lines.length;
  const trailerResult = sliceFields(lines.at(-1)!, TRAILER_WIDTHS, trailerLineNumber);

  if (!trailerResult.ok) {
    return trailerResult;
  }

  const trailer = trailerResult.value;

  if ((trailer[0] ?? '') !== DETAIL_RECORD_TYPE || (trailer[1] ?? '') !== TRAILER_KEY_FIELD) {
    return fail('Invalid ASB MT9 direct debit trailer record.', {
      lineNumber: trailerLineNumber,
      record: lines.at(-1)
    });
  }

  const hashResult = parsePositiveInteger(trailer[2] ?? '', 'hashTotal', trailerLineNumber);

  if (!hashResult.ok) {
    return hashResult;
  }

  const totalResult = parsePositiveInteger(trailer[4] ?? '', 'totalCents', trailerLineNumber);

  if (!totalResult.ok) {
    return totalResult;
  }

  const summary = buildDirectDebitSummary(detailTransactions, contra);

  if (hashResult.value !== summary.hashTotal) {
    return fail('ASB MT9 direct debit trailer hash does not match computed hash total.', {
      lineNumber: trailerLineNumber,
      expected: summary.hashTotal.toString(),
      actual: hashResult.value.toString()
    });
  }

  if (totalResult.value !== (summary.totalCents as bigint)) {
    return fail('ASB MT9 direct debit trailer total does not match computed total.', {
      lineNumber: trailerLineNumber,
      expected: (summary.totalCents as bigint).toString(),
      actual: totalResult.value.toString()
    });
  }

  if (
    contra !== undefined &&
    contra.amount !== detailTransactions.reduce((sum, transaction) => sum + transaction.amount, 0n)
  ) {
    return fail('ASB MT9 contra amount does not match the sum of direct debit transactions.', {
      lineNumber: trailerLineNumber,
      contraAmount: contra.amount.toString()
    });
  }

  return ok({
    kind: 'direct-debit',
    registrationId,
    dueDate: dueDateResult.value,
    clientShortName,
    transactions: detailTransactions,
    ...(contra === undefined ? {} : { contra }),
    summary
  });
}

export const parseFile: ParseAsbFile = (input) => {
  const lines = splitLines(input);

  if (lines.length === 0) {
    return fail('ASB MT9 file must not be empty.');
  }

  const fileType = lines[0]!.slice(0, 2);

  return fileType === '12'
    ? parseDirectCreditFileInternal(input)
    : fileType === '20'
      ? parseDirectDebitFileInternal(input)
      : fail('Unsupported ASB MT9 file type.', { fileType });
};

export const parseDirectCreditFile: ParseAsbDirectCreditFile = (input) => {
  const result = parseDirectCreditFileInternal(input);

  if (!result.ok) {
    return result;
  }

  return ok(result.value);
};

export const parseDirectDebitFile: ParseAsbDirectDebitFile = (input) => {
  const result = parseDirectDebitFileInternal(input);

  if (!result.ok) {
    return result;
  }

  return ok(result.value);
};