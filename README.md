# nz-bank-batch

[![npm version](https://img.shields.io/npm/v/nz-bank-batch?logo=npm)](https://www.npmjs.com/package/nz-bank-batch)
[![install](https://img.shields.io/badge/install-npm%20i%20nz--bank--batch-CB3837?logo=npm)](https://www.npmjs.com/package/nz-bank-batch)

Premium TypeScript primitives and bank adapters for generating New Zealand batch-payment upload files, without leaving the awkward parts to application glue.

## Why this library?

NZ batch files look simple right up until you have to generate one correctly.

They are deceptively awkward:

- every bank has its own CSV-ish dialect
- records are strict ASCII, with bank-specific comma-delimited or fixed-width layouts
- each line must end with CRLF by default
- totals and hash totals have to line up exactly
- account numbers need normalisation long before they are rendered
- teams often end up baking one bank's format into application code, so later changing banks can force avoidable software changes

`nz-bank-batch` treats those constraints as a library problem, not something every app team should have to rediscover the hard way.

That matters not just when you first build the payment flow, but later when the business decides to move accounts or banking channels. A bank switch should not mean rewriting the batch-generation part of your software from scratch.

What you get:

- strong TypeScript IntelliSense with branded validated scalars
- small, explicit public API with `Result` and `assert*` flows
- zero runtime dependencies
- multi-entry exports so consumers can import one adapter without pulling the others
- ESM-first packaging with CJS compatibility and packaging validation in CI

The aim is not to be clever. The aim is to be exact.

As a general design preference, when a bank specification exposes multiple viable upload layouts, this library leans toward the CSV variant rather than fixed-width or more positional alternatives. ASB is the deliberate exception: the supported ASB surface here is MT9.

## Install

```bash
npm install nz-bank-batch
```

## Quickstart

The examples below are intentionally plain. If the generated output needs to match what the bank expects byte-for-byte, boring is good.

Date inputs are now normalised at the adapter boundary. In practice that means you can pass common NZ-style values such as `2026-03-23`, `23-03-2026`, `20260323`, or a `Date`, and the adapter will render the bank-specific output format it needs internally.

For the most portable cross-bank code, prefer `Date`, `YYYY-MM-DD`, or `DD-MM-YYYY` inputs.

Ambiguous two-digit separated inputs such as `26-03-23` are not auto-guessed across adapters. Use `YYMMDD`, `YYYY-MM-DD`, `DD-MM-YYYY`, or `Date` when you want the meaning to stay stable during a bank switch.

### Portable outbound payments

```ts
import { createPortablePaymentFile } from 'nz-bank-batch/portable';

const file = createPortablePaymentFile({
  bank: 'asb',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23'
});

file.addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  category: 'salary-and-wages',
  internalReference: 'PAYROLL01',
  payee: {
    name: 'Jane Smith',
    code: 'MARCH',
    reference: 'SALARY',
    particulars: 'PAY'
  },
  payer: {
    name: 'ACME PAYROLL',
    code: 'PAYROLL',
    reference: 'MAR26',
    particulars: 'WAGES'
  }
});

const output = file.toString();
const buffer = file.toBuffer();
```

The portable entrypoint is a bank-neutral wrapper for the common outbound payment/direct-credit use case across ANZ, ASB direct credit, BNZ, Kiwibank, and Westpac direct credit files.

It keeps business data in one semantic shape:

- `sourceAccount`, `originatorName`, and `paymentDate` at file level
- `payee` and optional `payer` parties at transaction level
- optional `category: 'salary-and-wages'` when the payment should render with a bank-specific salary/wages credit code

If you expect the same payment data to move between banks, the safest shared text limits are:

- `name`: 20 printable ASCII characters
- `particulars`, `code`, `reference`, `analysis`, `internalReference`: 12 printable ASCII characters
- `batchReference`: 12 if you need BNZ or Kiwibank portability, even though Westpac allows a longer file reference

ANZ and Westpac reject over-length text. ASB, BNZ, and Kiwibank truncate several native text fields to fit their upload layouts.

This is intentionally additive. The bank-specific adapters remain available when you need bank-only capabilities such as direct debit, ASB registration IDs, or bank-native transaction fields.

Portable payment bank switches can stay focused on file config. The transaction shape below can stay unchanged:

```ts
const portablePayment = {
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  category: 'salary-and-wages' as const,
  payee: {
    name: 'Jane Smith',
    particulars: 'PAY',
    reference: 'SALARY',
    code: 'MARCH'
  },
  payer: {
    name: 'ACME PAYROLL',
    particulars: 'WAGES',
    reference: 'MAR26',
    code: 'PAYROLL'
  }
};
```

ANZ:

```ts
const anzPortableFile = createPortablePaymentFile({
  bank: 'anz',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23',
  batchCreationDate: '2026-03-23'
});

anzPortableFile.addTransaction(portablePayment);
```

ASB:

```ts
const asbPortableFile = createPortablePaymentFile({
  bank: 'asb',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23'
});

asbPortableFile.addTransaction({
  ...portablePayment,
  internalReference: 'PAYROLL01'
});
```

BNZ:

```ts
const bnzPortableFile = createPortablePaymentFile({
  bank: 'bnz',
  sourceAccount: '02-0001-0000001-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23',
  batchReference: 'MARCH2026'
});

bnzPortableFile.addTransaction(portablePayment);
```

Kiwibank:

```ts
const kiwibankPortableFile = createPortablePaymentFile({
  bank: 'kiwibank',
  sourceAccount: '38-9000-7654321-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23',
  batchReference: 'MARCH2026'
});

kiwibankPortableFile.addTransaction(portablePayment);
```

Westpac:

```ts
const westpacPortableFile = createPortablePaymentFile({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL',
  paymentDate: '2026-03-23',
  batchReference: 'MARCH2026'
});

westpacPortableFile.addTransaction(portablePayment);
```

Portable payment field mapping:

| Portable field                 | ANZ                                                                               | ASB                                                                | BNZ / Kiwibank                                          | Westpac                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `originatorName`               | Default `subscriberName` when `payer.name` is omitted; 20 chars, rejects overflow | `clientShortName`; 20 chars, truncated                             | `originatorName`; 20 chars, truncated                   | `customerName`; 30 chars, rejects overflow                                                              |
| `batchReference`               | Not supported                                                                     | Not supported                                                      | `userReference` / `batchReference`; 12 chars, truncated | `fileReference`; 20 chars, rejects overflow                                                             |
| `payee.name`                   | `otherPartyName`; 20 chars, rejects overflow                                      | `thisParty.name`; 20 chars, truncated                              | `accountName`; 20 chars, truncated                      | `accountName`; 20 chars, rejects overflow                                                               |
| `payee.particulars`            | `otherPartyParticulars`; 12 chars, rejects overflow                               | `thisParty.particulars`; 12 chars, truncated                       | `particulars`; 12 chars, truncated                      | `payeeParticulars`; 12 chars, rejects overflow                                                          |
| `payee.code`                   | `otherPartyAlphaReference`; 12 chars, rejects overflow                            | `code`; 12 chars, truncated                                        | `code`; 12 chars, truncated                             | Ignored when `payee.analysis` exists; otherwise reused as `payeeAnalysis` with an approximation warning |
| `payee.reference`              | `otherPartyReference`; 12 chars, rejects overflow                                 | `alphaReference`; 12 chars, truncated                              | `reference`; 12 chars, truncated                        | Ignored                                                                                                 |
| `payee.analysis`               | `otherPartyAnalysisCode`; 12 chars, rejects overflow                              | Falls back into ASB `code` when `payee.code` is omitted            | `information`; 12 chars, truncated                      | `payeeAnalysis`; 12 chars, rejects overflow                                                             |
| `payer.name`                   | `subscriberName`; 20 chars, rejects overflow                                      | `otherParty.name`; 20 chars, truncated                             | Ignored                                                 | Ignored                                                                                                 |
| `payer.particulars`            | `subscriberParticulars`; 12 chars, rejects overflow                               | `otherParty.particulars`; 12 chars, truncated                      | Ignored                                                 | Ignored                                                                                                 |
| `payer.code`                   | Ignored                                                                           | `otherParty.code`; 12 chars, truncated                             | Ignored                                                 | Ignored                                                                                                 |
| `payer.reference`              | `subscriberReference`; 12 chars, rejects overflow                                 | `otherParty.alphaReference`; 12 chars, truncated                   | Ignored                                                 | `payerReference`; 12 chars, rejects overflow                                                            |
| `payer.analysis`               | `subscriberAnalysisCode`; 12 chars, rejects overflow                              | Falls back into ASB `otherParty.code` when `payer.code` is omitted | Ignored                                                 | Ignored                                                                                                 |
| `internalReference`            | Ignored                                                                           | `internalReference`; 12 chars, truncated                           | Ignored                                                 | Ignored                                                                                                 |
| `category: 'salary-and-wages'` | Renders transaction code `52`                                                     | Renders transaction code `052`                                     | Ignored                                                 | Renders transaction code `52`                                                                           |

### Portable payment preflight validation

If you want to validate imported data or form input before rendering, use the portable validation helpers.

```ts
import {
  validatePortablePaymentBatch,
  validatePortablePaymentFileConfig,
  validatePortablePaymentTransaction
} from 'nz-bank-batch/portable';

const configResult = validatePortablePaymentFileConfig({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  originatorName: 'ACME PAYROLL LTD'
});

const transactionResult = validatePortablePaymentTransaction(
  {
    toAccount: '12-3200-0123456-00',
    amount: '12.50',
    category: 'salary-and-wages',
    payee: {
      name: 'Jane Smith',
      code: 'MARCH',
      reference: 'SALARY'
    }
  },
  { bank: 'westpac' }
);

const batchResult = validatePortablePaymentBatch({
  config: {
    bank: 'bnz',
    sourceAccount: '02-0001-0000001-00',
    originatorName: 'BNZ EXPORTS',
    batchReference: 'MARCH2026'
  },
  transactions: [
    {
      toAccount: '01-0902-0068389-00',
      amount: '500.00',
      payee: {
        name: 'Electric Co'
      }
    }
  ]
});

if (!batchResult.ok) {
  console.error(batchResult.errors);
}

console.log(batchResult.warnings);
```

Each issue includes:

- a stable `code`
- a path like `config.sourceAccount` or `transactions[3].toAccount`
- a human-readable `message`
- optional structured `context`
- an optional `suggestion`

### Portable direct debit

```ts
import { createPortableDebitFile } from 'nz-bank-batch/portable';

const portableDebit = {
  fromAccount: '01-0123-0456789-00',
  amount: '45.00',
  payer: {
    name: 'Gym Member',
    particulars: 'MEMBERSHIP',
    reference: 'DEBIT'
  }
};
```

ANZ:

```ts
const anzPortableDebitFile = createPortableDebitFile({
  bank: 'anz',
  collectorName: 'ACME RECEIPTS',
  collectionDate: '2026-03-23',
  batchCreationDate: '2026-03-23'
});

anzPortableDebitFile.addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  payer: {
    name: 'MEMBER001'
  }
});
```

ASB:

```ts
const asbPortableDebitFile = createPortableDebitFile({
  bank: 'asb',
  collectorName: 'ACME RECEIPTS',
  collectionDate: '2026-03-23',
  registrationId: '123456789012345',
  contra: {
    account: '01-0123-0456789-00',
    code: 'GYM',
    reference: 'MAR2026',
    particulars: 'MONTHLY'
  }
});

asbPortableDebitFile.addTransaction({
  ...portableDebit,
  payer: {
    ...portableDebit.payer,
    code: 'GYM',
    reference: 'MAR2026',
    particulars: 'MONTHLY'
  }
});
```

BNZ:

```ts
const bnzPortableDebitFile = createPortableDebitFile({
  bank: 'bnz',
  sourceAccount: '02-0001-0000001-00',
  collectorName: 'BNZ EXPORTS',
  collectionDate: '2026-03-23'
});

bnzPortableDebitFile.addTransaction({
  fromAccount: '01-0902-0068389-00',
  amount: '5.00',
  payer: {
    name: 'Debit Person'
  }
});
```

Kiwibank:

```ts
const kiwibankPortableDebitFile = createPortableDebitFile({
  bank: 'kiwibank',
  sourceAccount: '38-9000-7654321-00',
  collectorName: 'KIWI CAFE',
  collectionDate: '2026-03-23',
  batchReference: 'MEMBERS'
});

kiwibankPortableDebitFile.addTransaction({
  ...portableDebit,
  collector: {
    code: 'MAR'
  }
});
```

Westpac:

```ts
const westpacPortableDebitFile = createPortableDebitFile({
  bank: 'westpac',
  sourceAccount: '01-0123-0456789-00',
  collectorName: 'ACME RECEIPTS LTD',
  batchReference: 'MEMBERSHIP',
  collectionDate: '2026-03-23'
});

westpacPortableDebitFile.addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  payer: {
    name: 'Jane Smith',
    particulars: 'MEMBER',
    analysis: 'MARCH26',
    reference: 'INV001'
  }
});
```

Portable debit uses the same safe text sizing as portable payments: keep names within 20 printable ASCII characters and keep `particulars`, `code`, `reference`, and `analysis` within 12. ANZ's portable debit mapping is intentionally conservative because its MTS-style file mostly repeats the collector name and uses only one short customer-facing reference field. ASB exposes the richest neutral debit shape because it has a real contra record and second-party block. BNZ and Kiwibank reuse only selected collector fields as fallbacks when payer-side debit fields are absent. Westpac maps payer-facing fields directly into Deskbank CSV debit columns and can reuse `collector.code` as a fallback `payerAnalysis` when the payer does not provide one.

Portable direct debit field mapping:

| Portable field          | ANZ                                                                                  | ASB                                                                      | BNZ                                                               | Kiwibank                                                          | Westpac                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `collectorName`         | Reused as both `otherPartyName` and `subscriberName`; 20 chars, rejected if too long | `clientShortName`; 20 chars, truncated                                   | `originatorName`; 20 chars, truncated                             | `originatorName`; 20 chars, truncated                             | `customerName`; 30 chars, rejects overflow                      |
| `collectionDate`        | `batchDueDate`                                                                       | `dueDate`                                                                | `processDate`                                                     | `processDate`                                                     | `scheduledDate`                                                 |
| `batchCreationDate`     | Optional ANZ header creation date                                                    | Not supported                                                            | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `sourceAccount`         | Not used                                                                             | Not used; ASB debit uses `registrationId` plus optional `contra` instead | `fromAccount`; validated NZ account                               | `fromAccount`; validated NZ account                               | `toAccount`; validated NZ account                               |
| `registrationId`        | Not supported                                                                        | Required; maps to ASB header registration ID field                       | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `batchReference`        | Not supported                                                                        | Not supported                                                            | `userReference`; 12 chars, truncated                              | `batchReference`; 12 chars, truncated                             | `fileReference`; 20 chars, rejects overflow                     |
| `contra.account`        | Not supported                                                                        | Optional ASB contra account                                              | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `contra.name`           | Not supported                                                                        | `otherPartyName`; 20 chars, truncated                                    | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `contra.code`           | Not supported                                                                        | `code`; 12 chars, truncated                                              | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `contra.reference`      | Not supported                                                                        | `alphaReference`; 12 chars, truncated                                    | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `contra.particulars`    | Not supported                                                                        | `particulars`; 12 chars, truncated                                       | Not supported                                                     | Not supported                                                     | Not supported                                                   |
| `payer.name`            | Used as fallback for `otherPartyReference` when `payer.reference` is absent          | `thisParty.name`; 20 chars, truncated                                    | `accountName`; 20 chars, truncated                                | `accountName`; 20 chars, truncated                                | `accountName`; 20 chars, rejects overflow                       |
| `payer.particulars`     | Ignored                                                                              | `thisParty.particulars`; 12 chars, truncated                             | `particulars`; preferred over collector fallback                  | `particulars`; preferred over collector fallback                  | `payerParticulars`; 12 chars, rejects overflow                  |
| `payer.code`            | Ignored                                                                              | `thisParty.code`; 12 chars, truncated                                    | Not used directly                                                 | Not used directly                                                 | Not used directly                                               |
| `payer.reference`       | Preferred `otherPartyReference`; 12 chars, rejected if too long                      | `thisParty.alphaReference`; 12 chars, truncated                          | `reference`; preferred over collector fallback                    | `reference`; preferred over collector fallback                    | `payerReference`; 12 chars, rejects overflow                    |
| `payer.analysis`        | Ignored                                                                              | Not supported                                                            | `information`; 12 chars, truncated                                | `information`; 12 chars, truncated                                | `payerAnalysis`; 12 chars, rejects overflow                     |
| `collector.name`        | Preferred over `collectorName` for both rendered ANZ name fields                     | `otherParty.name`; 20 chars, truncated                                   | Ignored                                                           | Ignored                                                           | Ignored                                                         |
| `collector.particulars` | Ignored                                                                              | `otherParty.particulars`; 12 chars, truncated                            | Used only when `payer.particulars` is omitted                     | Used only when `payer.particulars` is omitted                     | Ignored                                                         |
| `collector.code`        | Ignored                                                                              | `otherParty.code`; 12 chars, truncated                                   | Reused as bank `code` field                                       | Reused as bank `code` field                                       | Reused as `payerAnalysis` only when `payer.analysis` is omitted |
| `collector.analysis`    | Ignored                                                                              | Falls back into ASB `otherParty.code` when `collector.code` is omitted   | Reused as bank `code` field only when `collector.code` is omitted | Reused as bank `code` field only when `collector.code` is omitted | Ignored                                                         |
| `collector.reference`   | Ignored                                                                              | `otherParty.alphaReference`; 12 chars, truncated                         | Used only when `payer.reference` is omitted                       | Used only when `payer.reference` is omitted                       | Ignored                                                         |

## Bank-Specific Adapters

The portable examples above show the bank-neutral layer.

The examples below switch back to the underlying bank-specific adapters. Use these when you need the bank-native file shape directly, or when you need capabilities that are not intentionally abstracted by the portable API.

Where the bank documentation offers multiple reasonable file layouts, the adapter surface usually follows the CSV-oriented one. The main exception is ASB, whose supported direct-credit and direct-debit adapters are MT9-based.

### ANZ Direct Credit (Domestic Extended / MTS)

```ts
import { createDirectCreditFile } from 'nz-bank-batch/anz';
import { assertCents } from 'nz-bank-batch/nz';

const amount = assertCents('12.50');

const file = createDirectCreditFile({
  batchDueDate: '2026-03-23',
  batchCreationDate: new Date(Date.UTC(2026, 2, 23))
});

file.addTransaction({
  toAccount: '12-3200-0123456-00',
  amount,
  payeeName: 'Jane Smith',
  payeeReference: 'SALARY',
  payeeAnalysis: 'MARCH',
  payeeParticulars: 'PAY',
  originatorName: 'ACME PAYROLL',
  originatorAnalysis: 'MARCH2026',
  originatorReference: 'APR',
  originatorParticulars: 'PAY'
});

const output = file.toString();
const buffer = file.toBuffer();
```

The current ANZ adapter targets the MTS-style direct credit file with Header / Transaction /
Control records.

`createDirectCreditFile()` and `parseDirectCreditFile()` are the clearest names for that outward-
payment use case, using business fields like `payeeName` and `originatorName`. `createDomesticExtendedFile()` and `parseDomesticExtendedFile()` remain available
as the raw format-specific API when you need the original ANZ field labels directly.

This package does not currently implement:

- ANZ's simpler one-line domestic payment CSV

### ANZ Direct Debit (MTS)

```ts
import { createDirectDebitFile } from 'nz-bank-batch/anz';
import { assertCents } from 'nz-bank-batch/nz';

const amount = assertCents('45.00');

const file = createDirectDebitFile({
  batchDueDate: '2026-03-23',
  batchCreationDate: new Date(Date.UTC(2026, 2, 23))
});

file.addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount,
  organisationName: 'ACME RECEIPTS',
  customerReference: 'MEMBER001'
});

const output = file.toString();
const buffer = file.toBuffer();
```

The ANZ direct debit adapter uses the same MTS-style Header / Transaction / Control structure as
the direct credit adapter, but fixes the transaction code to `00` and uses `fromAccount` debit
semantics on each transaction. Its public API intentionally exposes business fields
`organisationName` and `customerReference` instead of the underlying credit-style ANZ labels.

### BNZ IB4B direct credit

```ts
import { createDirectCreditFile } from 'nz-bank-batch/bnz';

const file = createDirectCreditFile({
  fromAccount: '02-0001-0000001-00',
  originatorName: 'BNZ EXPORTS',
  userReference: 'MAY2026',
  processDate: '2026-03-23'
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

const output = file.toString();
const buffer = file.toBuffer();
```

BNZ and Kiwibank IB4B output is rendered in the bank-facing layout used by the reference fixtures:

- 9-field header records
- 13-field detail records
- 4-field trailer records in `total,count,hash` order
- digits-only account values in the rendered file
- numeric transaction codes in the rendered file (`50` for direct credit, `00` for direct debit)

### ASB MT9 direct credit

```ts
import { createDirectCreditFile } from 'nz-bank-batch/asb';

const file = createDirectCreditFile({
  fromAccount: '01-0123-0456789-00',
  dueDate: '23-03-2026',
  clientShortName: 'ACME PAYROLL'
});

file.addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  transactionCode: '052',
  internalReference: 'PAYROLL01',
  thisParty: {
    name: 'Jane Smith',
    code: 'MARCH',
    alphaReference: 'SALARY',
    particulars: 'PAY'
  },
  otherParty: {
    name: 'ACME PAYROLL',
    code: 'PAYROLL',
    alphaReference: 'MAR26',
    particulars: 'WAGES'
  }
});

const output = file.toString();
const buffer = file.toBuffer();
```

### ASB MT9 direct debit

```ts
import { createDirectDebitFile } from 'nz-bank-batch/asb';

const file = createDirectDebitFile({
  registrationId: '123456789012345',
  dueDate: new Date(Date.UTC(2026, 2, 23)),
  clientShortName: 'ACME RECEIPTS',
  contra: {
    account: '01-0123-0456789-00',
    code: 'GYM',
    alphaReference: 'MAR2026',
    particulars: 'MONTHLY'
  }
});

file.addTransaction({
  toAccount: '02-0001-0000001-00',
  amount: '45.00',
  thisParty: {
    name: 'Gym Member',
    code: 'GYM',
    alphaReference: 'MAR2026',
    particulars: 'MONTHLY'
  }
});

const output = file.toString();
const buffer = file.toBuffer();
```

ASB direct debit is modelled as the MT9 receipt layout from the ASB guide: a 15-digit registration ID in the header, one or more payer detail rows, and an optional contra record that is included in the trailer totals.

### Kiwibank IB4B direct credit

```ts
import { createDirectCreditFile } from 'nz-bank-batch/kiwibank';

const file = createDirectCreditFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  batchReference: 'WEEKLY',
  processDate: '23-03-2026'
});

file.addTransaction({
  counterpartyAccount: '01-0123-0456789-00',
  amount: '102.45',
  accountName: 'Milk Supplier',
  particulars: 'SUPPLY',
  code: 'WK12',
  reference: 'CAFE',
  information: ''
});

const output = file.toString();
const buffer = file.toBuffer();
```

### Kiwibank IB4B direct debit

```ts
import { createDirectDebitFile } from 'nz-bank-batch/kiwibank';

const file = createDirectDebitFile({
  fromAccount: '38-9000-7654321-00',
  originatorName: 'KIWI CAFE',
  batchReference: 'MEMBERS',
  processDate: new Date(Date.UTC(2026, 2, 23))
});

file.addTransaction({
  counterpartyAccount: '01-0123-0456789-00',
  amount: '45.00',
  accountName: 'Gym Member',
  particulars: 'MEMBERSHIP',
  code: 'MAR',
  reference: 'DEBIT',
  information: ''
});

const output = file.toString();
const buffer = file.toBuffer();
```

### Westpac Deskbank Direct Credit CSV

```ts
import { createDirectCreditFile } from 'nz-bank-batch/westpac';

const file = createDirectCreditFile({
  fromAccount: '01-0123-0456789-00',
  customerName: 'ACME PAYROLL LTD',
  fileReference: 'MARCH2026',
  scheduledDate: '2026-03-23'
});

file.addTransaction({
  toAccount: '12-3200-0123456-00',
  amount: '12.50',
  accountName: 'Jane Smith',
  transactionCode: '52',
  payerReference: 'PAY001',
  payeeAnalysis: 'MARCH26',
  payeeParticulars: 'SALARY'
});

const output = file.toString();
const buffer = file.toBuffer();
```

### Westpac Deskbank Direct Debit CSV

```ts
import { createDirectDebitFile } from 'nz-bank-batch/westpac';

const file = createDirectDebitFile({
  toAccount: '01-0123-0456789-00',
  customerName: 'ACME RECEIPTS LTD',
  fileReference: 'MEMBERSHIP',
  scheduledDate: new Date(Date.UTC(2026, 2, 23))
});

file.addTransaction({
  fromAccount: '12-3200-0123456-00',
  amount: '45.00',
  accountName: 'Jane Smith',
  payerReference: 'INV001',
  payerAnalysis: 'MARCH26',
  payerParticulars: 'MEMBER'
});

const output = file.toString();
const buffer = file.toBuffer();
```

## Public API

### Root

The root entry is intentionally small and does not import bank adapters.

```ts
import { type Result, NzBatchError } from 'nz-bank-batch';
```

### Portable payments

```ts
import {
  createPortableDebitFile,
  createPortablePaymentFile,
  type PortableDebitCollector,
  type PortableDebitContra,
  type PortableDebitFile,
  type PortableDebitFileConfig,
  type PortableDebitPayer,
  type PortableDebitTransaction,
  type PortablePaymentBank,
  type PortablePaymentCategory,
  type PortablePaymentFile,
  type PortablePaymentParty,
  type PortablePaymentTransaction
} from 'nz-bank-batch/portable';
```

### NZ primitives

```ts
import {
  assertDdMmYy,
  assertCents,
  assertNzAccount,
  computeBranchBaseHashTotal,
  parseDdMmYy,
  parseCents,
  parseNzAccount,
  parseYyMmDd,
  parseYyyyMmDd,
  validateNzAccountChecksum,
  type Cents,
  type DateInput,
  type NzAccountNumber,
  type YyMmDd,
  type YyyyMmDd
} from 'nz-bank-batch/nz';
```

Key functions:

- `parseNzAccount(input, options?) -> Result<NzAccountNumber, NzAccountError>`
- `assertNzAccount(input, options?) -> NzAccountNumber`
- `parseCents(input) -> Result<Cents, MoneyError>`
- `assertCents(input) -> Cents`
- `parseYyMmDd(input) -> Result<YyMmDd, DateError>`
- `parseYyyyMmDd(input) -> Result<YyyyMmDd, DateError>`
- `parseDdMmYy(input) -> Result<string, DateError>`
- `computeBranchBaseHashTotal(accounts, options?) -> bigint`
- `validateNzAccountChecksum(parts) -> Result<void, NzAccountError>`

### ANZ

```ts
import {
  createDirectCreditFile,
  createDomesticExtendedFile,
  createFile,
  parseDirectCreditFile,
  parseDomesticExtendedFile,
  parseFile,
  type AnzDirectCreditFile,
  type AnzDirectCreditFileConfig,
  type AnzDirectCreditTransaction,
  type AnzDirectCreditTransactionCode,
  type AnzDomesticExtendedFile,
  type AnzDomesticExtendedFileConfig,
  type AnzDomesticExtendedTransaction,
  type AnzDomesticExtendedTransactionCode,
  type ParsedAnzDomesticExtendedFile,
  type ParsedAnzDomesticExtendedTransaction
} from 'nz-bank-batch/anz';
```

`createDirectCreditFile()` and `parseDirectCreditFile()` describe the business meaning of the supported ANZ format. `createDomesticExtendedFile()` and `parseDomesticExtendedFile()` remain as format-specific aliases for the same MTS-style direct credit layout, and `parseFile()` is still the generic alias.

### ASB

```ts
import {
  createDirectCreditFile,
  createDirectDebitFile,
  createFile,
  parseDirectCreditFile,
  parseDirectDebitFile,
  parseFile,
  type AsbFile,
  type AsbFileConfig,
  type AsbDirectCreditFileConfig,
  type AsbDirectCreditTransaction,
  type AsbDirectDebitContraConfig,
  type AsbDirectDebitFileConfig,
  type AsbDirectDebitTransaction,
  type AsbDueDate,
  type AsbTransactionCode,
  type CreateAsbFileConfig,
  type ParsedAsbDirectCreditFile,
  type ParsedAsbDirectDebitContra,
  type ParsedAsbDirectDebitFile,
  type ParsedAsbFile
} from 'nz-bank-batch/asb';
```

`parseDirectCreditFile()`, `parseDirectDebitFile()`, and `parseFile()` parse ASB MT9 files back into typed metadata, transactions, optional direct-debit contra data, and trailer summary data.

### Westpac

```ts
import {
  createDirectCreditFile,
  createDirectDebitFile,
  createPaymentCsvFile,
  parseDirectCreditFile,
  parseDirectDebitFile,
  parseFile,
  parsePaymentCsvFile,
  type ParsedWestpacDirectCreditFile,
  type ParsedWestpacDirectCreditTransaction,
  type ParsedWestpacDirectDebitFile,
  type ParsedWestpacDirectDebitTransaction,
  type ParsedWestpacFile,
  type ParsedWestpacPaymentCsvFile,
  type ParsedWestpacPaymentFile,
  type WestpacDirectCreditFile,
  type WestpacDirectCreditFileConfig,
  type WestpacDirectCreditTransaction,
  type WestpacDirectCreditTransactionCode,
  type WestpacDirectDebitFile,
  type WestpacDirectDebitFileConfig,
  type WestpacDirectDebitTransaction,
  type WestpacPaymentFile,
  type WestpacPaymentFileConfig,
  type WestpacPaymentTransaction,
  type ParsedWestpacPaymentTransaction
} from 'nz-bank-batch/westpac';
```

The current Westpac adapter targets the Business Online Deskbank CSV import layout for both direct credits and direct debits:

- CSV records are plain comma-delimited fields with no double-quote escaping
- header records use `A` and detail records use `D`
- dates render as `DDMMYY`
- direct credit detail rows use transaction code `50` or `52` with MTS source `DC`
- direct debit detail rows use transaction code `00` with MTS source `DD`

`createDirectCreditFile()` and `parseDirectCreditFile()` describe the business meaning of the direct-credit CSV layout. `createPaymentCsvFile()` and `parsePaymentCsvFile()` remain as direct-credit aliases for compatibility. `createDirectDebitFile()`, `parseDirectDebitFile()`, and `parseFile()` handle the direct-debit CSV and generic Westpac CSV parsing surface.

### BNZ

```ts
import {
  createDirectCreditFile,
  createDirectDebitFile,
  createFile,
  parseFile,
  type BnzFile,
  type BnzFileConfig,
  type BnzTransaction,
  type BnzTransactionCode,
  type ParsedBnzFile,
  type ParsedBnzTransaction
} from 'nz-bank-batch/bnz';
```

`parseFile()` parses the shared IB4B layout used by BNZ uploads into typed config, transactions, and trailer summary data.

### Kiwibank

```ts
import {
  createDirectCreditFile,
  createDirectDebitFile,
  createFile,
  parseFile,
  type KiwibankFile,
  type KiwibankFileConfig,
  type KiwibankTransaction,
  type KiwibankTransactionCode,
  type ParsedKiwibankFile,
  type ParsedKiwibankTransaction
} from 'nz-bank-batch/kiwibank';
```

`parseFile()` parses the shared IB4B layout used by Kiwibank uploads into typed config, transactions, and trailer summary data.

### Compare parsed files

```ts
import {
  compareParsedFileFixtures,
  compareParsedFiles,
  formatParsedFileComparison,
  type ParsedFileComparison,
  type ParsedFileDifference,
  type ParsedFileFixtureComparison,
  type ParsedFileFixtureParseError
} from 'nz-bank-batch';
```

Use `compareParsedFiles(expected, actual)` to diff parser outputs from different files or environments. The result includes path-based differences like `transactions[0].amount`, and `formatParsedFileComparison()` turns that structure into a readable multi-line summary.

Use `compareParsedFileFixtures(expectedInput, actualInput, parseFile)` when you have raw fixture text and want one call that parses both sides first, then returns the parsed values plus the structured comparison.

## Validation philosophy

This library tries to be strict where mistakes are expensive and quiet where policy is bank- or business-specific.

What this library validates by default:

- NZ account number structure and canonical normalisation
- built-in NZ bank and branch range validation for all bundled banks
- common NZ date inputs normalised into the bank-specific output format required by each adapter
- adapter field ASCII safety
- comma-free CSV fields
- explicit max-length enforcement
- truncation where the adapter says truncation is allowed
- safe string-to-cents parsing without float math
- trailer count, total cents, and branch+base hash total generation

What this library does not do by default:

- fetch or maintain a live branch register
- assume remote bank metadata is authoritative at runtime
- silently coerce non-ASCII or comma-containing text

The bundled branch table now covers all NZ banks included in the integrated registry. That is the default baseline. A `branchHook` lets you add your own branch rule after the account has been parsed into canonical parts.

Use that hook in two common cases:

- you want stricter business rules than the bundled table, such as only allowing branches your organisation has approved
- you want to validate against your own branch register instead of the bundled one; in that case, disable built-in branch validation with `validateBankBranch: false`

The hook receives `NzAccountParts` and can:

- return `true` or `{ ok: true }` to accept the branch
- return `false` to reject the branch with the default hook error
- return `{ ok: false, message }` to reject it with your own message

Example:

```ts
import { assertNzAccount, type BranchValidationHook } from 'nz-bank-batch/nz';

const allowedBranches = new Set(['123350', '123351', '123399']);

const branchHook: BranchValidationHook = (parts) => {
  const branchKey = `${parts.bankId}${parts.branch}`;

  if (!allowedBranches.has(branchKey)) {
    return {
      ok: false,
      message: `Branch ${parts.bankId}-${parts.branch} is not enabled in the local branch register.`
    };
  }

  return { ok: true };
};

const account = assertNzAccount('12-3350-0123456-00', {
  branchHook
});
```

If your own branch register is meant to replace the bundled one entirely, combine both options:

```ts
assertNzAccount('12-3350-0123456-00', {
  validateBankBranch: false,
  branchHook
});
```

Checksum support is implemented as a separate routine so callers can opt into stricter validation without forcing remote branch metadata into every parse flow.

You can also disable built-in branch validation explicitly:

```ts
parseNzAccount('12-3350-0123456-00', { validateBankBranch: false });
```

## Line endings and rendering

Generated files default to CRLF and can be overridden per render call:

```ts
const text = file.toString({ lineEnding: '\n' });
```

Comma-containing fields are rejected before output.

Most adapters render compact CSV fields, but the BNZ and Kiwibank IB4B adapters preserve significant trailing spaces in text fields where the bank-facing layout requires them for fixture-exact output. Ugly, yes. Necessary, also yes.

## Fixtures and Reference Data

The IB4B fixtures in `test/fixtures` are synthetic and safe to keep in the repo. They exist to keep the adapters honest. If behaviour changes intentionally, regenerate them from the current implementation with:

```bash
npm run fixtures:ib4b
```

## Compatibility

- Node: `>=22`
- TypeScript: `>=5.8`
- Module formats: ESM first, CJS-compatible via package exports
- Runtime dependencies: none

Why Node 22:

- native modern ESM support
- clean bigint handling across the codebase
- fewer transpilation compromises for package exports and source maps

## Common errors

These are the ones you are most likely to hit first.

### Field contains a comma

Batch formats are comma-delimited. A field such as `ACME, LTD` will be rejected. Pre-sanitise text or map commas to another character before calling `addTransaction()`.

### Amount formatting is wrong

Use decimal strings like `"12.50"` or a `bigint` cents value. The library never uses float math.

### Hash total does not match bank output

Hash totals are based on branch plus padded base account digits, excluding bank number and suffix, with overflow handling. If your bank expects a stricter variant, compare your source account normalisation first.

### Invalid account format

Accepted input forms are:

- `01-0123-0456789-00`
- `010123045678900`
- `010123004567890000`

`parseNzAccount()` returns a `Result`. `assertNzAccount()` throws a typed `NzAccountError`.

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run type-tests
npm run publint
npm run attw
npm run pack:check
```

## Status

Implemented in v1:

- ANZ direct credit and direct debit (Domestic Extended / MTS)
- ASB MT9 direct credit and direct debit
- BNZ IB4B direct credit and direct debit
- Kiwibank IB4B direct credit and direct debit
- Westpac Deskbank CSV direct credit and direct debit
- NZ account primitives, cents parsing, date validation, CSV rendering, and hash totals
