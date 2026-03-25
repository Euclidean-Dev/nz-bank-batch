import type { Brand } from '../shared/brand.js';

export type NzAccountNumber = Brand<string, 'NzAccountNumber'>;
export type Cents = Brand<bigint, 'Cents'>;
export type YyMmDd = Brand<string, 'YyMmDd'>;
export type YyyyMmDd = Brand<string, 'YyyyMmDd'>;
export type DateInput = string | Date;

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
