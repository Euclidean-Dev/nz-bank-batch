import { createDomesticExtendedFile as createAnzDomesticExtendedFile } from 'nz-bank-batch/anz';
import { createDirectCreditFile as createAsbFile } from 'nz-bank-batch/asb';
import { createDirectCreditFile as createBnzFile } from 'nz-bank-batch/bnz';
import {
  createDirectCreditFile as createKiwibankCreditFile,
  createDirectDebitFile as createKiwibankDebitFile
} from 'nz-bank-batch/kiwibank';
import { createDirectCreditFile as createTsbFile } from 'nz-bank-batch/tsb';
import {
  createDirectCreditFile as createWestpacCreditFile,
  createDirectDebitFile as createWestpacDebitFile
} from 'nz-bank-batch/westpac';
import { assertCents } from 'nz-bank-batch/nz';

const cents = assertCents('12.50');

createAnzDomesticExtendedFile({
  batchDueDate: '20260323'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: cents,
  otherPartyName: 'Jane Smith'
});

createAsbFile({
  fromAccount: '12-3200-0456789-00',
  dueDate: '20260323',
  clientShortName: 'ACME PAYROLL'
}).toBuffer();

createAsbFile({
  fromAccount: '12-3200-0456789-00',
  dueDate: '20260323',
  clientShortName: 'ACME PAYROLL'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: cents,
  thisParty: {
    name: 'Jane Smith',
    code: 'MARCH'
  }
});

createBnzFile({
  fromAccount: '02-0001-0000001-00',
  originatorName: 'BNZ EXPORTS',
  processDate: '20260323'
}).addTransaction({
  counterpartyAccount: '01-0902-0068389-00',
  amount: '500.00',
  accountName: 'Electric Co',
  particulars: 'INV123',
  code: 'UTIL',
  reference: 'APR',
  information: ''
});

createKiwibankCreditFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  processDate: '260323'
}).addTransaction({
  counterpartyAccount: '01-0123-0456789-00',
  amount: '102.45',
  accountName: 'Milk Supplier',
  particulars: 'SUPPLY',
  code: 'WK12',
  reference: 'CAFE',
  information: ''
});

createKiwibankDebitFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  processDate: '260323'
}).addTransaction({
  counterpartyAccount: '01-0123-0456789-00',
  amount: '45.00',
  accountName: 'Gym Member',
  particulars: 'MEMBERSHIP',
  code: 'MAR',
  reference: 'DEBIT',
  information: ''
});

createTsbFile({
  fromAccount: '15-3900-1234567-00',
  originatorName: 'TSB PAYMENTS',
  dueDate: '2026-03-23',
  batchNumber: 7
}).addTransaction({
  toAccount: '15-3900-7654321-01',
  amount: '102.45',
  accountName: 'Jane Smith',
  particulars: 'SALARY',
  code: 'MARCH',
  reference: 'PAY001'
});

createWestpacCreditFile({
  fromAccount: '03-1702-0456789-00',
  customerName: 'ACME PAYROLL LTD',
  scheduledDate: '230326'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: cents,
  accountName: 'Jane Smith',
  payerReference: 'PAY001',
  payeeAnalysis: 'MARCH26',
  payeeParticulars: 'SALARY'
});

createWestpacDebitFile({
  toAccount: '03-1702-0456789-00',
  customerName: 'ACME RECEIPTS LTD',
  scheduledDate: '230326'
}).addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  accountName: 'Gym Member',
  payerReference: 'MEM001',
  payerAnalysis: 'MARCH26',
  payerParticulars: 'MEMBER'
});
