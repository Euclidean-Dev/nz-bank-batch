import { AdapterError, DateError } from './errors.js';
import { err, ok, type Result } from './result.js';
import { parseNzAccount } from '../nz/account.js';
import { assertYyMmDd } from '../nz/date.js';
import { computeBranchBaseHashTotal } from '../nz/hash-total.js';
import { toCents } from '../nz/money.js';
import type { BatchFileSummary } from './batch-file.js';
import type { NzAccountError } from './errors.js';
import type { Cents, NzAccountNumber, YyMmDd } from '../nz/types.js';

type Ib4bTransactionCode = 'DC' | 'DD';
type Ib4bFileType = 'direct-credit' | 'direct-debit';

export type ParsedIb4bTransaction = {
  readonly counterpartyAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly information: string;
};

export type ParsedIb4bFile = {
  readonly kind: Ib4bFileType;
  readonly transactionCode: Ib4bTransactionCode;
  readonly fromAccount: NzAccountNumber;
  readonly originatorName: string;
  readonly reference: string;
  readonly processDate: YyMmDd;
  readonly effectiveDate: YyMmDd;
  readonly transactions: readonly ParsedIb4bTransaction[];
  readonly summary: BatchFileSummary;
};

export type Ib4bParseError = AdapterError | DateError | NzAccountError;

function fail(message: string, context?: Record<string, unknown>) {
  return err(new AdapterError('ADAPTER_CONFIG', message, context));
}

function splitRecords(input: string | Buffer): string[] {
  const text = typeof input === 'string' ? input : input.toString('utf8');
  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

function parseFieldCount(
  line: string,
  expected: number,
  recordType: string,
  lineNumber: number
): Result<string[], AdapterError> {
  const fields = line.split(',');

  if (fields.length !== expected) {
    return fail(`Invalid IB4B ${recordType} record field count.`, {
      lineNumber,
      expected,
      actual: fields.length,
      record: line
    });
  }

  return ok(fields);
}

function parseAccount(field: string, fieldName: string, lineNumber: number) {
  const parsed = parseNzAccount(field);

  if (!parsed.ok) {
    return err(
      new AdapterError('ADAPTER_CONFIG', `Invalid IB4B ${fieldName}.`, {
        lineNumber,
        field: fieldName,
        value: field,
        cause: parsed.error
      })
    );
  }

  return parsed;
}

function parseDate(field: string, fieldName: string, lineNumber: number) {
  try {
    return ok(assertYyMmDd(field));
  } catch (error) {
    return err(
      new AdapterError('ADAPTER_CONFIG', `Invalid IB4B ${fieldName}.`, {
        lineNumber,
        field: fieldName,
        value: field,
        cause: error
      })
    );
  }
}

function parsePositiveInteger(
  field: string,
  fieldName: string,
  lineNumber: number
) {
  if (!/^\d+$/.test(field)) {
    return fail(`Invalid IB4B ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      value: field
    });
  }

  return ok(BigInt(field));
}

function mapTransactionCode(
  renderedCode: string,
  lineNumber: number
): Result<
  {
    readonly kind: Ib4bFileType;
    readonly transactionCode: Ib4bTransactionCode;
  },
  AdapterError
> {
  if (renderedCode === '50') {
    return ok({ kind: 'direct-credit', transactionCode: 'DC' });
  }

  if (renderedCode === '00') {
    return ok({ kind: 'direct-debit', transactionCode: 'DD' });
  }

  return fail('Unsupported IB4B transaction code.', {
    lineNumber,
    field: 'transactionCode',
    value: renderedCode
  });
}

export function parseIb4bFile(
  input: string | Buffer
): Result<ParsedIb4bFile, Ib4bParseError> {
  const lines = splitRecords(input);

  if (lines.length < 3) {
    return fail(
      'IB4B file must contain a header, at least one detail record, and a trailer.'
    );
  }

  const headerResult = parseFieldCount(lines[0]!, 9, 'header', 1);

  if (!headerResult.ok) {
    return headerResult;
  }

  const header = headerResult.value;

  if (header[0] !== '1') {
    return fail('IB4B header record must start with record type 1.', {
      lineNumber: 1,
      value: header[0]
    });
  }

  if (header[5] !== '7') {
    return fail('IB4B header control field must be 7.', {
      lineNumber: 1,
      field: 'control',
      value: header[5]
    });
  }

  const fromAccountResult = parseAccount(header[4]!, 'fromAccount', 1);

  if (!fromAccountResult.ok) {
    return fromAccountResult;
  }

  const processDateResult = parseDate(header[6]!, 'processDate', 1);

  if (!processDateResult.ok) {
    return processDateResult;
  }

  const effectiveDateResult = parseDate(header[7]!, 'effectiveDate', 1);

  if (!effectiveDateResult.ok) {
    return effectiveDateResult;
  }

  const detailLines = lines.slice(1, -1);

  if (detailLines.length === 0) {
    return fail('IB4B file must contain at least one detail record.');
  }

  const transactions: ParsedIb4bTransaction[] = [];
  let parsedType:
    | {
        readonly kind: Ib4bFileType;
        readonly transactionCode: Ib4bTransactionCode;
      }
    | undefined;
  let originatorName: string | undefined;

  for (const [index, line] of detailLines.entries()) {
    const lineNumber = index + 2;
    const detailResult = parseFieldCount(line, 13, 'detail', lineNumber);

    if (!detailResult.ok) {
      return detailResult;
    }

    const detail = detailResult.value;

    if (detail[0] !== '2') {
      return fail('IB4B detail record must start with record type 2.', {
        lineNumber,
        value: detail[0]
      });
    }

    const transactionTypeResult = mapTransactionCode(detail[2]!, lineNumber);

    if (!transactionTypeResult.ok) {
      return transactionTypeResult;
    }

    if (parsedType === undefined) {
      parsedType = transactionTypeResult.value;
    } else if (
      parsedType.transactionCode !== transactionTypeResult.value.transactionCode
    ) {
      return fail('IB4B file contains mixed transaction codes.', {
        lineNumber,
        expected: parsedType.transactionCode,
        actual: transactionTypeResult.value.transactionCode
      });
    }

    if (originatorName === undefined) {
      originatorName = detail[9]!;
    } else if (originatorName !== detail[9]) {
      return fail('IB4B file contains inconsistent originator names.', {
        lineNumber,
        expected: originatorName,
        actual: detail[9]
      });
    }

    const counterpartyAccountResult = parseAccount(
      detail[1]!,
      'counterpartyAccount',
      lineNumber
    );

    if (!counterpartyAccountResult.ok) {
      return counterpartyAccountResult;
    }

    const amountResult = parsePositiveInteger(
      detail[3]!,
      'amountCents',
      lineNumber
    );

    if (!amountResult.ok) {
      return amountResult;
    }

    transactions.push({
      counterpartyAccount: counterpartyAccountResult.value,
      amount: toCents(amountResult.value),
      accountName: detail[4]!,
      particulars: detail[5]!,
      reference: detail[6]!,
      information: detail[8]!,
      code: detail[10]!
    });
  }

  const trailerLineNumber = lines.length;
  const trailerResult = parseFieldCount(
    lines.at(-1)!,
    4,
    'trailer',
    trailerLineNumber
  );

  if (!trailerResult.ok) {
    return trailerResult;
  }

  const trailer = trailerResult.value;

  if (trailer[0] !== '3') {
    return fail('IB4B trailer record must start with record type 3.', {
      lineNumber: trailerLineNumber,
      value: trailer[0]
    });
  }

  const totalResult = parsePositiveInteger(
    trailer[1]!,
    'totalCents',
    trailerLineNumber
  );

  if (!totalResult.ok) {
    return totalResult;
  }

  const countResult = parsePositiveInteger(
    trailer[2]!,
    'count',
    trailerLineNumber
  );

  if (!countResult.ok) {
    return countResult;
  }

  const hashResult = parsePositiveInteger(
    trailer[3]!,
    'hashTotal',
    trailerLineNumber
  );

  if (!hashResult.ok) {
    return hashResult;
  }

  let computedTotal = 0n;

  for (const transaction of transactions) {
    computedTotal += transaction.amount;
  }

  const computedHash = computeBranchBaseHashTotal(
    transactions.map((transaction) => transaction.counterpartyAccount)
  );

  if (countResult.value !== BigInt(transactions.length)) {
    return fail('IB4B trailer count does not match detail record count.', {
      lineNumber: trailerLineNumber,
      expected: transactions.length,
      actual: Number(countResult.value)
    });
  }

  if (totalResult.value !== computedTotal) {
    return fail('IB4B trailer total does not match detail record total.', {
      lineNumber: trailerLineNumber,
      expected: computedTotal.toString(),
      actual: totalResult.value.toString()
    });
  }

  if (hashResult.value !== computedHash) {
    return fail('IB4B trailer hash total does not match computed hash total.', {
      lineNumber: trailerLineNumber,
      expected: computedHash.toString(),
      actual: hashResult.value.toString()
    });
  }

  return ok({
    kind: parsedType!.kind,
    transactionCode: parsedType!.transactionCode,
    fromAccount: fromAccountResult.value,
    originatorName: originatorName ?? '',
    reference: header[8]!,
    processDate: processDateResult.value,
    effectiveDate: effectiveDateResult.value,
    transactions,
    summary: {
      count: transactions.length,
      totalCents: toCents(computedTotal),
      hashTotal: computedHash
    }
  });
}
