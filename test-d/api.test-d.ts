import { expectAssignable, expectType } from 'tsd';
import type { Buffer } from 'node:buffer';

import type { Result } from '../dist/index.js';
import { compareParsedFileFixtures, compareParsedFiles } from '../dist/index.js';
import {
  createPortableDebitFile,
  createPortablePaymentFile,
  type PortableDebitFile,
  type PortableDebitFileError,
  type PortableDebitTransaction,
  type PortablePaymentFile,
  type PortablePaymentBank,
  type PortablePaymentCategory,
  type PortablePaymentFileError,
  type PortablePaymentTransaction
} from '../dist/portable.js';
import {
  createDirectCreditFile as createAsbCreditFile,
  createDirectDebitFile as createAsbDebitFile,
  parseDirectDebitFile as parseAsbDirectDebitFile,
  parseDirectCreditFile as parseAsbDirectCreditFile
} from '../dist/asb.js';
import type { BnzFileError } from '../dist/bnz.js';
import { createFile as createBnzFile, parseFile as parseBnzFile } from '../dist/bnz.js';
import {
  createDomesticExtendedFile as createAnzDomesticExtendedFile,
  parseDomesticExtendedFile as parseAnzDomesticExtendedFile
} from '../dist/anz.js';
import {
  createDirectCreditFile,
  createDirectDebitFile,
  parseFile as parseKiwibankFile
} from '../dist/kiwibank.js';
import {
  createPaymentCsvFile,
  parsePaymentCsvFile,
  parsePaymentFixedLengthFile
} from '../dist/westpac.js';
import {
  assertCents,
  assertNzAccount,
  parseNzAccount,
  type Cents,
  type DateInput,
  type NzAccountNumber
} from '../dist/nz.js';

const account = assertNzAccount('01-0123-0456789-00');
expectType<NzAccountNumber>(account);

const cents = assertCents('12.50');
expectType<Cents>(cents);

const inputDate = new Date() as DateInput;
expectType<DateInput>(inputDate);

const portableFile = createPortablePaymentFile({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD',
  paymentDate: new Date(Date.UTC(2026, 2, 23))
});
expectType<PortablePaymentFile>(portableFile);
expectAssignable<PortablePaymentCategory>('salary-and-wages');
expectAssignable<PortablePaymentBank>('westpac');
expectType<Result<void, PortablePaymentFileError>>(
  portableFile.addTransaction({
    toAccount: '12-3200-0123456-00',
    amount: '12.50',
    category: 'salary-and-wages',
    payee: {
      name: 'Jane Smith',
      particulars: 'SALARY'
    }
  } as PortablePaymentTransaction)
);

const portableDebitFile = createPortableDebitFile({
  bank: 'kiwibank',
  sourceAccount: '38-9000-7654321-00',
  collectorName: 'KIWI CAFE',
  collectionDate: new Date(Date.UTC(2026, 2, 23))
});
expectType<PortableDebitFile>(portableDebitFile);
expectType<Result<void, PortableDebitFileError>>(
  portableDebitFile.addTransaction({
    fromAccount: '01-0123-0456789-00',
    amount: '45.00',
    payer: {
      name: 'Gym Member'
    }
  } as PortableDebitTransaction)
);

const parsed = parseNzAccount('01-0123-0456789-00');
if (parsed.ok) {
  expectType<NzAccountNumber>(parsed.value);
}

const bnzFile = createBnzFile({
  type: 'direct-credit',
  fromAccount: '02-0001-0000001-00',
  originatorName: 'BNZ EXPORTS',
  processDate: new Date(Date.UTC(2026, 2, 23))
});
expectType<'DC' | 'DD'>(bnzFile.transactionCode);
expectType<Buffer>(bnzFile.toBuffer());
expectType<Result<void, BnzFileError>>(
  bnzFile.addTransaction({
    counterpartyAccount: '01-0902-0068389-00',
    amount: '12.50',
    accountName: 'Supplier'
  })
);

const parsedBnzFile = parseBnzFile('1,,,,020001000000100,7,260323,260323,\r\n2,010902006838900,50,1250,Supplier,,,,,BNZ EXPORTS,,,\r\n3,1250,1,90200068389\r\n');

if (parsedBnzFile.ok) {
  expectType<'direct-credit' | 'direct-debit'>(parsedBnzFile.value.kind);
  expectType<'DC' | 'DD'>(parsedBnzFile.value.transactionCode);
}

createAsbCreditFile({
  fromAccount: '01-0123-0456789-00',
  dueDate: '23-03-2026',
  clientShortName: 'ACME PAYROLL'
}).toBuffer();

createAsbCreditFile({
  fromAccount: '01-0123-0456789-00',
  dueDate: new Date(Date.UTC(2026, 2, 23)),
  clientShortName: 'ACME PAYROLL'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  internalReference: 'PAYROLL01',
  thisParty: {
    name: 'Jane Smith',
    code: 'MARCH'
  }
});

createAsbDebitFile({
  registrationId: '123456789012345',
  dueDate: '2026-03-23',
  clientShortName: 'ACME RECEIPTS',
  contra: {
    account: '01-0123-0456789-00',
    code: 'GYM',
    alphaReference: 'MAR2026',
    particulars: 'MONTHLY'
  }
}).addTransaction({
  toAccount: '02-0001-0000001-00',
  amount: '45.00',
  thisParty: {
    name: 'Gym Member',
    code: 'GYM',
    alphaReference: 'MAR2026',
    particulars: 'MONTHLY'
  }
});

const parsedAsbFile = parseAsbDirectCreditFile(
  '12010123045678900 20260323     ACME PAYROLL                                                                                                                     \r\n13123200012345600 0520000001250Jane Smith          000000000000MARCH       SALARY      PAY          ACME PAYROLL        PAYROLL     MAR26       WAGES           \r\n13992000123456      0000001250                                                                                                                                 \r\n'
);

if (parsedAsbFile.ok) {
  expectType<'direct-credit'>(parsedAsbFile.value.kind);
}

const parsedAsbDebitFile = parseAsbDirectDebitFile(
  '20123456789012345 20260323     ACME RECEIPTS                                                                                                                    \r\n13020001000000100 0000000004500Gym Member          000000000000GYM         MAR2026     MONTHLY                                                                    \r\n13010123045678900 0510000004500                    000000000000GYM         MAR2026     MONTHLY                                                                    \r\n139901240456790      0000009000                                                                                                                                 \r\n'
);

if (parsedAsbDebitFile.ok) {
  expectType<'direct-debit'>(parsedAsbDebitFile.value.kind);
}

createAnzDomesticExtendedFile({
  batchDueDate: '23-03-2026'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: 100n,
  otherPartyName: 'Jane Smith'
});

const parsedAnzFile = parseAnzDomesticExtendedFile(
  '01,12,032023,032023\r\n02,123200012345600,0000001250,50,Jane Smith,,,,,,,,\r\n03,0000001250,000001,32000123456\r\n'
);

if (parsedAnzFile.ok) {
  expectType<'domestic-extended'>(parsedAnzFile.value.kind);
}

createDirectCreditFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  processDate: '2026-03-23'
});

createDirectDebitFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  processDate: new Date(Date.UTC(2026, 2, 23))
});

const parsedKiwibankFile = parseKiwibankFile(
  '1,,,,389000765432100,7,260323,260323,\r\n2,010123045678900,00,4500,Gym Member,MEMBERSHIP,DEBIT,,,KIWI CAFE,MAR,DEBIT,MEMBERSHIP\r\n3,4500,1,12304567890\r\n'
);

if (parsedKiwibankFile.ok) {
  expectType<'direct-credit' | 'direct-debit'>(parsedKiwibankFile.value.kind);
  expectType<'DC' | 'DD'>(parsedKiwibankFile.value.transactionCode);
}

const westpacCsvFile = createPaymentCsvFile({
  fromAccount: '01-0123-0456789-00',
  customerName: 'ACME PAYROLL LTD',
  fileReference: 'MARCH2026',
  scheduledDate: '23-03-2026'
});

expectType<Buffer>(westpacCsvFile.toBuffer());

const parsedWestpacCsvFile = parsePaymentCsvFile(
  'A,000001,01,0123,,,,230326,ACME PAYROLL LTD,MARCH2026\r\nD,123200,0123456,00,1250,Jane Smith,PAY001,MARCH26,SALARY\r\n'
);

if (parsedWestpacCsvFile.ok) {
  expectType<'payment-csv'>(parsedWestpacCsvFile.value.kind);
}

const parsedWestpacFixedFile = parsePaymentFixedLengthFile(
  'A000001010123      230326ACME PAYROLL LTD                      MARCH2026                                                                                                                    \r\nD12320001234560000000001250Jane Smith                 PAY001              MARCH26             SALARY                                                                                        \r\n'
);

if (parsedWestpacFixedFile.ok) {
  expectType<'payment-fixed-length'>(parsedWestpacFixedFile.value.kind);
}

if (parsedAnzFile.ok && parsedWestpacCsvFile.ok) {
  expectType<boolean>(compareParsedFiles(parsedAnzFile.value, parsedAnzFile.value).equal);
}

const parsedFixtureComparison = compareParsedFileFixtures(
  '01,12,032023,032023\r\n02,123200012345600,0000001250,50,Jane Smith,,,,,,,,\r\n03,0000001250,000001,32000123456\r\n',
  '01,12,032023,032023\r\n02,123200012345600,0000001250,50,Jane Smith,,,,,,,,\r\n03,0000001250,000001,32000123456\r\n',
  parseAnzDomesticExtendedFile
);

if (parsedFixtureComparison.ok) {
  expectType<boolean>(parsedFixtureComparison.value.comparison.equal);
}

createBnzFile({
  // @ts-expect-error intentional invalid BNZ file type for type-surface validation
  type: 'international',
  fromAccount: '02-0001-0000001-00',
  originatorName: 'BNZ EXPORTS',
  processDate: '20260323'
});
