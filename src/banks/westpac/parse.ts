import { AdapterError } from '../../shared/errors.js';
import { err, ok, type Result } from '../../shared/result.js';
import { parseNzAccount } from '../../nz/account.js';
import { computeBranchBaseHashTotal } from '../../nz/hash-total.js';
import { toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { NzAccountError } from '../../shared/errors.js';
import type { Cents, NzAccountNumber } from '../../nz/types.js';
import type {
  ParsedWestpacDirectCreditTransaction,
  ParsedWestpacDirectDebitTransaction,
  ParsedWestpacPaymentTransaction,
  ParseWestpacDirectCreditFile,
  ParseWestpacDirectDebitFile,
  ParseWestpacFile,
  ParseWestpacPaymentCsvFile
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

function parseCsvFields(
  line: string,
  lineNumber: number
): Result<string[], AdapterError> {
  if (line.includes('"')) {
    return fail(
      'Westpac Deskbank CSV does not support double quotes in fields.',
      {
        lineNumber,
        record: line
      }
    );
  }

  return ok(line.split(','));
}

function parseAmount(
  field: string,
  fieldName: string,
  lineNumber: number
): Result<Cents, AdapterError> {
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

function buildSummary(
  transactions: readonly ParsedWestpacPaymentTransaction[]
): BatchFileSummary {
  const total = transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0n
  );

  return {
    count: transactions.length,
    totalCents: toCents(total),
    hashTotal: computeBranchBaseHashTotal(
      transactions.map((transaction) => transaction.toAccount)
    )
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

function parseDirectCreditDetails(lines: readonly string[]) {
  const transactions: ParsedWestpacDirectCreditTransaction[] = [];
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

    const toAccountResult = parseAccount(
      fields[2] ?? '',
      fields[3] ?? '',
      fields[4] ?? '',
      fields[5] ?? '',
      lineNumber,
      'payee'
    );

    if (!toAccountResult.ok) {
      return toAccountResult;
    }

    const fromAccountResult = parseAccount(
      fields[13] ?? '',
      fields[14] ?? '',
      fields[15] ?? '',
      fields[16] ?? '',
      lineNumber,
      'funding'
    );

    if (!fromAccountResult.ok) {
      return fromAccountResult;
    }

    const amountResult = parseAmount(fields[8] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    if ((fields[6] !== '50' && fields[6] !== '52') || fields[7] !== 'DC') {
      return fail('Unsupported Westpac CSV transaction record values.', {
        lineNumber,
        transactionCode: fields[6],
        mtsSource: fields[7]
      });
    }

    const transactionCode = fields[6];

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
      payeeParticulars: fields[10] ?? '',
      transactionCode
    });
  }

  if (transactions.length === 0 || fromAccount === undefined) {
    return fail('Westpac CSV file must contain at least one detail record.');
  }

  return ok({ fromAccount, payerName, transactions });
}

function parseDirectDebitDetails(lines: readonly string[]) {
  const transactions: ParsedWestpacDirectDebitTransaction[] = [];
  let toAccount: NzAccountNumber | undefined;
  let collectorName = '';

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

    const fromAccountResult = parseAccount(
      fields[2] ?? '',
      fields[3] ?? '',
      fields[4] ?? '',
      fields[5] ?? '',
      lineNumber,
      'payer'
    );

    if (!fromAccountResult.ok) {
      return fromAccountResult;
    }

    const toAccountResult = parseAccount(
      fields[13] ?? '',
      fields[14] ?? '',
      fields[15] ?? '',
      fields[16] ?? '',
      lineNumber,
      'collector'
    );

    if (!toAccountResult.ok) {
      return toAccountResult;
    }

    const amountResult = parseAmount(fields[8] ?? '', 'amount', lineNumber);

    if (!amountResult.ok) {
      return amountResult;
    }

    if (fields[6] !== '00' || fields[7] !== 'DD') {
      return fail('Unsupported Westpac CSV transaction record values.', {
        lineNumber,
        transactionCode: fields[6],
        mtsSource: fields[7]
      });
    }

    const currentCollectorName = fields[17] ?? '';

    if (toAccount === undefined) {
      toAccount = toAccountResult.value;
      collectorName = currentCollectorName;
    } else {
      if (toAccount !== toAccountResult.value) {
        return fail('Westpac CSV file contains mixed collector accounts.', {
          lineNumber,
          expected: toAccount,
          actual: toAccountResult.value
        });
      }

      if (collectorName !== currentCollectorName) {
        return fail('Westpac CSV file contains mixed collector names.', {
          lineNumber,
          expected: collectorName,
          actual: currentCollectorName
        });
      }
    }

    transactions.push({
      fromAccount: fromAccountResult.value,
      amount: amountResult.value,
      accountName: fields[9] ?? '',
      payerReference: fields[12] ?? '',
      payerAnalysis: fields[11] ?? '',
      payerParticulars: fields[10] ?? ''
    });
  }

  if (transactions.length === 0 || toAccount === undefined) {
    return fail('Westpac CSV file must contain at least one detail record.');
  }

  return ok({ toAccount, collectorName, transactions });
}

export const parseDirectCreditFile: ParseWestpacDirectCreditFile = (input) => {
  const lines = splitLines(input);

  if (lines.length === 0) {
    return fail('Westpac file must not be empty.');
  }

  const hasHeader = lines[0]!.startsWith('A');
  let customerName = '';
  let fileReference = '';
  let scheduledDate = '';

  if (hasHeader) {
    const headerResult = parseCsvHeader(lines[0]!, 1);

    if (!headerResult.ok) {
      return headerResult;
    }

    customerName = headerResult.value.customerName;
    fileReference = headerResult.value.fileReference;
    scheduledDate = headerResult.value.scheduledDate;
  }

  const detailResult = parseDirectCreditDetails(lines);

  if (!detailResult.ok) {
    return detailResult;
  }

  return ok({
    kind: 'direct-credit',
    hasHeader,
    fromAccount: detailResult.value.fromAccount,
    customerName,
    payerName: detailResult.value.payerName,
    fileReference,
    scheduledDate,
    transactions: detailResult.value.transactions,
    summary: buildSummary(detailResult.value.transactions)
  });
};

export const parseDirectDebitFile: ParseWestpacDirectDebitFile = (input) => {
  const lines = splitLines(input);

  if (lines.length === 0) {
    return fail('Westpac file must not be empty.');
  }

  const hasHeader = lines[0]!.startsWith('A');
  let customerName = '';
  let fileReference = '';
  let scheduledDate = '';

  if (hasHeader) {
    const headerResult = parseCsvHeader(lines[0]!, 1);

    if (!headerResult.ok) {
      return headerResult;
    }

    customerName = headerResult.value.customerName;
    fileReference = headerResult.value.fileReference;
    scheduledDate = headerResult.value.scheduledDate;
  }

  const detailResult = parseDirectDebitDetails(lines);

  if (!detailResult.ok) {
    return detailResult;
  }

  return ok({
    kind: 'direct-debit',
    hasHeader,
    toAccount: detailResult.value.toAccount,
    customerName,
    collectorName: detailResult.value.collectorName,
    fileReference,
    scheduledDate,
    transactions: detailResult.value.transactions,
    summary: {
      count: detailResult.value.transactions.length,
      totalCents: toCents(
        detailResult.value.transactions.reduce(
          (sum, transaction) => sum + transaction.amount,
          0n
        )
      ),
      hashTotal: computeBranchBaseHashTotal(
        detailResult.value.transactions.map(
          (transaction) => transaction.fromAccount
        )
      )
    }
  });
};

export const parsePaymentCsvFile: ParseWestpacPaymentCsvFile = (input) => {
  return parseDirectCreditFile(input);
};

export const parseFile: ParseWestpacFile = (input) => {
  const lines = splitLines(input);

  if (lines.length === 0) {
    return fail('Westpac file must not be empty.');
  }

  const firstDetailLine = lines.find((line) => line.startsWith('D,'));

  if (firstDetailLine === undefined) {
    return fail('Westpac file must contain at least one detail record.');
  }

  const detailFieldsResult = parseCsvFields(
    firstDetailLine,
    lines.indexOf(firstDetailLine) + 1
  );

  if (!detailFieldsResult.ok) {
    return detailFieldsResult;
  }

  const transactionCode = detailFieldsResult.value[6];
  const mtsSource = detailFieldsResult.value[7];

  if (transactionCode === '00' && mtsSource === 'DD') {
    return parseDirectDebitFile(input);
  }

  if (
    (transactionCode === '50' || transactionCode === '52') &&
    mtsSource === 'DC'
  ) {
    return parseDirectCreditFile(input);
  }

  return fail('Unsupported Westpac CSV transaction record values.', {
    transactionCode,
    mtsSource
  });
};
