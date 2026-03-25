import type { BatchFile } from '../../shared/batch-file.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type { AdapterError, DateError, FieldError, MoneyError, NzAccountError } from '../../shared/errors.js';
import type { RenderFileOptions } from '../../shared/records.js';
import type { Result } from '../../shared/result.js';
import type { Cents, NzAccountNumber, YyMmDd, YyyyMmDd } from '../../nz/types.js';

export type KiwibankFileType = 'direct-credit' | 'direct-debit';
export type KiwibankTransactionCode = 'DC' | 'DD';

export type KiwibankFileConfig = {
  readonly fromAccount: string;
  readonly originatorName: string;
  readonly batchReference?: string;
  readonly processDate?: string | YyMmDd | YyyyMmDd;
};

export type KiwibankTransaction = {
  readonly counterpartyAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly particulars?: string;
  readonly code?: string;
  readonly reference?: string;
  readonly information?: string;
};

export type KiwibankFileError = AdapterError | FieldError | MoneyError | NzAccountError;

export type ParsedKiwibankTransaction = {
  readonly counterpartyAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly information: string;
};

export type ParsedKiwibankFile = {
  readonly kind: KiwibankFileType;
  readonly transactionCode: KiwibankTransactionCode;
  readonly fromAccount: NzAccountNumber;
  readonly originatorName: string;
  readonly batchReference: string;
  readonly processDate: YyMmDd;
  readonly effectiveDate: YyMmDd;
  readonly transactions: readonly ParsedKiwibankTransaction[];
  readonly summary: BatchFileSummary;
};

export type KiwibankParseError = AdapterError | DateError | NzAccountError;

export type KiwibankFile = BatchFile<KiwibankTransaction, KiwibankFileError> & {
  readonly kind: KiwibankFileType;
  readonly transactionCode: KiwibankTransactionCode;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type ParseKiwibankFile = (
  input: string | Buffer
) => Result<ParsedKiwibankFile, KiwibankParseError>;
