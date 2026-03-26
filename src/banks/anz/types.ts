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
import type { Cents, DateInput, YyyyMmDd } from '../../nz/types.js';

export type AnzDomesticExtendedFileType = 'domestic-extended';
export type AnzDirectDebitFileType = 'direct-debit';
export type AnzFileType = AnzDomesticExtendedFileType | AnzDirectDebitFileType;

export type AnzDomesticExtendedTransactionCode = '50' | '52' | '00';
export type AnzDirectDebitTransactionCode = '00';

export type AnzDomesticExtendedFileConfig = {
  readonly batchDueDate: DateInput | YyyyMmDd;
  readonly batchCreationDate?: DateInput | YyyyMmDd;
};

export type AnzDomesticExtendedTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly transactionCode?: AnzDomesticExtendedTransactionCode;
  readonly otherPartyName: string;
  readonly otherPartyReference?: string;
  readonly otherPartyAnalysisCode?: string;
  readonly otherPartyAlphaReference?: string;
  readonly otherPartyParticulars?: string;
  readonly subscriberName?: string;
  readonly subscriberAnalysisCode?: string;
  readonly subscriberReference?: string;
  readonly subscriberParticulars?: string;
};

export type AnzDomesticExtendedFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type AnzDomesticExtendedFile = BatchFile<
  AnzDomesticExtendedTransaction,
  AnzDomesticExtendedFileError
> & {
  readonly kind: AnzDomesticExtendedFileType;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateAnzDomesticExtendedFile = (
  config: AnzDomesticExtendedFileConfig
) => AnzDomesticExtendedFile;

export type AnzDirectCreditTransactionCode = '50' | '52';
export type AnzDirectCreditFileConfig = AnzDomesticExtendedFileConfig;
export type AnzDirectCreditTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly transactionCode?: AnzDirectCreditTransactionCode;
  readonly payeeName: string;
  readonly payeeReference?: string;
  readonly payeeAnalysis?: string;
  readonly payeeCode?: string;
  readonly payeeParticulars?: string;
  readonly originatorName?: string;
  readonly originatorAnalysis?: string;
  readonly originatorReference?: string;
  readonly originatorParticulars?: string;
};
export type AnzDirectCreditFileError = AnzDomesticExtendedFileError;
export type AnzDirectCreditFile = BatchFile<
  AnzDirectCreditTransaction,
  AnzDirectCreditFileError
> & {
  readonly kind: AnzDomesticExtendedFileType;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateAnzDirectCreditFile = (
  config: AnzDirectCreditFileConfig
) => AnzDirectCreditFile;

export type AnzDirectDebitFileConfig = AnzDomesticExtendedFileConfig;

export type AnzDirectDebitTransaction = {
  readonly fromAccount: string;
  readonly amount: string | bigint | Cents;

  /** Organisation or collector name repeated into both ANZ name fields. */
  readonly organisationName: string;

  /** Customer-facing reference, typically the payer name or mandate reference. */
  readonly customerReference?: string;
};

export type AnzDirectDebitFileError = AnzDomesticExtendedFileError;

export type AnzDirectDebitFile = BatchFile<
  AnzDirectDebitTransaction,
  AnzDirectDebitFileError
> & {
  readonly kind: AnzDirectDebitFileType;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateAnzDirectDebitFile = (
  config: AnzDirectDebitFileConfig
) => AnzDirectDebitFile;

export type ParsedAnzDomesticExtendedTransaction = {
  readonly toAccount: string;
  readonly renderedAccount: string;
  readonly amount: Cents;
  readonly transactionCode: AnzDomesticExtendedTransactionCode;
  readonly otherPartyName: string;
  readonly otherPartyReference: string;
  readonly otherPartyAnalysisCode: string;
  readonly otherPartyAlphaReference: string;
  readonly otherPartyParticulars: string;
  readonly subscriberName: string;
  readonly subscriberAnalysisCode: string;
  readonly subscriberReference: string;
  readonly subscriberParticulars: string;
};

export type ParsedAnzDomesticExtendedFile = {
  readonly kind: AnzDomesticExtendedFileType;
  readonly batchDueDate: YyyyMmDd;
  readonly batchCreationDate: YyyyMmDd;
  readonly transactions: readonly ParsedAnzDomesticExtendedTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParseAnzDomesticExtendedFile = (
  input: string | Buffer
) => Result<ParsedAnzDomesticExtendedFile, AnzDomesticExtendedFileError>;

export type ParsedAnzDirectCreditTransaction = {
  readonly toAccount: string;
  readonly renderedAccount: string;
  readonly amount: Cents;
  readonly transactionCode: AnzDirectCreditTransactionCode;
  readonly payeeName: string;
  readonly payeeReference: string;
  readonly payeeAnalysis: string;
  readonly payeeCode: string;
  readonly payeeParticulars: string;
  readonly originatorName: string;
  readonly originatorAnalysis: string;
  readonly originatorReference: string;
  readonly originatorParticulars: string;
};

export type ParsedAnzDirectCreditFile = {
  readonly kind: AnzDomesticExtendedFileType;
  readonly batchDueDate: YyyyMmDd;
  readonly batchCreationDate: YyyyMmDd;
  readonly transactions: readonly ParsedAnzDirectCreditTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParseAnzDirectCreditFile = (
  input: string | Buffer
) => Result<ParsedAnzDirectCreditFile, AnzDirectCreditFileError>;

export type ParsedAnzDirectDebitTransaction = {
  readonly fromAccount: string;
  readonly renderedAccount: string;
  readonly amount: Cents;
  readonly transactionCode: AnzDirectDebitTransactionCode;
  readonly organisationName: string;
  readonly customerReference: string;
};

export type ParsedAnzDirectDebitFile = {
  readonly kind: AnzDirectDebitFileType;
  readonly batchDueDate: YyyyMmDd;
  readonly batchCreationDate: YyyyMmDd;
  readonly transactions: readonly ParsedAnzDirectDebitTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParseAnzDirectDebitFile = (
  input: string | Buffer
) => Result<ParsedAnzDirectDebitFile, AnzDirectDebitFileError>;

export type AnzFileConfig = AnzDomesticExtendedFileConfig;
export type AnzTransaction = AnzDomesticExtendedTransaction;
export type AnzFileError = AnzDomesticExtendedFileError;
export type AnzFile = AnzDomesticExtendedFile;
export type CreateAnzFile = CreateAnzDomesticExtendedFile;
export type ParsedAnzFile = ParsedAnzDomesticExtendedFile;
export type ParsedAnzTransaction = ParsedAnzDomesticExtendedTransaction;
export type ParseAnzFile = ParseAnzDomesticExtendedFile;
