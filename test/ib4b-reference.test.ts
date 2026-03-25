import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDirectCreditFile as createBnzFile,
  parseFile as parseBnzFile
} from '../src/bnz.js';
import {
  createDirectCreditFile as createKiwibankFile,
  parseFile as parseKiwibankFile
} from '../src/kiwibank.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('IB4B reference fixture', () => {
  it('is reproduced exactly by the Kiwibank adapter', () => {
    const fixture = readFixture('gbf_ib4b_payment_260319.txt');
    const parsed = parseKiwibankFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createKiwibankFile({
      fromAccount: parsed.value.fromAccount,
      originatorName: parsed.value.originatorName,
      processDate: parsed.value.processDate,
      batchReference: parsed.value.batchReference
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('is reproduced exactly by the BNZ adapter', () => {
    const fixture = readFixture('gbf_ib4b_payment_260319.txt');
    const parsed = parseBnzFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createBnzFile({
      fromAccount: parsed.value.fromAccount,
      originatorName: parsed.value.originatorName,
      processDate: parsed.value.processDate,
      userReference: parsed.value.userReference
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

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
});