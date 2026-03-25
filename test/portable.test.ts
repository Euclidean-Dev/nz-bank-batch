import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createPortableDebitFile, createPortablePaymentFile } from '../src/portable.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Portable payment API', () => {
  it('renders an ANZ file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'anz',
      sourceAccount: '01-0123-0456789-00',
      originatorName: 'Acme Payroll',
      paymentDate: '2026-03-23',
      batchCreationDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          reference: 'Salary',
          analysis: 'March',
          particulars: 'Pay'
        },
        payer: {
          name: 'Acme Payroll',
          analysis: 'March2026',
          reference: 'Apr',
          particulars: 'Pay'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          reference: 'Salary',
          analysis: 'March',
          particulars: 'Pay'
        },
        payer: {
          name: 'Acme Payroll',
          analysis: 'March2026',
          reference: 'Apr',
          particulars: 'Pay'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('anz-domestic-extended.txt'));
  });

  it('renders an ASB direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'asb',
      sourceAccount: '01-0123-0456789-00',
      originatorName: 'ACME PAYROLL',
      paymentDate: '23-03-2026'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        category: 'salary-and-wages',
        internalReference: 'PAYROLL01',
        payee: {
          name: 'Jane Smith',
          code: 'MARCH',
          reference: 'SALARY',
          particulars: 'PAY'
        },
        payer: {
          name: 'ACME PAYROLL',
          code: 'PAYROLL',
          reference: 'MAR26',
          particulars: 'WAGES'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          code: 'MARCH',
          reference: 'SALARY',
          particulars: 'PAY'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('asb-direct-credit.mt9'));
  });

  it('renders a BNZ direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'bnz',
      sourceAccount: '02-0001-0000001-00',
      originatorName: 'BNZ EXPORTS',
      batchReference: 'MAY2026',
      paymentDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        toAccount: '01-0902-0068389-00',
        amount: '500.00',
        payee: {
          name: 'Electric Co',
          particulars: 'INV123',
          code: 'UTIL',
          reference: 'APR'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '06-1400-7654321-99',
        amount: '25.99',
        payee: {
          name: 'Phone Ltd',
          particulars: 'BILL',
          code: 'TEL',
          reference: 'APR'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('bnz-direct-credit.txt'));
  });

  it('renders a Kiwibank direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'kiwibank',
      sourceAccount: '38-9000-7654321-00',
      originatorName: 'KIWI CAFE',
      batchReference: 'WEEKLY',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '01-0123-0456789-00',
        amount: '102.45',
        payee: {
          name: 'Milk Supplier',
          particulars: 'SUPPLY',
          code: 'WK12',
          reference: 'CAFE'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '02-0001-0000001-00',
        amount: '50.00',
        payee: {
          name: 'Cleaner',
          particulars: 'SERVICES',
          code: 'WK12',
          reference: 'CAFE'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('kiwibank-direct-credit.txt'));
  });

  it('renders Westpac CSV and fixed-length payment files from the neutral payment model', () => {
    const csvFile = createPortablePaymentFile({
      bank: 'westpac',
      sourceAccount: '01-0123-0456789-00',
      originatorName: 'ACME PAYROLL LTD',
      batchReference: 'MARCH2026',
      paymentDate: '2026-03-23',
      renderFormat: 'csv'
    });

    const fixedFile = createPortablePaymentFile({
      bank: 'westpac',
      sourceAccount: '01-0123-0456789-00',
      originatorName: 'ACME PAYROLL LTD',
      batchReference: 'MARCH2026',
      paymentDate: '2026-03-23',
      renderFormat: 'fixed-length'
    });

    const transactions = [
      {
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          analysis: 'MARCH26',
          particulars: 'SALARY'
        },
        payer: {
          reference: 'PAY001'
        }
      },
      {
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          analysis: 'MARCH26',
          particulars: 'SALARY'
        },
        payer: {
          reference: 'PAY002'
        }
      }
    ] as const;

    for (const transaction of transactions) {
      expect(csvFile.addTransaction(transaction).ok).toBe(true);
      expect(fixedFile.addTransaction(transaction).ok).toBe(true);
    }

    expect(csvFile.toString()).toBe(readFixture('westpac-payment.csv'));
    expect(fixedFile.toString()).toBe(readFixture('westpac-payment-fixed.txt'));
  });
});

describe('Portable direct debit API', () => {
  it('renders an ASB direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'asb',
      collectorName: 'ACME RECEIPTS',
      collectionDate: '2026-03-23',
      registrationId: '123456789012345',
      contra: {
        account: '01-0123-0456789-00',
        code: 'GYM',
        reference: 'MAR2026',
        particulars: 'MONTHLY'
      }
    });

    expect(
      file.addTransaction({
        fromAccount: '02-0001-0000001-00',
        amount: '45.00',
        payer: {
          name: 'Gym Member',
          code: 'GYM',
          reference: 'MAR2026',
          particulars: 'MONTHLY'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('asb-direct-debit.mt9'));
  });

  it('renders a BNZ direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'bnz',
      sourceAccount: '02-0001-0000001-00',
      collectorName: 'BNZ EXPORTS',
      collectionDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '01-0902-0068389-00',
        amount: '5.00',
        payer: {
          name: 'Debit Person'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('bnz-direct-debit.txt'));
  });

  it('renders a Kiwibank direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'kiwibank',
      sourceAccount: '38-9000-7654321-00',
      collectorName: 'KIWI CAFE',
      batchReference: 'MEMBERS',
      collectionDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '01-0123-0456789-00',
        amount: '45.00',
        payer: {
          name: 'Gym Member',
          particulars: 'MEMBERSHIP',
          reference: 'DEBIT'
        },
        collector: {
          code: 'MAR'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('kiwibank-direct-debit.txt'));
  });
});