import { AdapterError } from '../../shared/errors.js';
import { err, ok, type Result } from '../../shared/result.js';
import { parseNzAccount } from '../../nz/account.js';
import { computeBranchBaseHashTotal } from '../../nz/hash-total.js';
import { toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountError } from '../../shared/errors.js';
import type { Cents, NzAccountNumber } from '../../nz/types.js';
import type {
  ParsedWestpacPaymentFile,
  ParsedWestpacPaymentCsvFile,
  ParsedWestpacPaymentFixedLengthFile,
  ParsedWestpacPaymentTransaction,
  WestpacPaymentFormat,
  WestpacPaymentParseError,
  ParseWestpacPaymentCsvFile,
  ParseWestpacPaymentFixedLengthFile
} from './types.js';

const HEADER_FIELD_WIDTHS = [1, 6, 2, 4, 30, 6, 20, 6, 105] as const;
const DETAIL_FIELD_WIDTHS = [1, 6, 2, 4, 8, 4, 2, 2, 15, 20, 12, 12, 12, 2, 4, 8, 4, 20, 42] as const;

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

function parseCsvFields(line: string, lineNumber: number): Result<string[], AdapterError> {
  if (line.includes('"')) {
    return fail('Westpac Deskbank CSV does not support double quotes in fields.', {
      lineNumber,
      record: line
    });
  }

  return ok(line.split(','));
}

function sliceFixedFields(line: string, widths: readonly number[], lineNumber: number) {
  const expectedWidth = widths.reduce((sum, width) => sum + width, 0);

  if (line.length !== expectedWidth) {
    return fail('Invalid Westpac fixed-length record width.', {
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

function parseAmount(field: string, fieldName: string, lineNumber: number): Result<Cents, AdapterError> {
  const trimmed = field.trim();

  if (!/^\d+$/.test(trimmed)) {
    return fail(`Invalid Westpac ${fieldName}.`, {
      lineNumber,
      field: fieldName,
      value: field
    });
  }

  return ok(toCents(BigInt(trimmed)));
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
      new AdapterError('ADAPTER_CONFIG', `Invalid Westpac ${role} account.`, {
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

function buildSummary(transactions: readonly ParsedWestpacPaymentTransaction[]): BatchFileSummary {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0n);

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: computeBranchBaseHashTotal(transactions.map((transaction) => transaction.toAccount))
  };
}

function parseCsvHeader(line: string, lineNumber: number) {
  const fieldsResult = parseCsvFields(line, lineNumber);

  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const fields = fieldsResult.value;

  if (fields.length !== 9 || fields[0] !== 'A') {
    return fail('Invalid Westpac CSV header record.', {
      lineNumber,
      record: line
    });
  }

  return ok({
    customerName: fields[4] ?? '',
    fileReference: fields[6] ?? '',
    scheduledDate: fields[7] ?? ''
  });
}

function parseFixedHeader(line: string, lineNumber: number) {
  const fieldsResult = sliceFixedFields(line, HEADER_FIELD_WIDTHS, lineNumber);

  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const fields = fieldsResult.value;

  if (fields[0] !== 'A') {
    return fail('Invalid Westpac fixed-length header record.', {
      lineNumber,
      record: line
    });
  }

  return ok({
    customerName: trimField(fields[4] ?? ''),
    fileReference: trimField(fields[6] ?? ''),
    scheduledDate: trimField(fields[7] ?? '')
  });
}

function parseCsvDetails(lines: readonly string[]) {
  const transactions: ParsedWestpacPaymentTransaction[] = [];
  let fromAccount: NzAccountNumber | undefined;
  let payerName = '';

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (line.startsWith('A,')) {
      continue;
    }

    const fieldsResult = parseCsvFields(line, lineNumber);

    if (!fieldsResult.ok) {
      return fieldsResult;
    }

    const fields = fieldsResult.value;

    if (fields[0] !== 'D' || fields.length !== 19) {
      return fail('Invalid Westpac CSV detail record.', {
        lineNumber,
        record: line,
        fieldCount: fields.length
      });
    }

    const toAccountResult = parseAccount(fields[2] ?? '', fields[3] ?? '', fields[4] ?? '', fields[5] ?? '', lineNumber, 'payee');

    if (!toAccountResult.ok) {
      return toAccountResult;
    }

    const fromAccountResult = parseAccount(fields[13] ?? '', fields[14] ?? '', fields[15] ?? '', fields[16] ?? '', lineNumber, 'funding');

    if (!fromAccountResult.ok) {
      return fromAccountResult;
    }

    const amountResult = parseAmount(fields[8] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    if (fields[6] !== '50' || fields[7] !== 'DC') {
      return fail('Unsupported Westpac CSV transaction record values.', {
        lineNumber,
        transactionCode: fields[6],
        mtsSource: fields[7]
      });
    }

    const currentPayerName = fields[17] ?? '';

    if (fromAccount === undefined) {
      fromAccount = fromAccountResult.value;
      payerName = currentPayerName;
    } else {
      if (fromAccount !== fromAccountResult.value) {
        return fail('Westpac CSV file contains mixed funding accounts.', {
          lineNumber,
          expected: fromAccount,
          actual: fromAccountResult.value
        });
      }

      if (payerName !== currentPayerName) {
        return fail('Westpac CSV file contains mixed payer names.', {
          lineNumber,
          expected: payerName,
          actual: currentPayerName
        });
      }
    }

    transactions.push({
      toAccount: toAccountResult.value,
      amount: amountResult.value,
      accountName: fields[9] ?? '',
      payerReference: fields[12] ?? '',
      payeeAnalysis: fields[11] ?? '',
      payeeParticulars: fields[10] ?? ''
    });
  }

  if (transactions.length === 0 || fromAccount === undefined) {
    return fail('Westpac CSV file must contain at least one detail record.');
  }

  return ok({ fromAccount, payerName, transactions });
}

function parseFixedDetails(lines: readonly string[]) {
  const transactions: ParsedWestpacPaymentTransaction[] = [];
  let fromAccount: NzAccountNumber | undefined;
  let payerName = '';

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (line.startsWith('A')) {
      continue;
    }

    const fieldsResult = sliceFixedFields(line, DETAIL_FIELD_WIDTHS, lineNumber);

    if (!fieldsResult.ok) {
      return fieldsResult;
    }

    const fields = fieldsResult.value;

    if (fields[0] !== 'D') {
      return fail('Invalid Westpac fixed-length detail record.', {
        lineNumber,
        record: line
      });
    }

    const toAccountResult = parseAccount(
      trimField(fields[2] ?? ''),
      trimField(fields[3] ?? ''),
      trimField(fields[4] ?? ''),
      trimField(fields[5] ?? ''),
      lineNumber,
      'payee'
    );

    if (!toAccountResult.ok) {
      return toAccountResult;
    }

    const fromAccountResult = parseAccount(
      trimField(fields[13] ?? ''),
      trimField(fields[14] ?? ''),
      trimField(fields[15] ?? ''),
      trimField(fields[16] ?? ''),
      lineNumber,
      'funding'
    );

    if (!fromAccountResult.ok) {
      return fromAccountResult;
    }

    const amountResult = parseAmount(trimField(fields[8] ?? ''), 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    if (trimField(fields[6] ?? '') !== '50' || trimField(fields[7] ?? '') !== 'DC') {
      return fail('Unsupported Westpac fixed-length transaction record values.', {
        lineNumber,
        transactionCode: trimField(fields[6] ?? ''),
        mtsSource: trimField(fields[7] ?? '')
      });
    }

    const currentPayerName = trimField(fields[17] ?? '');

    if (fromAccount === undefined) {
      fromAccount = fromAccountResult.value;
      payerName = currentPayerName;
    } else {
      if (fromAccount !== fromAccountResult.value) {
        return fail('Westpac fixed-length file contains mixed funding accounts.', {
          lineNumber,
          expected: fromAccount,
          actual: fromAccountResult.value
        });
      }

      if (payerName !== currentPayerName) {
        return fail('Westpac fixed-length file contains mixed payer names.', {
          lineNumber,
          expected: payerName,
          actual: currentPayerName
        });
      }
    }

    transactions.push({
      toAccount: toAccountResult.value,
      amount: amountResult.value,
      accountName: trimField(fields[9] ?? ''),
      payerReference: trimField(fields[12] ?? ''),
      payeeAnalysis: trimField(fields[11] ?? ''),
      payeeParticulars: trimField(fields[10] ?? '')
    });
  }

  if (transactions.length === 0 || fromAccount === undefined) {
    return fail('Westpac fixed-length file must contain at least one detail record.');
  }

  return ok({ fromAccount, payerName, transactions });
}

function parseWestpacFile(
  input: string | Buffer,
  kind: 'payment-csv'
): Result<ParsedWestpacPaymentCsvFile, WestpacPaymentParseError>;
function parseWestpacFile(
  input: string | Buffer,
  kind: 'payment-fixed-length'
): Result<ParsedWestpacPaymentFixedLengthFile, WestpacPaymentParseError>;
function parseWestpacFile(
  input: string | Buffer,
  kind: WestpacPaymentFormat
): Result<ParsedWestpacPaymentFile, WestpacPaymentParseError> {
  const lines = splitLines(input);

  if (lines.length === 0) {
    return fail('Westpac file must not be empty.');
  }

  const hasHeader = lines[0]!.startsWith('A');
  let customerName = '';
  let fileReference = '';
  let scheduledDate = '';

  if (hasHeader) {
    const headerResult = kind === 'payment-csv' ? parseCsvHeader(lines[0]!, 1) : parseFixedHeader(lines[0]!, 1);

    if (!headerResult.ok) {
      return headerResult;
    }

    customerName = headerResult.value.customerName;
    fileReference = headerResult.value.fileReference;
    scheduledDate = headerResult.value.scheduledDate;
  }

  const detailResult = kind === 'payment-csv' ? parseCsvDetails(lines) : parseFixedDetails(lines);

  if (!detailResult.ok) {
    return detailResult;
  }

  const parsed = {
    hasHeader,
    fromAccount: detailResult.value.fromAccount,
    customerName,
    payerName: detailResult.value.payerName,
    fileReference,
    scheduledDate,
    transactions: detailResult.value.transactions,
    summary: buildSummary(detailResult.value.transactions)
  };

  if (kind === 'payment-csv') {
    return ok({
      kind: 'payment-csv',
      ...parsed
    });
  }

  return ok({
    kind: 'payment-fixed-length',
    ...parsed
  });
}

export const parsePaymentCsvFile: ParseWestpacPaymentCsvFile = (
  input
) => {
  return parseWestpacFile(input, 'payment-csv');
};

export const parsePaymentFixedLengthFile: ParseWestpacPaymentFixedLengthFile = (
  input
) => {
  return parseWestpacFile(input, 'payment-fixed-length');
};