import { describe, expect, it } from 'vitest';

import {
  compareParsedFileFixtures,
  compareParsedFiles,
  formatParsedFileComparison
} from '../src/index.js';
import { createDomesticExtendedFile, parseDomesticExtendedFile } from '../src/anz.js';

describe('Parsed file comparison', () => {
  it('reports field-level differences between parsed files', () => {
    const expectedFile = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      expectedFile.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        otherPartyName: 'Jane Smith'
      }).ok
    ).toBe(true);

    const actualFile = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      actualFile.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '13.50',
        otherPartyName: 'Jane Jones'
      }).ok
    ).toBe(true);

    const expectedParsed = parseDomesticExtendedFile(expectedFile.toString());
    const actualParsed = parseDomesticExtendedFile(actualFile.toString());

    expect(expectedParsed.ok).toBe(true);
    expect(actualParsed.ok).toBe(true);

    if (!expectedParsed.ok || !actualParsed.ok) {
      throw new Error('Expected parsed ANZ fixtures to be valid.');
    }

    const comparison = compareParsedFiles(expectedParsed.value, actualParsed.value);

    expect(comparison.equal).toBe(false);
    expect(
      comparison.differences.some((difference) => difference.path === 'transactions[0].amount')
    ).toBe(true);
    expect(
      comparison.differences.some(
        (difference) => difference.path === 'transactions[0].otherPartyName'
      )
    ).toBe(true);
    expect(formatParsedFileComparison(comparison)).toContain('transactions[0].amount');
  });

  it('compares raw fixtures by parsing them first', () => {
    const expectedFile = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      expectedFile.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        otherPartyName: 'Jane Smith'
      }).ok
    ).toBe(true);

    const actualFile = createDomesticExtendedFile({
      batchDueDate: '20260323',
      batchCreationDate: '20260323'
    });

    expect(
      actualFile.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        otherPartyName: 'Jane Smith',
        subscriberReference: 'APR'
      }).ok
    ).toBe(true);

    const comparison = compareParsedFileFixtures(
      expectedFile.toString(),
      actualFile.toString(),
      parseDomesticExtendedFile
    );

    expect(comparison.ok).toBe(true);

    if (!comparison.ok) {
      throw new Error(JSON.stringify(comparison.error));
    }

    expect(comparison.value.expectedParsed.kind).toBe('domestic-extended');
    expect(comparison.value.comparison.equal).toBe(false);
    expect(
      comparison.value.comparison.differences.some(
        (difference) => difference.path === 'transactions[0].subscriberReference'
      )
    ).toBe(true);
  });
});