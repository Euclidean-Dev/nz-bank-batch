import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createPaymentCsvFile,
  createPaymentFixedLengthFile,
  parsePaymentCsvFile,
  parsePaymentFixedLengthFile
} from '../src/westpac.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Westpac adapter', () => {
  it('renders a Deskbank payment CSV file matching the documented field order', () => {
    const file = createPaymentCsvFile({
      fromAccount: '01-0123-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '230326'
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

  it('renders a Deskbank payment fixed-length file matching the documented layout', () => {
    const file = createPaymentFixedLengthFile({
      fromAccount: '01-0123-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '230326'
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

    expect(file.toString()).toBe(readFixture('westpac-payment-fixed.txt'));
  });

  it('renders a UTF-8 buffer', () => {
    const file = createPaymentCsvFile({
      fromAccount: '01-0123-0456789-00',
      customerName: 'ACME PAYROLL LTD',
      fileReference: 'MARCH2026',
      scheduledDate: '230326'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        accountName: 'Test Person',
        payeeAnalysis: 'MARCH26'
      }).ok
    ).toBe(true);

    expect(file.toBuffer()).toEqual(Buffer.from(file.toString(), 'utf8'));
  });

  it('normalises an 8-digit scheduledDate input down to Westpac DDMMYY output', () => {
    const file = createPaymentCsvFile({
      fromAccount: '01-0123-0456789-00',
      scheduledDate: '23032026'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        accountName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toString()).toContain('A,000001,03,0123,,,,230326,');
  });

  it('parses a Deskbank payment CSV file and reproduces it exactly', () => {
    const fixture = readFixture('westpac-payment.csv');
    const parsed = parsePaymentCsvFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createPaymentCsvFile({
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

  it('parses a Deskbank payment fixed-length file and reproduces it exactly', () => {
    const fixture = readFixture('westpac-payment-fixed.txt');
    const parsed = parsePaymentFixedLengthFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createPaymentFixedLengthFile({
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
});