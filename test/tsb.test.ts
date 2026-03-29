import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDirectCreditFile,
  createFile,
  parseDirectCreditFile,
  parseFile
} from '../src/tsb.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function readRenderedFixture(name: string): string {
  return `${readFixture(name)}\r\n`;
}

describe('TSB adapter', () => {
  it('renders a TSB direct credit CSV file matching the documented column order', () => {
    const file = createDirectCreditFile({
      fromAccount: '15-3900-1234567-00',
      originatorName: 'TSB PAYMENTS',
      dueDate: '2026-03-23',
      batchNumber: 7
    });

    expect(
      file.addTransaction({
        toAccount: '15-3900-7654321-01',
        amount: '102.45',
        accountName: 'Jane Smith',
        particulars: 'SALARY',
        code: 'MARCH',
        reference: 'PAY001'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '15-3900-0000010-00',
        amount: '88.01',
        accountName: 'Acme Ltd',
        particulars: 'INV',
        code: 'APR',
        reference: 'REF02'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 19046n,
      hashTotal: 1n
    });

    expect(file.toString()).toBe(readRenderedFixture('tsb-direct-credit.csv'));
  });

  it('rejects commas in free-text fields', () => {
    const file = createDirectCreditFile({
      fromAccount: '15-3900-1234567-00',
      originatorName: 'TSB PAYMENTS',
      dueDate: '2026-03-23'
    });

    const result = file.addTransaction({
      toAccount: '15-3900-7654321-01',
      amount: '1.00',
      accountName: 'Acme, Ltd',
      particulars: 'PAY'
    });

    expect(result.ok).toBe(false);
  });

  it('keeps the generic createFile alias working for direct credit output', () => {
    const file = createFile({
      fromAccount: '15-3900-1234567-00',
      originatorName: 'TSB PAYMENTS',
      dueDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '15-3900-7654321-01',
        amount: '1.00',
        accountName: 'Test Person',
        particulars: 'PAY'
      }).ok
    ).toBe(true);

    expect(file.toString()).toContain('D,0,15,3900,07654321,0001,000000,00000000100');
  });

  it('parses a TSB direct credit CSV file and reproduces it exactly', () => {
    const fixture = readRenderedFixture('tsb-direct-credit.csv');
    const parsed = parseDirectCreditFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectCreditFile({
      fromAccount: parsed.value.fromAccount,
      originatorName: parsed.value.originatorName,
      dueDate: parsed.value.dueDate,
      batchNumber: parsed.value.batchNumber,
      trailerRecordType: parsed.value.trailerRecordType
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('keeps the generic parser alias working for TSB files', () => {
    const parsed = parseFile(readRenderedFixture('tsb-direct-credit.csv'));

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.value.kind).toBe('direct-credit');
    }
  });
});