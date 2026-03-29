import type { BatchFile, BatchFileSummary } from '../../shared/batch-file.js';
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
  Cents,
  DateInput,
  NzAccountNumber,
  TsbAccountInput
} from '../../nz/types.js';

export type TsbTrailerRecordType = 'S' | 'T';

export type TsbDirectCreditFileConfig = {
  readonly fromAccount: TsbAccountInput;
  readonly originatorName: string;
  readonly dueDate?: DateInput;
  readonly batchNumber?: string | number;
  readonly trailerRecordType?: TsbTrailerRecordType;
};

export type TsbFileConfig = TsbDirectCreditFileConfig;

export type TsbDirectCreditTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly particulars: string;
  readonly code?: string;
  readonly reference?: string;
  readonly batchNumber?: string | number;
  readonly originatingBank?: string | number;
  readonly originatingBranch?: string | number;
  readonly originatorAccount?: string;
  readonly status?: '' | 'N';
  readonly inputDate?: DateInput;
};

export type TsbFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type TsbDirectCreditFileError = TsbFileError;

export type TsbDirectCreditFile = BatchFile<
  TsbDirectCreditTransaction,
  TsbDirectCreditFileError
> & {
  readonly kind: 'direct-credit';
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type TsbFile = TsbDirectCreditFile;

export type CreateTsbDirectCreditFile = (
  config: TsbDirectCreditFileConfig
) => TsbDirectCreditFile;

export type CreateTsbFile = CreateTsbDirectCreditFile;

export type ParsedTsbDirectCreditTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly particulars: string;
  readonly code: string;
  readonly reference: string;
  readonly batchNumber: string;
  readonly originatingBank: string;
  readonly originatingBranch: string;
  readonly originatorAccount?: NzAccountNumber;
  readonly status: '' | 'N';
  readonly inputDate: string;
};

export type ParsedTsbDirectCreditFile = {
  readonly kind: 'direct-credit';
  readonly fromAccount: NzAccountNumber;
  readonly originatorName: string;
  readonly dueDate: string;
  readonly batchNumber: string;
  readonly trailerRecordType: TsbTrailerRecordType;
  readonly transactions: readonly ParsedTsbDirectCreditTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParsedTsbFile = ParsedTsbDirectCreditFile;

export type TsbParseError = AdapterError | DateError | NzAccountError;

export type ParseTsbDirectCreditFile = (
  input: string | Buffer
) => Result<ParsedTsbDirectCreditFile, TsbParseError>;

export type ParseTsbFile = ParseTsbDirectCreditFile;