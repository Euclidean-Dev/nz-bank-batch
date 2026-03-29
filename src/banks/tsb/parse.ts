import { AdapterError } from '../../shared/errors.js';
import { err, ok, type Result } from '../../shared/result.js';
import { parseNzAccount } from '../../nz/account.js';
import { parseDdMmYy, parseDdMmYyyy } from '../../nz/date.js';
import { toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountError } from '../../shared/errors.js';
import type { NzAccountNumber } from '../../nz/types.js';
import type {
  ParsedTsbDirectCreditFile,
  ParsedTsbDirectCreditTransaction,
  ParseTsbDirectCreditFile,
  ParseTsbFile,
  TsbTrailerRecordType
} from './types.js';

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

function parseCsvLine(
  line: string,
  lineNumber: number
): Result<string[], AdapterError> {
  if (line.includes('"')) {
    return fail('TSB text qualifiers are not supported.', {
      lineNumber,
      record: line
    });
  }

  return ok(line.split(','));
}

function requireFieldCount(
  fields: readonly string[],
  count: number,
  lineNumber: number,
  recordType: string
): Result<void, AdapterError> {
  if (fields.length !== count) {
    return fail(`Invalid TSB ${recordType} field count.`, {
      lineNumber,
      fieldCount: fields.length,
      expected: count
    });
  }

  return ok(undefined);
}

function requireLiteral(
  field: string,
  expected: string,
  fieldName: string,
  lineNumber: number
): Result<void, AdapterError> {
  if (field !== expected) {
    return fail(`Invalid TSB ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      expected,
      actual: field
    });
  }

  return ok(undefined);
}

function parseDigits(
  field: string,
  fieldName: string,
  maxLength: number,
  lineNumber: number,
  allowEmpty = false
): Result<string, AdapterError> {
  if (field.length === 0) {
    if (allowEmpty) {
      return ok('');
    }

    return fail(`Missing TSB ${fieldName}.`, { lineNumber, field: fieldName });
  }

  if (!/^\d+$/.test(field) || field.length > maxLength) {
    return fail(`Invalid TSB ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      value: field,
      maxLength
    });
  }

  return ok(field);
}

function parseAccount(
  bank: string,
  branch: string,
  account: string,
  suffix: string,
  lineNumber: number,
  role: string
): Result<NzAccountNumber, AdapterError | NzAccountError> {
  const parsed = parseNzAccount(`${bank}${branch}${account}${suffix}`);

  if (!parsed.ok) {
    return err(
      new AdapterError('ADAPTER_CONFIG', `Invalid TSB ${role} account.`, {
        lineNumber,
        role,
        bank,
        branch,
        account,
        suffix,
        cause: parsed.error
      })
    );
  }

  return parsed;
}

function headerHashFromDueDate(dueDate: string): string {
  const day = Number(dueDate.slice(0, 2));
  const month = Number(dueDate.slice(2, 4));
  const year = Number(dueDate.slice(4, 6));

  return String(day + month + year).padStart(3, '0');
}

function buildSummary(
  transactions: readonly ParsedTsbDirectCreditTransaction[]
): BatchFileSummary {
  const total = transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0n
  );

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: 0n
  };
}

function parseHeader(line: string) {
  const fieldsResult = parseCsvLine(line, 1);

  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const fields = fieldsResult.value;
  const countResult = requireFieldCount(fields, 11, 1, 'header');

  if (!countResult.ok) {
    return countResult;
  }

  const recordResult = requireLiteral(fields[0] ?? '', 'A', 'recordType', 1);
  if (!recordResult.ok) return recordResult;
  const spareResult = requireLiteral(fields[1] ?? '', '0', 'spare', 1);
  if (!spareResult.ok) return spareResult;
  const dueDateResult = parseDigits(fields[2] ?? '', 'dueDate', 6, 1);
  if (!dueDateResult.ok) return dueDateResult;
  const dueDateValidity = parseDdMmYy(dueDateResult.value);
  if (!dueDateValidity.ok) return err(dueDateValidity.error);
  const batchNumberResult = parseDigits(fields[3] ?? '', 'batchNumber', 4, 1, true);
  if (!batchNumberResult.ok) return batchNumberResult;
  const hashResult = parseDigits(fields[4] ?? '', 'headerHashTotal', 3, 1);
  if (!hashResult.ok) return hashResult;
  const debitBankResult = parseDigits(fields[5] ?? '', 'debitBank', 2, 1);
  if (!debitBankResult.ok) return debitBankResult;
  const debitBranchResult = parseDigits(fields[6] ?? '', 'debitBranch', 4, 1);
  if (!debitBranchResult.ok) return debitBranchResult;
  const debitAccountResult = parseDigits(fields[7] ?? '', 'debitAccount', 8, 1);
  if (!debitAccountResult.ok) return debitAccountResult;
  const debitSuffixResult = parseDigits(fields[8] ?? '', 'debitSuffix', 4, 1);
  if (!debitSuffixResult.ok) return debitSuffixResult;
  const secondSpare = requireLiteral(fields[9] ?? '', '0000', 'spare2', 1);
  if (!secondSpare.ok) return secondSpare;
  const filler = requireLiteral(fields[10] ?? '', '', 'filler', 1);
  if (!filler.ok) return filler;

  const expectedHash = headerHashFromDueDate(dueDateResult.value);

  if (hashResult.value !== expectedHash) {
    return fail('TSB header hash total does not match due date.', {
      lineNumber: 1,
      expected: expectedHash,
      actual: hashResult.value
    });
  }

  const fromAccountResult = parseAccount(
    debitBankResult.value,
    debitBranchResult.value,
    debitAccountResult.value,
    debitSuffixResult.value,
    1,
    'debit'
  );

  if (!fromAccountResult.ok) {
    return fromAccountResult;
  }

  return ok({
    fromAccount: fromAccountResult.value,
    dueDate: dueDateResult.value,
    batchNumber: batchNumberResult.value
  });
}

function parseDetail(line: string, lineNumber: number) {
  const fieldsResult = parseCsvLine(line, lineNumber);

  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const fields = fieldsResult.value;
  const countResult = requireFieldCount(fields, 25, lineNumber, 'detail');

  if (!countResult.ok) {
    return countResult;
  }

  const recordResult = requireLiteral(fields[0] ?? '', 'D', 'recordType', lineNumber);
  if (!recordResult.ok) return recordResult;
  const spareResult = requireLiteral(fields[1] ?? '', '0', 'spare', lineNumber);
  if (!spareResult.ok) return spareResult;
  const creditBankResult = parseDigits(fields[2] ?? '', 'creditBank', 2, lineNumber);
  if (!creditBankResult.ok) return creditBankResult;
  const creditBranchResult = parseDigits(fields[3] ?? '', 'creditBranch', 4, lineNumber);
  if (!creditBranchResult.ok) return creditBranchResult;
  const creditAccountResult = parseDigits(fields[4] ?? '', 'creditAccount', 8, lineNumber);
  if (!creditAccountResult.ok) return creditAccountResult;
  const creditSuffixResult = parseDigits(fields[5] ?? '', 'creditSuffix', 4, lineNumber);
  if (!creditSuffixResult.ok) return creditSuffixResult;
  const spare1 = requireLiteral(fields[6] ?? '', '000000', 'spare1', lineNumber);
  if (!spare1.ok) return spare1;
  const amountResult = parseDigits(fields[7] ?? '', 'amount', 11, lineNumber);
  if (!amountResult.ok) return amountResult;
  const spare2 = requireLiteral(fields[8] ?? '', '', 'spare2', lineNumber);
  if (!spare2.ok) return spare2;
  const originatingBankResult = parseDigits(fields[9] ?? '', 'originatingBank', 2, lineNumber, true);
  if (!originatingBankResult.ok) return originatingBankResult;
  const originatingBranchResult = parseDigits(fields[10] ?? '', 'originatingBranch', 4, lineNumber, true);
  if (!originatingBranchResult.ok) return originatingBranchResult;
  const batchNumberResult = parseDigits(fields[11] ?? '', 'batchNumber', 4, lineNumber, true);
  if (!batchNumberResult.ok) return batchNumberResult;
  const accountName = fields[12] ?? '';
  const particulars = fields[13] ?? '';
  const code = fields[14] ?? '';
  const reference = fields[15] ?? '';
  const originatorName = fields[16] ?? '';
  const spare3 = requireLiteral(fields[17] ?? '', '0', 'spare3', lineNumber);
  if (!spare3.ok) return spare3;
  const otherBankResult = parseDigits(fields[18] ?? '', 'otherPartyBank', 2, lineNumber, true);
  if (!otherBankResult.ok) return otherBankResult;
  const otherBranchResult = parseDigits(fields[19] ?? '', 'otherPartyBranch', 4, lineNumber, true);
  if (!otherBranchResult.ok) return otherBranchResult;
  const otherAccountResult = parseDigits(fields[20] ?? '', 'otherPartyAccount', 8, lineNumber, true);
  if (!otherAccountResult.ok) return otherAccountResult;
  const otherSuffixResult = parseDigits(fields[21] ?? '', 'otherPartySuffix', 4, lineNumber, true);
  if (!otherSuffixResult.ok) return otherSuffixResult;
  const status = fields[22] ?? '';
  const inputDate = fields[23] ?? '';
  const spare4 = requireLiteral(fields[24] ?? '', '', 'spare4', lineNumber);
  if (!spare4.ok) return spare4;

  const toAccountResult = parseAccount(
    creditBankResult.value,
    creditBranchResult.value,
    creditAccountResult.value,
    creditSuffixResult.value,
    lineNumber,
    'credit'
  );

  if (!toAccountResult.ok) {
    return toAccountResult;
  }

  let originatorAccount;

  if (
    otherBankResult.value !== '' ||
    otherBranchResult.value !== '' ||
    otherAccountResult.value !== '' ||
    otherSuffixResult.value !== ''
  ) {
    if (
      otherBankResult.value === '' ||
      otherBranchResult.value === '' ||
      otherAccountResult.value === '' ||
      otherSuffixResult.value === ''
    ) {
      return fail('TSB detail originator override account must be complete.', {
        lineNumber
      });
    }

    const originatorAccountResult = parseAccount(
      otherBankResult.value,
      otherBranchResult.value,
      otherAccountResult.value,
      otherSuffixResult.value,
      lineNumber,
      'originator override'
    );

    if (!originatorAccountResult.ok) {
      return originatorAccountResult;
    }

    originatorAccount = originatorAccountResult.value;
  }

  if (accountName.length === 0 || accountName.length > 20) {
    return fail('Invalid TSB accountName.', { lineNumber, value: accountName });
  }

  if (particulars.length === 0 || particulars.length > 12) {
    return fail('Invalid TSB particulars.', { lineNumber, value: particulars });
  }

  if (code.length > 12) {
    return fail('Invalid TSB code.', { lineNumber, value: code });
  }

  if (reference.length > 12) {
    return fail('Invalid TSB reference.', { lineNumber, value: reference });
  }

  if (originatorName.length === 0 || originatorName.length > 20) {
    return fail('Invalid TSB originator name.', { lineNumber, value: originatorName });
  }

  if (status !== '' && status !== 'N') {
    return fail('Invalid TSB status.', { lineNumber, value: status });
  }

  if (inputDate !== '') {
    const inputDateValidity = parseDdMmYyyy(inputDate);

    if (!inputDateValidity.ok) {
      return err(inputDateValidity.error);
    }
  }

  return ok({
    transaction: {
      toAccount: toAccountResult.value,
      amount: toCents(BigInt(amountResult.value)),
      accountName,
      particulars,
      code,
      reference,
      batchNumber: batchNumberResult.value,
      originatingBank: originatingBankResult.value,
      originatingBranch: originatingBranchResult.value,
      ...(originatorAccount !== undefined ? { originatorAccount } : {}),
      status,
      inputDate
    } satisfies ParsedTsbDirectCreditTransaction,
    originatorName,
    lastAccountDigit: Number(creditAccountResult.value.at(-1) ?? '0')
  });
}

function parseTrailer(line: string, lineNumber: number) {
  const fieldsResult = parseCsvLine(line, lineNumber);

  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const fields = fieldsResult.value;
  const countResult = requireFieldCount(fields, 5, lineNumber, 'trailer');

  if (!countResult.ok) {
    return countResult;
  }

  const recordType = fields[0] ?? '';

  if (recordType !== 'S' && recordType !== 'T') {
    return fail('Invalid TSB trailer record type.', {
      lineNumber,
      value: recordType
    });
  }

  const numberResult = parseDigits(fields[1] ?? '', 'number', 4, lineNumber);
  if (!numberResult.ok) return numberResult;
  const amountResult = parseDigits(fields[2] ?? '', 'amount', 11, lineNumber);
  if (!amountResult.ok) return amountResult;
  const hashResult = parseDigits(fields[3] ?? '', 'hashTotal', 4, lineNumber);
  if (!hashResult.ok) return hashResult;
  const filler = requireLiteral(fields[4] ?? '', '', 'filler', lineNumber);
  if (!filler.ok) return filler;

  return ok({
    trailerRecordType: recordType as TsbTrailerRecordType,
    count: Number(numberResult.value),
    totalCents: toCents(BigInt(amountResult.value)),
    hashTotal: BigInt(hashResult.value)
  });
}

export const parseDirectCreditFile: ParseTsbDirectCreditFile = (input) => {
  const lines = splitLines(input);

  if (lines.length < 3) {
    return fail(
      'TSB direct credit file must contain a header, at least one detail record, and a trailer.'
    );
  }

  const headerResult = parseHeader(lines[0] ?? '');

  if (!headerResult.ok) {
    return headerResult;
  }

  const trailerResult = parseTrailer(lines.at(-1) ?? '', lines.length);

  if (!trailerResult.ok) {
    return trailerResult;
  }

  const detailLines = lines.slice(1, -1);
  const transactions: ParsedTsbDirectCreditTransaction[] = [];
  let originatorName: string | undefined;
  let hashTotal = 0n;

  for (const [index, line] of detailLines.entries()) {
    const detailResult = parseDetail(line, index + 2);

    if (!detailResult.ok) {
      return detailResult;
    }

    transactions.push(detailResult.value.transaction);
    hashTotal += BigInt(detailResult.value.lastAccountDigit);

    if (originatorName === undefined) {
      originatorName = detailResult.value.originatorName;
    } else if (originatorName !== detailResult.value.originatorName) {
      return fail('TSB file contains mixed originator names.', {
        lineNumber: index + 2,
        expected: originatorName,
        actual: detailResult.value.originatorName
      });
    }
  }

  const summary = buildSummary(transactions);
  const summaryWithHash = {
    ...summary,
    hashTotal
  } satisfies BatchFileSummary;

  if (trailerResult.value.count !== summaryWithHash.count) {
    return fail('TSB trailer count does not match detail rows.', {
      expected: summaryWithHash.count,
      actual: trailerResult.value.count
    });
  }

  if (trailerResult.value.totalCents !== summaryWithHash.totalCents) {
    return fail('TSB trailer amount does not match detail total.', {
      expected: summaryWithHash.totalCents.toString(),
      actual: trailerResult.value.totalCents.toString()
    });
  }

  if (trailerResult.value.hashTotal !== summaryWithHash.hashTotal) {
    return fail('TSB trailer hash total does not match detail rows.', {
      expected: summaryWithHash.hashTotal.toString(),
      actual: trailerResult.value.hashTotal.toString()
    });
  }

  return ok({
    kind: 'direct-credit',
    fromAccount: headerResult.value.fromAccount,
    originatorName: originatorName ?? '',
    dueDate: headerResult.value.dueDate,
    batchNumber: headerResult.value.batchNumber,
    trailerRecordType: trailerResult.value.trailerRecordType,
    transactions,
    summary: summaryWithHash
  } satisfies ParsedTsbDirectCreditFile);
};

export const parseFile: ParseTsbFile = parseDirectCreditFile;