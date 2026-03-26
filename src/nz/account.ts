import { NzAccountError } from '../shared/errors.js';
import { err, ok, type Result } from '../shared/result.js';
import { validateNzBankBranch } from './banks.js';
import { validateNzAccountChecksum } from './checksum.js';
import type {
  NzAccountNumber,
  NzAccountParts,
  ParseNzAccountOptions
} from './types.js';

function fail(message: string, context?: Record<string, unknown>) {
  return err(new NzAccountError('NZ_ACCOUNT_FORMAT', message, context));
}

function normaliseInput(input: string): {
  readonly bankId: string;
  readonly branch: string;
  readonly base: string;
  readonly suffix: string;
} | null {
  const trimmed = input.trim();
  const segmented = trimmed
    .split(/[-\s]+/)
    .filter((segment) => segment.length > 0);

  if (
    segmented.length === 4 &&
    segmented.every((segment) => /^\d+$/.test(segment))
  ) {
    return {
      bankId: segmented[0]!,
      branch: segmented[1]!,
      base: segmented[2]!,
      suffix: segmented[3]!
    };
  }

  const digitsOnly = trimmed.replace(/[-\s]+/g, '');

  if (!/^\d+$/.test(digitsOnly)) {
    return null;
  }

  if (digitsOnly.length === 15 || digitsOnly.length === 16) {
    return {
      bankId: digitsOnly.slice(0, 2),
      branch: digitsOnly.slice(2, 6),
      base: digitsOnly.slice(6, 13),
      suffix: digitsOnly.slice(13)
    };
  }

  if (digitsOnly.length === 18) {
    return {
      bankId: digitsOnly.slice(0, 2),
      branch: digitsOnly.slice(2, 6),
      base: digitsOnly.slice(6, 14),
      suffix: digitsOnly.slice(14)
    };
  }

  return null;
}

function normaliseBase(base: string): string | null {
  if (!/^\d{7,8}$/.test(base)) {
    return null;
  }

  if (base.length === 8) {
    if (!base.startsWith('0')) {
      return null;
    }

    return base.slice(1);
  }

  return base;
}

function normaliseSuffix(suffix: string): string | null {
  if (!/^\d{2,4}$/.test(suffix)) {
    return null;
  }

  let normalised = suffix;

  while (normalised.length > 2 && normalised.startsWith('0')) {
    normalised = normalised.slice(1);
  }

  if (normalised.length < 2 || normalised.length > 3) {
    return null;
  }

  return normalised;
}

export function decomposeNzAccount(account: NzAccountNumber): NzAccountParts {
  const digits = account as string;
  const suffixLength = digits.length - 13;
  const bankId = digits.slice(0, 2);
  const branch = digits.slice(2, 6);
  const base = digits.slice(6, 13);
  const suffix = digits.slice(13, 13 + suffixLength);

  return {
    bankId,
    branch,
    base,
    suffix,
    paddedBase: base.padStart(8, '0'),
    paddedSuffix: suffix.padStart(4, '0'),
    canonicalDigits: account
  };
}

export function parseNzAccount(
  input: string,
  options: ParseNzAccountOptions = {}
): Result<NzAccountNumber, NzAccountError> {
  const validateBankBranch = options.validateBankBranch ?? true;
  const normalised = normaliseInput(input);

  if (!normalised) {
    return fail(
      'Account number must be 4-part NZ account input or 15/16/18 digits.',
      {
        input
      }
    );
  }

  const bankId = normalised.bankId.padStart(2, '0');

  if (!/^\d{2}$/.test(bankId) || !/^\d{4}$/.test(normalised.branch)) {
    return fail('Bank and branch components must be 2 and 4 digits.', {
      input
    });
  }

  const base = normaliseBase(normalised.base);
  const suffix = normaliseSuffix(normalised.suffix);

  if (!base || !suffix) {
    return fail(
      'Base must be 7 digits and suffix must normalise to 2 or 3 digits.',
      {
        input
      }
    );
  }

  const canonicalDigits =
    `${bankId}${normalised.branch}${base}${suffix}` as NzAccountNumber;
  const parts = decomposeNzAccount(canonicalDigits);

  if (validateBankBranch) {
    const branchValidation = validateNzBankBranch(parts);

    if (!branchValidation.ok) {
      return branchValidation;
    }
  }

  if (options.branchHook) {
    const branchResult = options.branchHook(parts);

    if (branchResult === false) {
      return err(
        new NzAccountError(
          'NZ_ACCOUNT_BRANCH',
          'Account branch was rejected by the configured branch validation hook.',
          { input, branch: parts.branch }
        )
      );
    }

    if (typeof branchResult === 'object' && !branchResult.ok) {
      return err(
        new NzAccountError('NZ_ACCOUNT_BRANCH', branchResult.message, {
          input,
          branch: parts.branch
        })
      );
    }
  }

  if (options.validateChecksum) {
    const checksum = validateNzAccountChecksum(parts);

    if (!checksum.ok) {
      return checksum;
    }
  }

  return ok(canonicalDigits);
}

export function assertNzAccount(
  input: string,
  options?: ParseNzAccountOptions
): NzAccountNumber {
  const result = parseNzAccount(input, options);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function formatNzAccount(account: NzAccountNumber): string {
  const parts = decomposeNzAccount(account);
  return `${parts.bankId}-${parts.branch}-${parts.base}-${parts.suffix}`;
}
