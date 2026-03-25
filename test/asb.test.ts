import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDirectCreditFile,
  createDirectDebitFile,
  parseDirectCreditFile,
  parseDirectDebitFile
} from '../src/asb.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('ASB adapter', () => {
  it('renders an MT9 direct credit file matching the golden fixture', () => {
    const file = createDirectCreditFile({
      fromAccount: '01-0123-0456789-00',
      dueDate: '23-03-2026',
      clientShortName: 'ACME PAYROLL'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        transactionCode: '052',
        internalReference: 'PAYROLL01',
        thisParty: {
          name: 'Jane Smith',
          code: 'MARCH',
          alphaReference: 'SALARY',
          particulars: 'PAY'
        },
        otherParty: {
          name: 'ACME PAYROLL',
          code: 'PAYROLL',
          alphaReference: 'MAR26',
          particulars: 'WAGES'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        transactionCode: '051',
        thisParty: {
          name: 'John Taylor',
          code: 'MARCH',
          alphaReference: 'SALARY',
          particulars: 'PAY'
        }
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10051n,
      hashTotal: 22001358023n
    });
    expect(file.toString()).toBe(readFixture('asb-direct-credit.mt9'));
  });

  it('renders an MT9 direct debit file matching the golden fixture', () => {
    const file = createDirectDebitFile({
      registrationId: '123456789012345',
      dueDate: new Date(Date.UTC(2026, 2, 23)),
      clientShortName: 'ACME RECEIPTS',
      contra: {
        account: '01-0123-0456789-00',
        code: 'GYM',
        alphaReference: 'MAR2026',
        particulars: 'MONTHLY'
      }
    });

    expect(
      file.addTransaction({
        toAccount: '02-0001-0000001-00',
        amount: '45.00',
        thisParty: {
          name: 'Gym Member',
          code: 'GYM',
          alphaReference: 'MAR2026',
          particulars: 'MONTHLY'
        }
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 9000n,
      hashTotal: 1240456790n
    });
    expect(file.toString()).toBe(readFixture('asb-direct-debit.mt9'));
  });

  it('parses an MT9 direct credit fixture and reproduces it exactly', () => {
    const fixture = readFixture('asb-direct-credit.mt9');
    const parsed = parseDirectCreditFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectCreditFile({
      fromAccount: parsed.value.fromAccount,
      dueDate: parsed.value.dueDate,
      clientShortName: parsed.value.clientShortName
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('parses an MT9 direct debit fixture and reproduces it exactly', () => {
    const fixture = readFixture('asb-direct-debit.mt9');
    const parsed = parseDirectDebitFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectDebitFile({
      registrationId: parsed.value.registrationId,
      dueDate: parsed.value.dueDate,
      clientShortName: parsed.value.clientShortName,
      ...(parsed.value.contra
        ? {
            contra: {
              account: parsed.value.contra.account,
              code: parsed.value.contra.code,
              alphaReference: parsed.value.contra.alphaReference,
              particulars: parsed.value.contra.particulars,
              otherPartyName: parsed.value.contra.otherPartyName
            }
          }
        : {})
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });
});