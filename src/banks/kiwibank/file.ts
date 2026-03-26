import { AdapterError, FieldError } from '../../shared/errors.js';
import { renderCsvFile, type RenderFileOptions } from '../../shared/records.js';
import { err, ok, type Result } from '../../shared/result.js';
import { assertNzAccount, parseNzAccount } from '../../nz/account.js';
import { assertYyMmDd } from '../../nz/date.js';
import { computeBranchBaseHashTotal } from '../../nz/hash-total.js';
import { parseCents, toCents } from '../../nz/money.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { DateInput, NzAccountNumber, YyMmDd } from '../../nz/types.js';
import type {
  KiwibankFile,
  KiwibankFileConfig,
  KiwibankFileType,
  KiwibankTransaction,
  KiwibankTransactionCode
} from './types.js';

type StoredTransaction = {
  readonly counterpartyAccount: NzAccountNumber;
  readonly amountCents: bigint;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly information: string;
};

type Ib4bFieldInput = {
  readonly value: string | number | bigint | null | undefined;
  readonly spec: {
    readonly name: string;
    readonly maxLength?: number;
    readonly required?: boolean;
    readonly truncate?: boolean;
  };
};

const ASCII_PRINTABLE = /^[ -~]*$/;
const CREDIT_TRANSACTION_CODE = '50';
const DEBIT_TRANSACTION_CODE = '00';
const HEADER_CONTROL_VALUE = '7';

function prepareIb4bField(input: Ib4bFieldInput): Result<string, FieldError> {
  const { spec, value } = input;

  if (value === null || value === undefined || value === '') {
    if (spec.required) {
      return err(
        new FieldError('FIELD_REQUIRED', `Field ${spec.name} is required.`, {
          field: spec.name
        })
      );
    }

    return ok('');
  }

  const stringValue = String(value);

  if (!ASCII_PRINTABLE.test(stringValue)) {
    return err(
      new FieldError(
        'FIELD_ASCII',
        `Field ${spec.name} must contain printable ASCII only.`,
        { field: spec.name, value: stringValue }
      )
    );
  }

  if (stringValue.includes(',')) {
    return err(
      new FieldError(
        'FIELD_COMMA',
        `Field ${spec.name} must not contain commas.`,
        {
          field: spec.name,
          value: stringValue
        }
      )
    );
  }

  if (spec.maxLength !== undefined && stringValue.length > spec.maxLength) {
    if (!spec.truncate) {
      return err(
        new FieldError(
          'FIELD_LENGTH',
          `Field ${spec.name} exceeds max length ${String(spec.maxLength)}.`,
          { field: spec.name, value: stringValue, maxLength: spec.maxLength }
        )
      );
    }

    return ok(stringValue.slice(0, spec.maxLength));
  }

  return ok(stringValue);
}

function renderIb4bRecord(
  fields: readonly Ib4bFieldInput[]
): Result<string, FieldError> {
  const output: string[] = [];

  for (const field of fields) {
    const prepared = prepareIb4bField(field);

    if (!prepared.ok) {
      return prepared;
    }

    output.push(prepared.value);
  }

  return ok(output.join(','));
}

function currentYyMmDd(): YyMmDd {
  return assertYyMmDd(new Date());
}

function normaliseProcessDate(input?: DateInput): YyMmDd {
  if (input === undefined) {
    return currentYyMmDd();
  }

  return assertYyMmDd(input);
}

function makeHeaderRecord(config: {
  readonly fromAccount: NzAccountNumber;
  readonly processDate: YyMmDd;
  readonly batchReference: string;
}) {
  return renderIb4bRecord([
    { value: '1', spec: { name: 'recordType', required: true } },
    { value: '', spec: { name: 'blank1' } },
    { value: '', spec: { name: 'blank2' } },
    { value: '', spec: { name: 'blank3' } },
    {
      value: config.fromAccount as string,
      spec: { name: 'fromAccount', required: true, maxLength: 16 }
    },
    {
      value: HEADER_CONTROL_VALUE,
      spec: { name: 'control', required: true, maxLength: 1 }
    },
    {
      value: config.processDate,
      spec: { name: 'processDate', required: true, maxLength: 6 }
    },
    {
      value: config.processDate,
      spec: { name: 'effectiveDate', required: true, maxLength: 6 }
    },
    {
      value: config.batchReference,
      spec: { name: 'batchReference', maxLength: 12, truncate: true }
    }
  ]);
}

function makeTransactionRecord(
  transactionCode: string,
  originatorName: string,
  transaction: StoredTransaction
) {
  return renderIb4bRecord([
    { value: '2', spec: { name: 'recordType', required: true } },
    {
      value: transaction.counterpartyAccount as string,
      spec: { name: 'counterpartyAccount', required: true, maxLength: 16 }
    },
    {
      value: transactionCode,
      spec: { name: 'transactionCode', required: true, maxLength: 2 }
    },
    {
      value: transaction.amountCents,
      spec: { name: 'amountCents', required: true, maxLength: 14 }
    },
    {
      value: transaction.accountName,
      spec: {
        name: 'accountName',
        required: true,
        maxLength: 20,
        truncate: true
      }
    },
    {
      value: transaction.particulars,
      spec: { name: 'particulars', maxLength: 12, truncate: true }
    },
    {
      value: transaction.reference,
      spec: { name: 'reference', maxLength: 12, truncate: true }
    },
    { value: '', spec: { name: 'blank' } },
    {
      value: transaction.information,
      spec: { name: 'information', maxLength: 12, truncate: true }
    },
    {
      value: originatorName,
      spec: {
        name: 'originatorName',
        required: true,
        maxLength: 20,
        truncate: true
      }
    },
    {
      value: transaction.code,
      spec: { name: 'code', maxLength: 12, truncate: true }
    },
    {
      value: transaction.reference,
      spec: { name: 'referenceRepeat', maxLength: 12, truncate: true }
    },
    {
      value: transaction.particulars,
      spec: { name: 'particularsRepeat', maxLength: 12, truncate: true }
    }
  ]);
}

function makeTrailerRecord(summary: BatchFileSummary) {
  return renderIb4bRecord([
    { value: '3', spec: { name: 'recordType', required: true } },
    {
      value: summary.totalCents,
      spec: { name: 'totalCents', required: true, maxLength: 14 }
    },
    {
      value: summary.count,
      spec: { name: 'count', required: true, maxLength: 8 }
    },
    {
      value: summary.hashTotal,
      spec: { name: 'hashTotal', required: true, maxLength: 15 }
    }
  ]);
}

function createKiwibankFile(
  kind: KiwibankFileType,
  config: KiwibankFileConfig
): KiwibankFile {
  const fromAccount = assertNzAccount(config.fromAccount);
  const processDate = normaliseProcessDate(config.processDate);
  const batchReference = config.batchReference ?? '';
  const transactionCode: KiwibankTransactionCode =
    kind === 'direct-credit' ? 'DC' : 'DD';
  const renderedTransactionCode =
    kind === 'direct-credit' ? CREDIT_TRANSACTION_CODE : DEBIT_TRANSACTION_CODE;

  const headerValidation = makeHeaderRecord({
    fromAccount,
    processDate,
    batchReference
  });

  if (!headerValidation.ok) {
    throw new AdapterError('ADAPTER_CONFIG', headerValidation.error.message, {
      cause: headerValidation.error
    });
  }

  const transactions: StoredTransaction[] = [];

  const file: KiwibankFile = {
    kind,
    transactionCode,
    addTransaction(transaction: KiwibankTransaction) {
      const accountResult = parseNzAccount(transaction.counterpartyAccount);

      if (!accountResult.ok) {
        return accountResult;
      }

      const amountResult = parseCents(transaction.amount);

      if (!amountResult.ok) {
        return amountResult;
      }

      const stored: StoredTransaction = {
        counterpartyAccount: accountResult.value,
        amountCents: amountResult.value as bigint,
        accountName: transaction.accountName,
        particulars: transaction.particulars ?? '',
        code: transaction.code ?? '',
        reference: transaction.reference ?? '',
        information: transaction.information ?? ''
      };

      const recordValidation = makeTransactionRecord(
        renderedTransactionCode,
        config.originatorName,
        stored
      );

      if (!recordValidation.ok) {
        return err(recordValidation.error);
      }

      transactions.push(stored);
      return ok(undefined);
    },
    summary() {
      let total = 0n;

      for (const transaction of transactions) {
        total += transaction.amountCents;
      }

      return {
        count: transactions.length,
        totalCents: toCents(total),
        hashTotal: computeBranchBaseHashTotal(
          transactions.map((transaction) => transaction.counterpartyAccount)
        )
      };
    },
    toBuffer(options?: RenderFileOptions) {
      return Buffer.from(file.toString(options), 'utf8');
    },
    toString(options?: RenderFileOptions) {
      const summary = file.summary();
      const records = [
        makeHeaderRecord({
          fromAccount,
          processDate,
          batchReference
        }),
        ...transactions.map((transaction) =>
          makeTransactionRecord(
            renderedTransactionCode,
            config.originatorName,
            transaction
          )
        ),
        makeTrailerRecord(summary)
      ].map((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return result.value;
      });

      return renderCsvFile(records, options);
    }
  };

  return file;
}

export function createDirectCreditFile(
  config: KiwibankFileConfig
): KiwibankFile {
  return createKiwibankFile('direct-credit', config);
}

export function createDirectDebitFile(
  config: KiwibankFileConfig
): KiwibankFile {
  return createKiwibankFile('direct-debit', config);
}

export function createFile(
  config: KiwibankFileConfig & { readonly type: KiwibankFileType }
): KiwibankFile {
  return createKiwibankFile(config.type, config);
}
