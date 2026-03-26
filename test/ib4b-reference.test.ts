import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseFile as parseBnzFile } from '../src/bnz.js';
import { parseFile as parseKiwibankFile } from '../src/kiwibank.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('IB4B reference fixture', () => {
  it('parses BNZ direct debit fixtures with summary information', () => {
    const fixture = readFixture('bnz-direct-debit.txt');
    const parsed = parseBnzFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    expect(parsed.value.kind).toBe('direct-debit');
    expect(parsed.value.transactionCode).toBe('DD');
    expect(parsed.value.summary).toEqual({
      count: 1,
      totalCents: 500n,
      hashTotal: 90200068389n
    });
  });

  it('parses Kiwibank direct debit fixtures with summary information', () => {
    const fixture = readFixture('kiwibank-direct-debit.txt');
    const parsed = parseKiwibankFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    expect(parsed.value.kind).toBe('direct-debit');
    expect(parsed.value.transactionCode).toBe('DD');
    expect(parsed.value.summary).toEqual({
      count: 1,
      totalCents: 4500n,
      hashTotal: 12300456789n
    });
  });
});
