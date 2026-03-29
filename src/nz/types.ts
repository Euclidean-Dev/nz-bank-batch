import type { Brand } from '../shared/brand.js';

export type NzAccountNumber = Brand<string, 'NzAccountNumber'>;
export type NzBankAccountNumber<TBankId extends string> = NzAccountNumber &
  Brand<string, `NzBankAccountNumber:${TBankId}`>;
export type Cents = Brand<bigint, 'Cents'>;
export type YyMmDd = Brand<string, 'YyMmDd'>;
export type YyyyMmDd = Brand<string, 'YyyyMmDd'>;
export type DateInput = string | Date;

export type AnzBankId = '01' | '06';
export type AsbBankId = '12';
export type BnzBankId = '02';
export type KiwibankBankId = '38';
export type TsbBankId = '15';
export type WestpacBankId = '03';

type NzBankAccountString<TBankId extends string> =
  | `${TBankId}${string}`
  | `${TBankId}-${string}`;

export type NzBankAccountInput<TBankId extends string> =
  | NzAccountNumber
  | NzBankAccountNumber<TBankId>
  | NzBankAccountString<TBankId>;

export type AnzAccountInput = NzBankAccountInput<AnzBankId>;
export type AsbAccountInput = NzBankAccountInput<AsbBankId>;
export type BnzAccountInput = NzBankAccountInput<BnzBankId>;
export type KiwibankAccountInput = NzBankAccountInput<KiwibankBankId>;
export type TsbAccountInput = NzBankAccountInput<TsbBankId>;
export type WestpacAccountInput = NzBankAccountInput<WestpacBankId>;

export type NzAccountParts = {
  readonly bankId: string;
  readonly branch: string;
  readonly base: string;
  readonly suffix: string;
  readonly paddedBase: string;
  readonly paddedSuffix: string;
  readonly canonicalDigits: NzAccountNumber;
};

export type NzBankBranchRange = {
  readonly from: number;
  readonly to: number;
};

export type NzBankDefinition = {
  readonly id: string;
  readonly branches: readonly NzBankBranchRange[];
};

export type NzChecksumAlgorithm = 'A' | 'B' | 'D' | 'E' | 'F' | 'G' | 'X';

export type NzChecksumRule = {
  readonly algorithm: NzChecksumAlgorithm;
  readonly weightFactor: string;
  readonly modulo: 1 | 10 | 11;
};

export type BranchValidationHook = (
  parts: NzAccountParts
) => boolean | { ok: true } | { ok: false; message: string };

export type ParseNzAccountOptions = {
  readonly validateChecksum?: boolean;
  readonly validateBankBranch?: boolean;
  readonly branchHook?: BranchValidationHook;
};
