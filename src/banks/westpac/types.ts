import type { BatchFile, BatchFileSummary } from '../../shared/batch-file.js';
import type { AdapterError, DateError, FieldError, MoneyError, NzAccountError } from '../../shared/errors.js';
import type { RenderFileOptions } from '../../shared/records.js';
import type { Result } from '../../shared/result.js';
import type { Cents, NzAccountNumber } from '../../nz/types.js';

export type WestpacPaymentFormat = 'payment-csv' | 'payment-fixed-length';

export type WestpacPaymentFileConfig = {
  readonly fromAccount: string;
  readonly customerCode?: string;
  readonly customerName?: string;
  readonly fileReference?: string;
  readonly scheduledDate?: string;
};

export type WestpacPaymentTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly payerReference?: string;
  readonly payeeAnalysis?: string;
  readonly payeeParticulars?: string;
};

export type WestpacPaymentFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type WestpacPaymentFile = BatchFile<
  WestpacPaymentTransaction,
  WestpacPaymentFileError
> & {
  readonly kind: WestpacPaymentFormat;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateWestpacPaymentFile = (
  config: WestpacPaymentFileConfig
) => WestpacPaymentFile;

export type ParsedWestpacPaymentTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payeeAnalysis: string;
  readonly payeeParticulars: string;
};

type ParsedWestpacPaymentFileBase<TKind extends WestpacPaymentFormat> = {
  readonly kind: TKind;
  readonly hasHeader: boolean;
  readonly fromAccount: NzAccountNumber;
  readonly customerName: string;
  readonly payerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
  readonly transactions: readonly ParsedWestpacPaymentTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParsedWestpacPaymentCsvFile = ParsedWestpacPaymentFileBase<'payment-csv'>;

export type ParsedWestpacPaymentFixedLengthFile = ParsedWestpacPaymentFileBase<'payment-fixed-length'>;

export type ParsedWestpacPaymentFile =
  | ParsedWestpacPaymentCsvFile
  | ParsedWestpacPaymentFixedLengthFile;

export type WestpacPaymentParseError = AdapterError | DateError | NzAccountError;

export type ParseWestpacPaymentFile = (
  input: string | Buffer
) => Result<ParsedWestpacPaymentFile, WestpacPaymentParseError>;

export type ParseWestpacPaymentCsvFile = (
  input: string | Buffer
) => Result<ParsedWestpacPaymentCsvFile, WestpacPaymentParseError>;

export type ParseWestpacPaymentFixedLengthFile = (
  input: string | Buffer
) => Result<ParsedWestpacPaymentFixedLengthFile, WestpacPaymentParseError>;