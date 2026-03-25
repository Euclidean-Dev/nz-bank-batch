import { writeFileSync } from 'node:fs';

import { createPaymentCsvFile, createPaymentFixedLengthFile } from '../dist/westpac.js';

function writeFixture(path, content) {
  writeFileSync(path, content, 'utf8');
}

function regenerateWestpacFixtures() {
  const csv = createPaymentCsvFile({
    fromAccount: '01-0123-0456789-00',
    customerName: 'ACME PAYROLL LTD',
    fileReference: 'MARCH2026',
    scheduledDate: '230326'
  });

  csv.addTransaction({
    toAccount: '12-3200-0123456-00',
    amount: '12.50',
    accountName: 'Jane Smith',
    payerReference: 'PAY001',
    payeeAnalysis: 'MARCH26',
    payeeParticulars: 'SALARY'
  });

  csv.addTransaction({
    toAccount: '38-9000-1234567-02',
    amount: '88.01',
    accountName: 'John Taylor',
    payerReference: 'PAY002',
    payeeAnalysis: 'MARCH26',
    payeeParticulars: 'SALARY'
  });

  writeFixture('test/fixtures/westpac-payment.csv', csv.toString());

  const fixed = createPaymentFixedLengthFile({
    fromAccount: '01-0123-0456789-00',
    customerName: 'ACME PAYROLL LTD',
    fileReference: 'MARCH2026',
    scheduledDate: '230326'
  });

  fixed.addTransaction({
    toAccount: '12-3200-0123456-00',
    amount: '12.50',
    accountName: 'Jane Smith',
    payerReference: 'PAY001',
    payeeAnalysis: 'MARCH26',
    payeeParticulars: 'SALARY'
  });

  fixed.addTransaction({
    toAccount: '38-9000-1234567-02',
    amount: '88.01',
    accountName: 'John Taylor',
    payerReference: 'PAY002',
    payeeAnalysis: 'MARCH26',
    payeeParticulars: 'SALARY'
  });

  writeFixture('test/fixtures/westpac-payment-fixed.txt', fixed.toString());
}

regenerateWestpacFixtures();