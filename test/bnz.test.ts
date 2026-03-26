import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createDirectCreditFile, createDirectDebitFile } from '../src/bnz.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('BNZ adapter', () => {
  it('renders a direct credit file matching the golden fixture', () => {
    const file = createDirectCreditFile({
      fromAccount: '02-0001-0000001-00',
      originatorName: 'BNZ EXPORTS',
      userReference: 'MAY2026',
      processDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        counterpartyAccount: '01-0902-0068389-00',
        amount: '500.00',
        accountName: 'Electric Co',
        particulars: 'INV123',
        code: 'UTIL',
        reference: 'APR',
        information: ''
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        counterpartyAccount: '06-1400-7654321-99',
        amount: '25.99',
        accountName: 'Phone Ltd',
        particulars: 'BILL',
        code: 'TEL',
        reference: 'APR',
        information: ''
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 52599n,
      hashTotal: 30207722710n
    });
    expect(file.toString()).toBe(readFixture('bnz-direct-credit.txt'));
  });

  it('renders direct debit with the DD transaction code', () => {
    const file = createDirectDebitFile({
      fromAccount: '02-0001-0000001-00',
      originatorName: 'BNZ EXPORTS',
      processDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        counterpartyAccount: '01-0902-0068389-00',
        amount: '5.00',
        accountName: 'Debit Person'
      }).ok
    ).toBe(true);

    expect(file.transactionCode).toBe('DD');
    expect(file.toString()).toBe(readFixture('bnz-direct-debit.txt'));
  });
});
