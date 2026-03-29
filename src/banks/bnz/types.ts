import type { BatchFile } from '../../shared/batch-file.js';
import type { BatchFileSummary } from '../../shared/batch-file.js';
import type {
  AdapterError,
  DateError,
  FieldError,
  MoneyError,
  NzAccountError
} from '../../shared/errors.js';
import type { RenderFileOptions } from '../../shared/records.js';
import type { Result } from '../../shared/result.js';
import type {
  BnzAccountInput,
  Cents,
  DateInput,
  NzAccountNumber,
  YyMmDd
} from '../../nz/types.js';

export type BnzFileType = 'direct-credit' | 'direct-debit';
export type BnzTransactionCode = 'DC' | 'DD';

export type BnzFileConfig = {
  readonly fromAccount: BnzAccountInput;
  readonly originatorName: string;
  readonly userReference?: string;
  readonly processDate?: DateInput | YyMmDd;
};

export type BnzTransaction = {
  readonly counterpartyAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly particulars?: string;
  readonly code?: string;
  readonly reference?: string;
  readonly information?: string;
};

export type BnzFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type ParsedBnzTransaction = {
  readonly counterpartyAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly information: string;
};

export type ParsedBnzFile = {
  readonly kind: BnzFileType;
  readonly transactionCode: BnzTransactionCode;
  readonly fromAccount: NzAccountNumber;
  readonly originatorName: string;
  readonly userReference: string;
  readonly processDate: YyMmDd;
  readonly effectiveDate: YyMmDd;
  readonly transactions: readonly ParsedBnzTransaction[];
  readonly summary: BatchFileSummary;
};

export type BnzParseError = AdapterError | DateError | NzAccountError;

export type BnzFile = BatchFile<BnzTransaction, BnzFileError> & {
  readonly kind: BnzFileType;
  readonly transactionCode: BnzTransactionCode;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type ParseBnzFile = (
  input: string | Buffer
) => Result<ParsedBnzFile, BnzParseError>;
