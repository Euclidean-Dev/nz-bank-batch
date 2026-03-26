import { MoneyError } from '../shared/errors.js';
import { err, ok, type Result } from '../shared/result.js';
import type { Cents } from './types.js';

const MONEY_PATTERN = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;
const CENTS_PATTERN = /^[+-]?\d+$/;

export function toCents(value: bigint): Cents {
  return value as Cents;
}

export function parseCents(input: string | bigint): Result<Cents, MoneyError> {
  if (typeof input === 'bigint') {
    return ok(toCents(input));
  }

  const trimmed = input.trim();
  const moneyMatch = MONEY_PATTERN.exec(trimmed);

  if (moneyMatch) {
    const sign = moneyMatch[1] ?? '';
    const whole = moneyMatch[2] ?? '0';
    const fractionalRaw = moneyMatch[3] ?? '';
    const fractional = fractionalRaw.padEnd(2, '0');
    const centsValue = BigInt(whole) * 100n + BigInt(fractional || '0');
    const signedValue = sign === '-' ? -centsValue : centsValue;
    return ok(toCents(signedValue));
  }

  if (CENTS_PATTERN.test(trimmed)) {
    return ok(toCents(BigInt(trimmed)));
  }

  return err(
    new MoneyError(
      'INVALID_MONEY',
      'Money value must be a decimal string or bigint.',
      {
        input
      }
    )
  );
}

export function assertCents(input: string | bigint): Cents {
  const result = parseCents(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function formatCents(cents: Cents | bigint): string {
  return (cents as bigint).toString();
}
