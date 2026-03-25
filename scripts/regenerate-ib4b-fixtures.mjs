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

function regenerateReferenceFixture() {
  const file = createKiwibankCredit({
    fromAccount: '02-0001-1234567-00',
    originatorName: 'Demo Foundation',
    processDate: '260319'
  });

  const accounts = [
    '01-0902-0068389-00',
    '02-0001-0000001-00',
    '06-1400-7654321-99',
    '38-9000-7654321-00'
  ];

  for (let index = 1; index <= 384; index += 1) {
    const serial = String(index).padStart(3, '0');
    const sequence = String(index).padStart(4, '0');

    file.addTransaction({
      counterpartyAccount: accounts[(index - 1) % accounts.length],
      amount: (100 + index * 1.37).toFixed(2),
      accountName: `Provider ${serial}`.padEnd(20, ' '),
      particulars: `SERVICE ${sequence}`.slice(0, 12),
      code: `CLIENT-${serial}`.padEnd(12, ' ').slice(0, 12),
      reference: `REF ${sequence}`.padEnd(12, ' ').slice(0, 12),
      information:
        index % 5 === 0 ? `NOTE ${sequence}`.padEnd(12, ' ').slice(0, 12) : ''
    });
  }

  writeFixture('test/fixtures/gbf_ib4b_payment_260319.txt', file.toString());
}

regenerateBnzFixture();
regenerateKiwibankFixtures();
regenerateReferenceFixture();