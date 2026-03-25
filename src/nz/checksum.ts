import { NzAccountError } from '../shared/errors.js';
import { err, ok, type Result } from '../shared/result.js';
import { selectNzChecksumRule } from './banks.js';
import type { NzAccountParts, NzChecksumAlgorithm } from './types.js';

function digitsForChecksum(parts: NzAccountParts): readonly number[] {
  const composite = `${parts.bankId}${parts.branch}${parts.paddedBase}${parts.paddedSuffix}`;
  return Array.from(composite, (character) => Number(character));
}

function weightCharacterValue(weightCharacter: string): number {
  return weightCharacter === 'A' ? 10 : Number(weightCharacter);
}

function weightedModuloCheck(
  digits: readonly number[],
  weightFactor: string,
  modulo: number
): boolean {
  let total = 0;

  for (const [index, digit] of digits.entries()) {
    const weight = weightCharacterValue(weightFactor[index] ?? '0');
    total += digit * weight;
  }

  return total % modulo === 0;
}

export function selectChecksumAlgorithm(
  parts: Pick<NzAccountParts, 'bankId' | 'paddedBase'>
): NzChecksumAlgorithm {
  return selectNzChecksumRule(parts).algorithm;
}

export function validateNzAccountChecksum(
  parts: NzAccountParts
): Result<void, NzAccountError> {
  const rule = selectNzChecksumRule(parts);

  const digits = digitsForChecksum(parts);
  const valid = weightedModuloCheck(digits, rule.weightFactor, rule.modulo);

  if (!valid) {
    return err(
      new NzAccountError(
        'NZ_ACCOUNT_CHECKSUM',
        `Account ${parts.canonicalDigits} failed checksum validation.`,
        {
          algorithm: rule.algorithm,
          account: parts.canonicalDigits
        }
      )
    );
  }

  return ok(undefined);
}
