import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDirectCreditFile,
  createDirectDebitFile,
  parseDirectDebitFile,
  parseDirectCreditFile
} from '../src/anz.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('ANZ adapter', () => {
  it('renders an ANZ direct credit MTS file matching the golden fixture', () => {
    const file = createDirectCreditFile({
      batchDueDate: '2026-03-23',
      batchCreationDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payeeName: 'Jane Smith',
        payeeReference: 'Salary',
        payeeAnalysis: 'March',
        payeeParticulars: 'Pay',
        originatorName: 'Acme Payroll',
        originatorAnalysis: 'March2026',
        originatorReference: 'Apr',
        originatorParticulars: 'Pay'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payeeName: 'John Taylor',
        payeeReference: 'Salary',
        payeeAnalysis: 'March',
        payeeParticulars: 'Pay',
        originatorName: 'Acme Payroll',
        originatorAnalysis: 'March2026',
        originatorReference: 'Apr',
        originatorParticulars: 'Pay'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10051n,
      hashTotal: 22001358023n
    });
    expect(file.toString()).toBe(readFixture('anz-direct-credit-mts.txt'));
  });

  it('supports configurable line endings', () => {
    const file = createDirectCreditFile({
      batchDueDate: '23-03-2026',
      batchCreationDate: '2026/03/23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        payeeName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toString({ lineEnding: '\n' })).toContain(
      '\n2,1232000123456000,50,100,TEST PERSON\n'
    );
  });

  it('renders a UTF-8 buffer', () => {
    const file = createDirectCreditFile({
      batchDueDate: new Date(Date.UTC(2026, 2, 23)),
      batchCreationDate: '20260323'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        payeeName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toBuffer()).toEqual(Buffer.from(file.toString(), 'utf8'));
  });

  it('parses an ANZ direct credit MTS fixture and reproduces it exactly', () => {
    const fixture = readFixture('anz-direct-credit-mts.txt');
    const parsed = parseDirectCreditFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectCreditFile({
      batchDueDate: parsed.value.batchDueDate,
      batchCreationDate: parsed.value.batchCreationDate
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });

  it('renders an ANZ direct debit MTS file matching the golden fixture', () => {
    const file = createDirectDebitFile({
      batchDueDate: '2026-03-23',
      batchCreationDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        fromAccount: '12-3200-0123456-00',
        amount: '45.00',
        organisationName: 'Acme Receipts',
        customerReference: 'Member001'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        fromAccount: '38-9000-1234567-02',
        amount: '55.00',
        organisationName: 'Acme Receipts',
        customerReference: 'Member002'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10000n,
      hashTotal: 22001358023n
    });
    expect(file.toString()).toBe(readFixture('anz-direct-debit-mts.txt'));
  });

  it('parses an ANZ direct debit MTS fixture and reproduces it exactly', () => {
    const fixture = readFixture('anz-direct-debit-mts.txt');
    const parsed = parseDirectDebitFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDirectDebitFile({
      batchDueDate: parsed.value.batchDueDate,
      batchCreationDate: parsed.value.batchCreationDate
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });
});
