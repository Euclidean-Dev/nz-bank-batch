import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDirectCreditFile,
  createDirectDebitFile,
  createPaymentCsvFile,
  parseDirectCreditFile,
  parseDirectDebitFile,
  parseFile,
  parsePaymentCsvFile
} from '../src/westpac.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Westpac adapter', () => {
  it('renders a Deskbank direct credit CSV file matching the documented field order', () => {
    const file = createDirectCreditFile({
      fromAccount: '03-1702-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        accountName: 'Jane Smith',
        payerReference: 'PAY001',
        payeeAnalysis: 'MARCH26',
        payeeParticulars: 'SALARY'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        accountName: 'John Taylor',
        payerReference: 'PAY002',
        payeeAnalysis: 'MARCH26',
        payeeParticulars: 'SALARY'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10051n,
      hashTotal: 20001358023n
    });

    expect(file.toString()).toBe(readFixture('westpac-payment.csv'));
    expect(file.toString()).not.toContain('"');
  });

  it('renders a Deskbank direct debit CSV file matching the documented field order', () => {
    const file = createDirectDebitFile({
      toAccount: '03-1702-0456789-00',
      customerName: 'ACME RECEIPTS LTD',
      fileReference: 'MEMBERSHIP',
      scheduledDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        fromAccount: '12-3200-0123456-00',
        amount: '45.00',
        accountName: 'Jane Smith',
        payerReference: 'INV001',
        payerAnalysis: 'MARCH26',
        payerParticulars: 'MEMBER'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        fromAccount: '38-9000-1234567-02',
        amount: '55.00',
        accountName: 'John Taylor',
        payerReference: 'INV002',
        payerAnalysis: 'MARCH26',
        payerParticulars: 'MEMBER'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10000n,
      hashTotal: 20001358023n
    });

    expect(file.toString()).toBe(readFixture('westpac-direct-debit.csv'));
  });

  it('keeps the payment CSV alias working for direct credit output', () => {
    const file = createPaymentCsvFile({
      fromAccount: '03-1702-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        accountName: 'Test Person',
        transactionCode: '52'
      }).ok
    ).toBe(true);

    expect(file.toString()).toContain(',52,DC,100,');
  });

  it('renders a UTF-8 buffer', () => {
    const file = createPaymentCsvFile({
      fromAccount: '03-1702-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '23-03-2026'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        accountName: 'Test Person',
        transactionCode: '50',
        payeeAnalysis: 'MARCH26'
      }).ok
    ).toBe(true);

    expect(file.toBuffer()).toEqual(Buffer.from(file.toString(), 'utf8'));
  });

  it('normalises an 8-digit scheduledDate input down to Westpac DDMMYY output', () => {
    const file = createPaymentCsvFile({
      fromAccount: '03-1702-0456789-00',
      scheduledDate: '23032026'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        accountName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toString()).toContain('A,000001,03,1702,,,,230326,');
  });

  it('rejects config accounts that do not belong to Westpac', () => {
    const wrongWestpacAccount = '01-0123-0456789-00' as string;

    expect(() =>
      createDirectCreditFile({
        fromAccount: wrongWestpacAccount,
        customerName: 'ACME PAYROLL LTD',
        scheduledDate: '2026-03-23'
      } as Parameters<typeof createDirectCreditFile>[0])
    ).toThrowError(/expected bank 03/i);
  });

  it('rejects direct debit config accounts that do not belong to Westpac', () => {
    const wrongWestpacAccount = '01-0123-0456789-00' as string;

    expect(() =>
      createDirectDebitFile({
        toAccount: wrongWestpacAccount,
        customerName: 'ACME RECEIPTS LTD',
        scheduledDate: '2026-03-23'
      } as Parameters<typeof createDirectDebitFile>[0])
    ).toThrowError(/expected bank 03/i);
  });

  it('parses a Deskbank direct credit CSV file and reproduces it exactly', () => {
    const fixture = readFixture('westpac-payment.csv');
    const parsed = parseDirectCreditFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectCreditFile({
      fromAccount: parsed.value.fromAccount,
      customerName: parsed.value.customerName,
      fileReference: parsed.value.fileReference,
      scheduledDate: parsed.value.scheduledDate
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('parses a Deskbank direct debit CSV file and reproduces it exactly', () => {
    const fixture = readFixture('westpac-direct-debit.csv');
    const parsed = parseDirectDebitFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectDebitFile({
      toAccount: parsed.value.toAccount,
      customerName: parsed.value.customerName,
      fileReference: parsed.value.fileReference,
      scheduledDate: parsed.value.scheduledDate
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('keeps the payment CSV parser alias working for direct credit files', () => {
    const parsed = parsePaymentCsvFile(readFixture('westpac-payment.csv'));

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.value.kind).toBe('direct-credit');
    }
  });

  it('detects both direct credit and direct debit files via the generic parser', () => {
    const credit = parseFile(readFixture('westpac-payment.csv'));
    const debit = parseFile(readFixture('westpac-direct-debit.csv'));

    expect(credit.ok).toBe(true);
    expect(debit.ok).toBe(true);

    if (credit.ok && credit.value.kind === 'direct-credit') {
      expect(credit.value.kind).toBe('direct-credit');
      expect(credit.value.transactions[0]?.transactionCode).toBe('50');
    }

    if (debit.ok && debit.value.kind === 'direct-debit') {
      expect(debit.value.kind).toBe('direct-debit');
      expect(debit.value.transactions[0]?.payerAnalysis).toBe('MARCH26');
    }
  });
});
