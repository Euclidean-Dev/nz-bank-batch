import { describe, expect, it } from 'vitest';

import { renderCsvRecord } from '../src/index.js';
import {
  NZ_BANKS,
  assertCents,
  assertNzAccount,
  computeBranchBaseHashTotal,
  decomposeNzAccount,
  formatCents,
  formatNzAccount,
  getNzBank,
  isValidNzBankBranch,
  parseCents,
  parseNzAccount,
  parseYyMmDd,
  parseYyyyMmDd,
  selectChecksumAlgorithm,
  selectNzChecksumRule,
  validateNzAccountChecksum
} from '../src/nz.js';

describe('NZ primitives', () => {
  it('parses decimal money without float math', () => {
    const cents = assertCents('12.50');
    expect(cents).toBe(1250n);
    expect(formatCents(cents)).toBe('1250');
  });

  it('parses integer strings as whole-dollar inputs', () => {
    const cents = assertCents('12');
    expect(cents).toBe(1200n);
  });

  it('rejects malformed money strings', () => {
    const result = parseCents('12.345');
    expect(result.ok).toBe(false);
  });

  it('validates YYMMDD and YYYYMMDD dates', () => {
    expect(parseYyMmDd('260323').ok).toBe(true);
    expect(parseYyyyMmDd('20260323').ok).toBe(true);
    expect(parseYyMmDd('260230').ok).toBe(false);
  });

  it('normalises hyphenated NZ accounts to canonical digits', () => {
    const account = assertNzAccount('01-0123-0456789-00');
    expect(account).toBe('010123045678900');
    expect(formatNzAccount(account)).toBe('01-0123-0456789-00');
  });

  it('accepts official 18-digit padded account input and normalises it', () => {
    const result = parseNzAccount('010123004567890000');
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toBe('010123045678900');
    }
  });

  it('computes branch-base hash totals with overflow handling', () => {
    const hash = computeBranchBaseHashTotal([
      assertNzAccount('12-3200-0123456-00'),
      assertNzAccount('38-9000-1234567-02')
    ]);

    expect(hash).toBe(20001358023n);
  });

  it('exports the full NZ bank registry from the built-in branch table', () => {
    expect(NZ_BANKS).toHaveLength(33);
    expect(getNzBank('38')?.branches[0]).toEqual({ from: 9000, to: 9499 });
    expect(isValidNzBankBranch('12', '3200')).toBe(true);
    expect(isValidNzBankBranch('12', '3350')).toBe(false);
  });

  it('rejects invalid bank branch combinations by default', () => {
    const result = parseNzAccount('12-3350-0123456-00');
    expect(result.ok).toBe(false);
  });

  it('still allows branch validation to be disabled explicitly', () => {
    const result = parseNzAccount('12-3350-0123456-00', {
      validateBankBranch: false
    });

    expect(result.ok).toBe(true);
  });

  it('selects checksum algorithms for all supported rule families', () => {
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('01-0123-0456789-00')))
    ).toBe('A');
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('08-6500-1234567-00')))
    ).toBe('D');
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('09-0000-0000010-00')))
    ).toBe('E');
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('25-2500-1234567-00')))
    ).toBe('F');
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('26-2600-1234567-00')))
    ).toBe('G');
    expect(
      selectChecksumAlgorithm(decomposeNzAccount(assertNzAccount('31-2800-1234567-00')))
    ).toBe('X');
  });

  it('uses the integrated bank checksum rule metadata', () => {
    expect(selectNzChecksumRule(decomposeNzAccount(assertNzAccount('25-2500-1234567-00')))).toEqual({
      algorithm: 'F',
      weightFactor: '000000017317310000',
      modulo: 10
    });
  });

  it('can validate a generated checksum-compatible account for supported algorithms', () => {
    let valid = null as ReturnType<typeof assertNzAccount> | null;

    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const candidate = assertNzAccount(
        `26-2600-1234567-${String(suffix).padStart(3, '0')}`
      );
      const checksum = validateNzAccountChecksum(decomposeNzAccount(candidate));

      if (checksum.ok) {
        valid = candidate;
        break;
      }
    }

    expect(valid).not.toBeNull();
  });

  it('rejects commas and truncates long CSV fields explicitly', () => {
    const invalid = renderCsvRecord([
      { value: '1', spec: { name: 'recordType', required: true } },
      { value: 'bad,value', spec: { name: 'narration', required: true } }
    ]);

    expect(invalid.ok).toBe(false);

    const truncated = renderCsvRecord([
      { value: '1', spec: { name: 'recordType', required: true } },
      {
        value: '0123456789ABCDE',
        spec: { name: 'narration', maxLength: 12, truncate: true }
      }
    ]);

    expect(truncated.ok).toBe(true);
    if (truncated.ok) {
      expect(truncated.value).toBe('1,0123456789AB');
    }
  });
});
