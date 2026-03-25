import type { BatchFile, BatchFileSummary } from '../../shared/batch-file.js';
import type { AdapterError, DateError, FieldError, MoneyError, NzAccountError } from '../../shared/errors.js';
import type { RenderFileOptions } from '../../shared/records.js';
import type { Result } from '../../shared/result.js';
import type { Cents, YyyyMmDd } from '../../nz/types.js';

export type AnzFileType = 'domestic-extended';

export type AnzDomesticExtendedTransactionCode = '50' | '52' | '00';

export type AnzDomesticExtendedFileConfig = {
  readonly batchDueDate: string | YyyyMmDd;
  readonly batchCreationDate?: string | YyyyMmDd;
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
  readonly kind: AnzFileType;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type CreateAnzDomesticExtendedFile = (
  config: AnzDomesticExtendedFileConfig
) => AnzDomesticExtendedFile;

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
  readonly kind: AnzFileType;
  readonly batchDueDate: YyyyMmDd;
  readonly batchCreationDate: YyyyMmDd;
  readonly transactions: readonly ParsedAnzDomesticExtendedTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParseAnzDomesticExtendedFile = (
  input: string | Buffer
) => Result<ParsedAnzDomesticExtendedFile, AnzDomesticExtendedFileError>;

export type AnzFileConfig = AnzDomesticExtendedFileConfig;
export type AnzTransaction = AnzDomesticExtendedTransaction;
export type AnzFileError = AnzDomesticExtendedFileError;
export type AnzFile = AnzDomesticExtendedFile;
export type CreateAnzFile = CreateAnzDomesticExtendedFile;
export type ParsedAnzFile = ParsedAnzDomesticExtendedFile;
export type ParsedAnzTransaction = ParsedAnzDomesticExtendedTransaction;
export type ParseAnzFile = ParseAnzDomesticExtendedFile;
