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
  AsbAccountInput,
  Cents,
  DateInput,
  NzAccountNumber,
  YyMmDd,
  YyyyMmDd
} from '../../nz/types.js';

export type AsbFileType = 'direct-credit' | 'direct-debit';
export type AsbCreditTransactionCode = '051' | '052';
export type AsbDebitTransactionCode = '000';
export type AsbTransactionCode = AsbCreditTransactionCode | AsbDebitTransactionCode;
export type AsbDueDate = YyMmDd | YyyyMmDd;

export type AsbPartyDetails = {
  readonly name: string;
  readonly code: string;
  readonly alphaReference?: string;
  readonly particulars?: string;
};

export type AsbOtherPartyDetails = {
  readonly name?: string;
  readonly code?: string;
  readonly alphaReference?: string;
  readonly particulars?: string;
};

export type AsbDirectCreditFileConfig = {
  readonly fromAccount: AsbAccountInput;
  readonly dueDate: DateInput | AsbDueDate;
  readonly clientShortName?: string;
};

export type AsbDirectDebitContraConfig = {
  readonly account: AsbAccountInput;
  readonly code?: string;
  readonly alphaReference?: string;
  readonly particulars?: string;
  readonly otherPartyName?: string;
};

export type AsbDirectDebitFileConfig = {
  readonly registrationId: string;
  readonly dueDate: DateInput | AsbDueDate;
  readonly clientShortName?: string;
  readonly contra?: AsbDirectDebitContraConfig;
};

export type AsbFileConfig = AsbDirectCreditFileConfig | AsbDirectDebitFileConfig;

export type CreateAsbFileConfig =
  | ({ readonly type: 'direct-credit' } & AsbDirectCreditFileConfig)
  | ({ readonly type: 'direct-debit' } & AsbDirectDebitFileConfig);

export type AsbDirectCreditTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly transactionCode?: AsbCreditTransactionCode;
  readonly internalReference?: string;
  readonly thisParty: AsbPartyDetails;
  readonly otherParty?: AsbOtherPartyDetails;
};

export type AsbDirectDebitTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly transactionCode?: AsbDebitTransactionCode;
  readonly thisParty: AsbPartyDetails;
  readonly otherParty?: AsbOtherPartyDetails;
};

export type AsbTransaction = AsbDirectCreditTransaction | AsbDirectDebitTransaction;

export type AsbFileError = AdapterError | DateError | FieldError | MoneyError | NzAccountError;

export type ParsedAsbPartyDetails = {
  readonly name: string;
  readonly code: string;
  readonly alphaReference: string;
  readonly particulars: string;
};

export type ParsedAsbOtherPartyDetails = {
  readonly name: string;
  readonly code: string;
  readonly alphaReference: string;
  readonly particulars: string;
};

export type ParsedAsbDirectCreditTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly transactionCode: AsbCreditTransactionCode;
  readonly internalReference: string;
  readonly thisParty: ParsedAsbPartyDetails;
  readonly otherParty: ParsedAsbOtherPartyDetails;
};

export type ParsedAsbDirectDebitTransaction = {
  readonly toAccount: NzAccountNumber;
  readonly amount: Cents;
  readonly transactionCode: AsbDebitTransactionCode;
  readonly thisParty: ParsedAsbPartyDetails;
  readonly otherParty: ParsedAsbOtherPartyDetails;
};

export type ParsedAsbDirectDebitContra = {
  readonly account: NzAccountNumber;
  readonly amount: Cents;
  readonly transactionCode: '051';
  readonly code: string;
  readonly alphaReference: string;
  readonly particulars: string;
  readonly otherPartyName: string;
};

export type ParsedAsbTransaction =
  | ParsedAsbDirectCreditTransaction
  | ParsedAsbDirectDebitTransaction;

export type ParsedAsbDirectCreditFile = {
  readonly kind: 'direct-credit';
  readonly fromAccount: NzAccountNumber;
  readonly dueDate: AsbDueDate;
  readonly clientShortName: string;
  readonly transactions: readonly ParsedAsbDirectCreditTransaction[];
  readonly summary: BatchFileSummary;
};

export type ParsedAsbDirectDebitFile = {
  readonly kind: 'direct-debit';
  readonly registrationId: string;
  readonly dueDate: AsbDueDate;
  readonly clientShortName: string;
  readonly transactions: readonly ParsedAsbDirectDebitTransaction[];
  readonly contra?: ParsedAsbDirectDebitContra;
  readonly summary: BatchFileSummary;
};

export type ParsedAsbFile = ParsedAsbDirectCreditFile | ParsedAsbDirectDebitFile;

export type AsbParseError = AdapterError | DateError | NzAccountError;

export type AsbFile<TTransaction extends AsbTransaction = AsbTransaction> =
  BatchFile<TTransaction, AsbFileError> & {
    readonly kind: AsbFileType;
    readonly toBuffer: (options?: RenderFileOptions) => Buffer;
    readonly toString: (options?: RenderFileOptions) => string;
  };

export type ParseAsbFile = (input: string | Buffer) => Result<ParsedAsbFile, AsbParseError>;

export type ParseAsbDirectCreditFile = (
  input: string | Buffer
) => Result<ParsedAsbDirectCreditFile, AsbParseError>;

export type ParseAsbDirectDebitFile = (
  input: string | Buffer
) => Result<ParsedAsbDirectDebitFile, AsbParseError>;