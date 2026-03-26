import { expectAssignable, expectNotAssignable, expectType } from 'tsd';
import type { Buffer } from 'node:buffer';

import type { Result } from '../dist/index.js';
import {
  compareParsedFileFixtures,
  compareParsedFiles
} from '../dist/index.js';
import {
  createPortableDebitFile,
  createPortablePaymentFile,
  explainValidationError,
  validatePortablePaymentBatch,
  validatePortablePaymentFileConfig,
  validatePortablePaymentTransaction,
  type PortableAnzDebitFileConfig,
  type PortableDebitFile,
  type PortableDebitFileConfig,
  type PortableDebitFileError,
  type PortableDebitTransaction,
  type PortablePaymentFile,
  type PortablePaymentBank,
  type PortablePaymentCategory,
  type PortablePaymentFileConfig,
  type PortablePaymentFileError,
  type PortablePaymentValidationIssue,
  type PortablePaymentValidationResult,
  type PortablePaymentTransaction
} from '../dist/portable.js';
import {
  createDirectCreditFile as createAsbCreditFile,
  createDirectDebitFile as createAsbDebitFile,
  parseDirectDebitFile as parseAsbDirectDebitFile,
  parseDirectCreditFile as parseAsbDirectCreditFile
} from '../dist/asb.js';
import type { BnzFileError } from '../dist/bnz.js';
import {
  createFile as createBnzFile,
  parseFile as parseBnzFile
} from '../dist/bnz.js';
import {
  createDirectCreditFile as createAnzDirectCreditFile,
  createDirectDebitFile as createAnzDirectDebitFile,
  createDomesticExtendedFile as createAnzDomesticExtendedFile,
  parseDirectCreditFile as parseAnzDirectCreditFile,
  parseDirectDebitFile as parseAnzDirectDebitFile,
  parseDomesticExtendedFile as parseAnzDomesticExtendedFile
} from '../dist/anz.js';
import {
  createDirectCreditFile,
  createDirectDebitFile,
  parseFile as parseKiwibankFile
} from '../dist/kiwibank.js';
import {
  createDirectCreditFile as createWestpacDirectCreditFile,
  createDirectDebitFile as createWestpacDirectDebitFile,
  createPaymentCsvFile,
  parseDirectCreditFile as parseWestpacDirectCreditFile,
  parseDirectDebitFile as parseWestpacDirectDebitFile,
  parsePaymentCsvFile
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

expectNotAssignable<PortablePaymentFileConfig>({
  bank: 'anz',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD',
  westpacRenderFormat: 'csv'
});

expectNotAssignable<PortablePaymentFileConfig>({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD',
  westpacRenderFormat: 'csv'
});

expectNotAssignable<PortablePaymentFileConfig>({
  bank: 'bnz',
  sourceAccount: '02-0001-0000001-00',
  originatorName: 'BNZ EXPORTS',
  batchCreationDate: '2026-03-23'
});

expectNotAssignable<PortablePaymentFileConfig>({
  bank: 'anz',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD',
  batchReference: 'MARCH2026'
});

const configValidation = validatePortablePaymentFileConfig({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD'
});
expectType<PortablePaymentValidationResult>(configValidation);

const transactionValidation = validatePortablePaymentTransaction(
  {
    toAccount: '12-3200-0123456-00',
    amount: '12.50',
    payee: {
      name: 'Jane Smith'
    }
  },
  { bank: 'westpac' }
);
expectType<PortablePaymentValidationResult>(transactionValidation);
expectAssignable<readonly PortablePaymentValidationIssue[]>(
  transactionValidation.errors
);
expectAssignable<readonly PortablePaymentValidationIssue[]>(
  transactionValidation.warnings
);

const batchValidation = validatePortablePaymentBatch({
  config: {
    bank: 'bnz',
    sourceAccount: '02-0001-0000001-00',
    originatorName: 'BNZ EXPORTS'
  },
  transactions: [
    {
      toAccount: '01-0902-0068389-00',
      amount: '12.50',
      payee: {
        name: 'Supplier'
      }
    }
  ]
});
expectType<PortablePaymentValidationResult>(batchValidation);

expectAssignable<PortableAnzDebitFileConfig>({
  bank: 'anz',
  collectorName: 'ACME RECEIPTS',
  collectionDate: '2026-03-23',
  batchCreationDate: '2026-03-23'
});

expectNotAssignable<PortableDebitFileConfig>({
  bank: 'anz',
  collectorName: 'ACME RECEIPTS',
  sourceAccount: '01-0123-0456789-00'
});

const portableDebitFile = createPortableDebitFile({
  bank: 'westpac',
  collectorName: 'ACME RECEIPTS',
  sourceAccount: '01-0123-0456789-00',
  collectionDate: new Date(Date.UTC(2026, 2, 23))
});
expectType<PortableDebitFile>(portableDebitFile);
expectType<Result<void, PortableDebitFileError>>(
  portableDebitFile.addTransaction({
    fromAccount: '01-0123-0456789-00',
    amount: '45.00',
    payer: {
      name: 'Gym Member',
      reference: 'MEM001'
    }
  } as PortableDebitTransaction)
);

const parsed = parseNzAccount('01-0123-0456789-00');
if (parsed.ok) {
  expectType<NzAccountNumber>(parsed.value);
}

if (!parsed.ok) {
  expectType<string | undefined>(
    explainValidationError(parsed.error).suggestion
  );
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

const parsedBnzFile = parseBnzFile(
  '1,,,,020001000000100,7,260323,260323,\r\n2,010902006838900,50,1250,Supplier,,,,,BNZ EXPORTS,,,\r\n3,1250,1,90200068389\r\n'
);

if (parsedBnzFile.ok) {
  expectType<'direct-credit' | 'direct-debit'>(parsedBnzFile.value.kind);
  expectType<'DC' | 'DD'>(parsedBnzFile.value.transactionCode);
}

createAnzDirectCreditFile({
  batchDueDate: '2026-03-23',
  batchCreationDate: '2026-03-23'
}).addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  payeeName: 'JANE SMITH',
  payeeReference: 'SALARY',
  payeeAnalysis: 'MARCH',
  payeeParticulars: 'PAY',
  originatorName: 'ACME PAYROLL',
  originatorAnalysis: 'MARCH2026',
  originatorReference: 'APR',
  originatorParticulars: 'PAY'
});

const parsedAnzDirectCreditFile = parseAnzDirectCreditFile(
  '1,,,,,,20260323,20260323,\r\n2,1232000123456000,50,1250,JANE SMITH,SALARY,MARCH,,PAY,ACME PAYROLL,MARCH2026,APR,PAY\r\n3,1250,1,32000123456\r\n'
);

if (parsedAnzDirectCreditFile.ok) {
  expectType<'50' | '52'>(
    parsedAnzDirectCreditFile.value.transactions[0]!.transactionCode
  );
}

createAnzDirectDebitFile({
  batchDueDate: '2026-03-23',
  batchCreationDate: '2026-03-23'
}).addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  organisationName: 'ACME RECEIPTS',
  customerReference: 'MEMBER001'
});

const parsedAnzDirectDebitFile = parseAnzDirectDebitFile(
  '1,,,,,,20260323,20260323,\r\n2,1232000123456000,00,4500,ACME RECEIPTS,MEMBER001,,,,ACME RECEIPTS\r\n3,4500,1,32000123456\r\n'
);

if (parsedAnzDirectDebitFile.ok) {
  expectType<'direct-debit'>(parsedAnzDirectDebitFile.value.kind);
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

const westpacCreditFile = createWestpacDirectCreditFile({
  fromAccount: '01-0123-0456789-00',
  customerName: 'ACME PAYROLL LTD',
  fileReference: 'MARCH2026',
  scheduledDate: '23-03-2026'
});

expectType<Buffer>(westpacCreditFile.toBuffer());

createWestpacDirectDebitFile({
  toAccount: '01-0123-0456789-00',
  customerName: 'ACME RECEIPTS LTD',
  fileReference: 'MEMBERSHIP',
  scheduledDate: '23-03-2026'
}).addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  accountName: 'Jane Smith',
  payerReference: 'INV001',
  payerAnalysis: 'MARCH26',
  payerParticulars: 'MEMBER'
});

const parsedWestpacCsvFile = parsePaymentCsvFile(
  'A,000001,03,0123,ACME PAYROLL LTD,,MARCH2026,230326,\r\nD,000002,12,3200,00123456,0000,50,DC,1250,Jane Smith,SALARY,MARCH26,PAY001,01,0123,00456789,0000,ACME PAYROLL LTD,\r\n'
);

if (parsedWestpacCsvFile.ok) {
  expectType<'direct-credit'>(parsedWestpacCsvFile.value.kind);
}

const parsedWestpacDirectCreditFile = parseWestpacDirectCreditFile(
  'A,000001,03,0123,ACME PAYROLL LTD,,MARCH2026,230326,\r\nD,000002,12,3200,00123456,0000,52,DC,1250,Jane Smith,SALARY,MARCH26,PAY001,01,0123,00456789,0000,ACME PAYROLL LTD,\r\n'
);

if (parsedWestpacDirectCreditFile.ok) {
  expectType<'50' | '52'>(
    parsedWestpacDirectCreditFile.value.transactions[0]!.transactionCode
  );
}

const parsedWestpacDirectDebitFile = parseWestpacDirectDebitFile(
  'A,000001,03,0123,ACME RECEIPTS LTD,,MEMBERSHIP,230326,\r\nD,000002,12,3200,00123456,0000,00,DD,4500,Jane Smith,MEMBER,MARCH26,INV001,01,0123,00456789,0000,ACME RECEIPTS LTD,\r\n'
);

if (parsedWestpacDirectDebitFile.ok) {
  expectType<'direct-debit'>(parsedWestpacDirectDebitFile.value.kind);
}

const westpacCsvFile = createPaymentCsvFile({
  fromAccount: '01-0123-0456789-00',
  customerName: 'ACME PAYROLL LTD',
  fileReference: 'MARCH2026',
  scheduledDate: '23-03-2026'
});

expectType<Buffer>(westpacCsvFile.toBuffer());

if (parsedWestpacCsvFile.ok) {
  expectType<'direct-credit'>(parsedWestpacCsvFile.value.kind);
}

if (parsedAnzFile.ok && parsedWestpacCsvFile.ok) {
  expectType<boolean>(
    compareParsedFiles(parsedAnzFile.value, parsedAnzFile.value).equal
  );
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
