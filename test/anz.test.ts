import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createDomesticExtendedFile, parseDomesticExtendedFile } from '../src/anz.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('ANZ adapter', () => {
  it('renders an ANZ domestic extended file matching the golden fixture', () => {
    const file = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        otherPartyName: 'Jane Smith',
        otherPartyReference: 'Salary',
        otherPartyAnalysisCode: 'March',
        otherPartyParticulars: 'Pay',
        subscriberName: 'Acme Payroll',
        subscriberAnalysisCode: 'March2026',
        subscriberReference: 'Apr',
        subscriberParticulars: 'Pay'
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        otherPartyName: 'John Taylor',
        otherPartyReference: 'Salary',
        otherPartyAnalysisCode: 'March',
        otherPartyParticulars: 'Pay',
        subscriberName: 'Acme Payroll',
        subscriberAnalysisCode: 'March2026',
        subscriberReference: 'Apr',
        subscriberParticulars: 'Pay'
      }).ok
    ).toBe(true);

    expect(file.summary()).toEqual({
      count: 2,
      totalCents: 10051n,
      hashTotal: 22001358023n
    });
    expect(file.toString()).toBe(readFixture('anz-domestic-extended.txt'));
  });

  it('supports configurable line endings', () => {
    const file = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        otherPartyName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toString({ lineEnding: '\n' })).toContain('\n2,1232000123456000,50,100,TEST PERSON\n');
  });

  it('renders a UTF-8 buffer', () => {
    const file = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '1.00',
        otherPartyName: 'Test Person'
      }).ok
    ).toBe(true);

    expect(file.toBuffer()).toEqual(Buffer.from(file.toString(), 'utf8'));
  });

  it('parses an ANZ domestic extended fixture and reproduces it exactly', () => {
    const fixture = readFixture('anz-domestic-extended.txt');
    const parsed = parseDomesticExtendedFile(fixture);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw parsed.error;
    }

    const file = createDomesticExtendedFile({
      batchDueDate: parsed.value.batchDueDate,
      batchCreationDate: parsed.value.batchCreationDate
    });

    for (const transaction of parsed.value.transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(fixture);
  });
});
