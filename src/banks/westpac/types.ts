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
  WestpacAccountInput
} from '../../nz/types.js';

export type WestpacDirectCreditTransactionCode = '50' | '52';

export type WestpacDirectCreditFileConfig = {
  readonly fromAccount: WestpacAccountInput;
  readonly customerCode?: string;
  readonly customerName?: string;
  readonly fileReference?: string;
  readonly scheduledDate?: DateInput;
};

export type WestpacPaymentFileConfig = WestpacDirectCreditFileConfig;

export type WestpacDirectCreditTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly payerReference?: string;
  readonly payeeAnalysis?: string;
  readonly payeeParticulars?: string;
  readonly transactionCode?: WestpacDirectCreditTransactionCode;
};

export type WestpacPaymentTransaction = WestpacDirectCreditTransaction;

export type WestpacDirectDebitFileConfig = {
  readonly toAccount: WestpacAccountInput;
  readonly customerCode?: string;
  readonly customerName?: string;
  readonly fileReference?: string;
  readonly scheduledDate?: DateInput;
};

export type WestpacDirectDebitTransaction = {
  readonly fromAccount: string;
  readonly amount: string | bigint | Cents;
  readonly accountName: string;
  readonly payerReference?: string;
  readonly payerAnalysis?: string;
  readonly payerParticulars?: string;
};

export type WestpacFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type WestpacPaymentFileError = WestpacFileError;
export type WestpacDirectCreditFileError = WestpacFileError;
export type WestpacDirectDebitFileError = WestpacFileError;

export type WestpacDirectCreditFile = BatchFile<
  WestpacDirectCreditTransaction,
  WestpacDirectCreditFileError
> & {
  readonly kind: 'direct-credit';
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type WestpacPaymentFile = WestpacDirectCreditFile;

export type WestpacDirectDebitFile = BatchFile<
  WestpacDirectDebitTransaction,
  WestpacDirectDebitFileError
> & {
  readonly kind: 'direct-debit';
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateWestpacDirectCreditFile = (
  config: WestpacDirectCreditFileConfig
) => WestpacDirectCreditFile;

export type CreateWestpacPaymentFile = CreateWestpacDirectCreditFile;

export type CreateWestpacDirectDebitFile = (
  config: WestpacDirectDebitFileConfig
) => WestpacDirectDebitFile;

export type ParsedWestpacDirectCreditTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payeeAnalysis: string;
  readonly payeeParticulars: string;
  readonly transactionCode: WestpacDirectCreditTransactionCode;
};

export type ParsedWestpacPaymentTransaction =
  ParsedWestpacDirectCreditTransaction;

export type ParsedWestpacDirectDebitTransaction = {
  readonly fromAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly accountName: string;
  readonly payerReference: string;
  readonly payerAnalysis: string;
  readonly payerParticulars: string;
};

type ParsedWestpacFileBase<
  TKind extends 'direct-credit' | 'direct-debit',
  TTransaction
> = {
  readonly kind: TKind;
  readonly hasHeader: boolean;
  readonly customerName: string;
  readonly fileReference: string;
  readonly scheduledDate: string;
  readonly transactions: readonly TTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParsedWestpacDirectCreditFile = ParsedWestpacFileBase<
  'direct-credit',
  ParsedWestpacDirectCreditTransaction
> & {
  readonly fromAccount: NzAccountNumber;
  readonly payerName: string;
};

export type ParsedWestpacPaymentCsvFile = ParsedWestpacDirectCreditFile;

export type ParsedWestpacPaymentFile = ParsedWestpacDirectCreditFile;

export type ParsedWestpacDirectDebitFile = ParsedWestpacFileBase<
  'direct-debit',
  ParsedWestpacDirectDebitTransaction
> & {
  readonly toAccount: NzAccountNumber;
  readonly collectorName: string;
};

export type ParsedWestpacFile =
  | ParsedWestpacDirectCreditFile
  | ParsedWestpacDirectDebitFile;

export type WestpacParseError = AdapterError | DateError | NzAccountError;

export type WestpacPaymentParseError = WestpacParseError;
export type WestpacDirectCreditParseError = WestpacParseError;
export type WestpacDirectDebitParseError = WestpacParseError;

export type ParseWestpacDirectCreditFile = (
  input: string | Buffer
) => Result<ParsedWestpacDirectCreditFile, WestpacDirectCreditParseError>;

export type ParseWestpacPaymentFile = ParseWestpacDirectCreditFile;

export type ParseWestpacPaymentCsvFile = (
  input: string | Buffer
) => Result<ParsedWestpacPaymentCsvFile, WestpacPaymentParseError>;

export type ParseWestpacDirectDebitFile = (
  input: string | Buffer
) => Result<ParsedWestpacDirectDebitFile, WestpacDirectDebitParseError>;

export type ParseWestpacFile = (
  input: string | Buffer
) => Result<ParsedWestpacFile, WestpacParseError>;
