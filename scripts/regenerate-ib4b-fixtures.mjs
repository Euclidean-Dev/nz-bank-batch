import { writeFileSync } from 'node:fs';

import { createDirectCreditFile as createBnzCredit } from '../dist/bnz.js';
import {
  createDirectCreditFile as createKiwibankCredit,
  createDirectDebitFile as createKiwibankDebit
} from '../dist/kiwibank.js';

function writeFixture(path, content) {
  writeFileSync(path, content, 'utf8');
}

function regenerateBnzFixture() {
  const file = createBnzCredit({
    fromAccount: '02-0001-0000001-00',
    originatorName: 'BNZ EXPORTS',
    userReference: 'MAY2026',
    processDate: '20260323'
  });

  file.addTransaction({
    counterpartyAccount: '01-0902-0068389-00',
    amount: '500.00',
    accountName: 'Electric Co',
    particulars: 'INV123',
    code: 'UTIL',
    reference: 'APR',
    information: ''
  });

  file.addTransaction({
    counterpartyAccount: '06-1400-7654321-99',
    amount: '25.99',
    accountName: 'Phone Ltd',
    particulars: 'BILL',
    code: 'TEL',
    reference: 'APR',
    information: ''
  });

  writeFixture('test/fixtures/bnz-direct-credit.txt', file.toString());
}

function regenerateKiwibankFixtures() {
  const credit = createKiwibankCredit({
    fromAccount: '38-9000-7654321-00',
    originatorName: 'KIWI CAFE',
    batchReference: 'WEEKLY',
    processDate: '260323'
  });

  credit.addTransaction({
    counterpartyAccount: '01-0123-0456789-00',
    amount: '102.45',
    accountName: 'Milk Supplier',
    particulars: 'SUPPLY',
    code: 'WK12',
    reference: 'CAFE',
    information: ''
  });

  credit.addTransaction({
    counterpartyAccount: '02-0001-0000001-00',
    amount: '50.00',
    accountName: 'Cleaner',
    particulars: 'SERVICES',
    code: 'WK12',
    reference: 'CAFE',
    information: ''
  });

  writeFixture('test/fixtures/kiwibank-direct-credit.txt', credit.toString());

  const debit = createKiwibankDebit({
    fromAccount: '38-9000-7654321-00',
    originatorName: 'KIWI CAFE',
    batchReference: 'MEMBERS',
    processDate: '260323'
  });

  debit.addTransaction({
    counterpartyAccount: '01-0123-0456789-00',
    amount: '45.00',
    accountName: 'Gym Member',
    particulars: 'MEMBERSHIP',
    code: 'MAR',
    reference: 'DEBIT',
    information: ''
  });

  writeFixture('test/fixtures/kiwibank-direct-debit.txt', debit.toString());
}

regenerateBnzFixture();
regenerateKiwibankFixtures();
