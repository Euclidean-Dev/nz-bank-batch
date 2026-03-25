import type { NzAccountNumber } from './types.js';
import { decomposeNzAccount } from './account.js';

export type HashTotalOptions = {
  readonly width?: number;
};

export function computeBranchBaseHashTotal(
  accounts: readonly NzAccountNumber[],
  options: HashTotalOptions = {}
): bigint {
  const width = options.width ?? 11;
  const limit = 10n ** BigInt(width);
  let total = 0n;

  for (const account of accounts) {
    const parts = decomposeNzAccount(account);
    total = (total + BigInt(`${parts.branch}${parts.paddedBase}`)) % limit;
  }

  return total;
}
