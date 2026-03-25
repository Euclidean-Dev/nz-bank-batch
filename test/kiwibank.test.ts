import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createDirectCreditFile, createDirectDebitFile } from '../src/kiwibank.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Kiwibank adapter', () => {
  it('renders a direct credit file matching the golden fixture', () => {
    const file = createDirectCreditFile({
      fromAccount: '38-9000-7654321-00',
      originatorName: 'KIWI CAFE',
      batchReference: 'WEEKLY',
      processDate: '260323'
    });

    expect(
      file.addTransaction({
        counterpartyAccount: '01-0123-0456789-00',
        amount: '102.45',
        accountName: 'Milk Supplier',
        particulars: 'SUPPLY',
        code: 'WK12',
        reference: 'CAFE',
        information: ''
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        counterpartyAccount: '02-0001-0000001-00',
        amount: '50.00',
        accountName: 'Cleaner',
        particulars: 'SERVICES',
        code: 'WK12',
        reference: 'CAFE',
        information: ''
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 15245n,
      hashTotal: 12400456790n
    });
    expect(file.toString()).toBe(readFixture('kiwibank-direct-credit.txt'));
  });

  it('renders a direct debit file matching the golden fixture', () => {
    const file = createDirectDebitFile({
      fromAccount: '38-9000-7654321-00',
      originatorName: 'KIWI CAFE',
      batchReference: 'MEMBERS',
      processDate: '260323'
    });

    expect(
      file.addTransaction({
        counterpartyAccount: '01-0123-0456789-00',
        amount: '45.00',
        accountName: 'Gym Member',
        particulars: 'MEMBERSHIP',
        code: 'MAR',
        reference: 'DEBIT',
        information: ''
      }).ok
    ).toBe(true);

    expect(file.transactionCode).toBe('DD');
    expect(file.toString()).toBe(readFixture('kiwibank-direct-debit.txt'));
  });
});
