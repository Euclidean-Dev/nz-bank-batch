import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createPortableDebitFile,
  createPortablePaymentFile,
  explainValidationError,
  validatePortablePaymentBatch,
  validatePortablePaymentFileConfig,
  validatePortablePaymentTransaction
} from '../src/portable.js';
import { parseNzAccount } from '../src/nz.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Portable payment API', () => {
  it('renders an ANZ file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'anz',
      sourceAccount: '01-0123-0456789-00',
      originatorName: 'Acme Payroll',
      paymentDate: '2026-03-23',
      batchCreationDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          reference: 'Salary',
          analysis: 'March',
          particulars: 'Pay'
        },
        payer: {
          name: 'Acme Payroll',
          analysis: 'March2026',
          reference: 'Apr',
          particulars: 'Pay'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          reference: 'Salary',
          analysis: 'March',
          particulars: 'Pay'
        },
        payer: {
          name: 'Acme Payroll',
          analysis: 'March2026',
          reference: 'Apr',
          particulars: 'Pay'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('anz-direct-credit-mts.txt'));
  });

  it('renders an ASB direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'asb',
      sourceAccount: '12-3200-0456789-00',
      originatorName: 'ACME PAYROLL',
      paymentDate: '23-03-2026'
    });

    expect(
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
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          code: 'MARCH',
          reference: 'SALARY',
          particulars: 'PAY'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('asb-direct-credit.mt9'));
  });

  it('renders a BNZ direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'bnz',
      sourceAccount: '02-0001-0000001-00',
      originatorName: 'BNZ EXPORTS',
      batchReference: 'MAY2026',
      paymentDate: new Date(Date.UTC(2026, 2, 23))
    });

    expect(
      file.addTransaction({
        toAccount: '01-0902-0068389-00',
        amount: '500.00',
        payee: {
          name: 'Electric Co',
          particulars: 'INV123',
          code: 'UTIL',
          reference: 'APR'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '06-1400-7654321-99',
        amount: '25.99',
        payee: {
          name: 'Phone Ltd',
          particulars: 'BILL',
          code: 'TEL',
          reference: 'APR'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('bnz-direct-credit.txt'));
  });

  it('renders a Kiwibank direct credit file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'kiwibank',
      sourceAccount: '38-9000-7654321-00',
      originatorName: 'KIWI CAFE',
      batchReference: 'WEEKLY',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '01-0123-0456789-00',
        amount: '102.45',
        payee: {
          name: 'Milk Supplier',
          particulars: 'SUPPLY',
          code: 'WK12',
          reference: 'CAFE'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '02-0001-0000001-00',
        amount: '50.00',
        payee: {
          name: 'Cleaner',
          particulars: 'SERVICES',
          code: 'WK12',
          reference: 'CAFE'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('kiwibank-direct-credit.txt'));
  });

  it('renders a TSB direct credit CSV file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'tsb',
      sourceAccount: '15-3900-1234567-00',
      originatorName: 'TSB PAYMENTS',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '102.45',
        payee: {
          name: 'Jane Smith',
          particulars: 'SALARY',
          code: 'MARCH',
          reference: 'PAY001'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        toAccount: '15-3900-0000010-00',
        amount: '88.01',
        payee: {
          name: 'Acme Ltd',
          particulars: 'INV',
          code: 'APR',
          reference: 'REF02'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(
      `${readFixture('tsb-direct-credit-portable.csv')}\r\n`
    );
  });

  it('rejects TSB portable payments with commas in payee text', () => {
    const file = createPortablePaymentFile({
      bank: 'tsb',
      sourceAccount: '15-3900-1234567-00',
      originatorName: 'TSB PAYMENTS',
      paymentDate: '2026-03-23'
    });

    const result = file.addTransaction({
      toAccount: '15-3900-7654321-01',
      amount: '10.00',
      payee: {
        name: 'Acme, Ltd',
        particulars: 'PAY'
      }
    });

    expect(result.ok).toBe(false);
  });

  it('renders a Westpac direct credit CSV file from the neutral payment model', () => {
    const file = createPortablePaymentFile({
      bank: 'westpac',
      sourceAccount: '03-1702-0456789-00',
      originatorName: 'ACME PAYROLL LTD',
      batchReference: 'MARCH2026',
      paymentDate: '2026-03-23'
    });

    const transactions = [
      {
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          analysis: 'MARCH26',
          particulars: 'SALARY'
        },
        payer: {
          reference: 'PAY001'
        }
      },
      {
        toAccount: '38-9000-1234567-02',
        amount: '88.01',
        payee: {
          name: 'John Taylor',
          analysis: 'MARCH26',
          particulars: 'SALARY'
        },
        payer: {
          reference: 'PAY002'
        }
      }
    ] as const;

    for (const transaction of transactions) {
      expect(file.addTransaction(transaction).ok).toBe(true);
    }

    expect(file.toString()).toBe(readFixture('westpac-payment.csv'));
  });

  it('maps the portable salary-and-wages category to Westpac transaction code 52', () => {
    const file = createPortablePaymentFile({
      bank: 'westpac',
      sourceAccount: '03-1702-0456789-00',
      originatorName: 'ACME PAYROLL LTD',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        category: 'salary-and-wages',
        payee: {
          name: 'Jane Smith'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toContain(',52,DC,1250,');
  });
});

describe('Portable direct debit API', () => {
  it('renders an ANZ direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'anz',
      originatorName: 'ACME RECEIPTS',
      paymentDate: '2026-03-23',
      batchCreationDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '12-3200-0123456-00',
        amount: '45.00',
        payer: {
          name: 'MEMBER001'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        fromAccount: '38-9000-1234567-02',
        amount: '55.00',
        payer: {
          name: 'MEMBER002'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('anz-direct-debit-mts.txt'));
  });

  it('renders an ASB direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'asb',
      originatorName: 'ACME RECEIPTS',
      paymentDate: '2026-03-23',
      registrationId: '123456789012345',
      contra: {
        account: '12-3200-0456789-00',
        code: 'GYM',
        reference: 'MAR2026',
        particulars: 'MONTHLY'
      }
    });

    expect(
      file.addTransaction({
        fromAccount: '02-0001-0000001-00',
        amount: '45.00',
        payer: {
          name: 'Gym Member',
          code: 'GYM',
          reference: 'MAR2026',
          particulars: 'MONTHLY'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('asb-direct-debit.mt9'));
  });

  it('renders a BNZ direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'bnz',
      sourceAccount: '02-0001-0000001-00',
      collectorName: 'BNZ EXPORTS',
      collectionDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '01-0902-0068389-00',
        amount: '5.00',
        payer: {
          name: 'Debit Person'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('bnz-direct-debit.txt'));
  });

  it('renders a Kiwibank direct debit file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'kiwibank',
      sourceAccount: '38-9000-7654321-00',
      originatorName: 'KIWI CAFE',
      batchReference: 'MEMBERS',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '01-0123-0456789-00',
        amount: '45.00',
        payer: {
          name: 'Gym Member',
          particulars: 'MEMBERSHIP',
          reference: 'DEBIT'
        },
        originator: {
          code: 'MAR'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('kiwibank-direct-debit.txt'));
  });

  it('renders a Westpac direct debit CSV file from the neutral debit model', () => {
    const file = createPortableDebitFile({
      bank: 'westpac',
      sourceAccount: '03-1702-0456789-00',
      originatorName: 'ACME RECEIPTS LTD',
      batchReference: 'MEMBERSHIP',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        fromAccount: '12-3200-0123456-00',
        amount: '45.00',
        payer: {
          name: 'Jane Smith',
          particulars: 'MEMBER',
          analysis: 'MARCH26',
          reference: 'INV001'
        }
      }).ok
    ).toBe(true);

    expect(
      file.addTransaction({
        fromAccount: '38-9000-1234567-02',
        amount: '55.00',
        payer: {
          name: 'John Taylor',
          particulars: 'MEMBER',
          analysis: 'MARCH26',
          reference: 'INV002'
        }
      }).ok
    ).toBe(true);

    expect(file.toString()).toBe(readFixture('westpac-direct-debit.csv'));
  });

  it('rejects portable direct debit config accounts that do not belong to the selected bank', () => {
    const wrongWestpacAccount = '01-0123-0456789-00' as string;
    const wrongAsbAccount = '01-0123-0456789-00' as string;

    expect(() =>
      createPortableDebitFile({
        bank: 'westpac',
        sourceAccount: wrongWestpacAccount,
        originatorName: 'ACME RECEIPTS LTD',
        paymentDate: '2026-03-23'
      } as Parameters<typeof createPortableDebitFile>[0])
    ).toThrowError(/expected bank 03/i);

    expect(() =>
      createPortableDebitFile({
        bank: 'asb',
        originatorName: 'ACME RECEIPTS',
        paymentDate: '2026-03-23',
        registrationId: '123456789012345',
        contra: {
          account: wrongAsbAccount,
          code: 'GYM',
          reference: 'MAR2026',
          particulars: 'MONTHLY'
        }
      } as Parameters<typeof createPortableDebitFile>[0])
    ).toThrowError(/expected bank 12/i);
  });
});

describe('Portable payment validation helpers', () => {
  it('returns actionable config diagnostics with structured context', () => {
    const result = validatePortablePaymentFileConfig({
      bank: 'westpac',
      sourceAccount: '03-3902-1002003-00',
      originatorName: 'ACME PAYROLL',
      paymentDate: '2026-03-23'
    });

    expect(result.ok).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('NZ_ACCOUNT_BRANCH');
    expect(result.errors[0]?.path).toBe('config.sourceAccount');
    expect(result.errors[0]?.suggestion).toContain('parseNzAccount()');
  });

  it('rejects portable payment config accounts that do not belong to the selected bank', () => {
    const wrongWestpacAccount = '01-0123-0456789-00' as string;

    expect(() =>
      createPortablePaymentFile({
        bank: 'westpac',
        sourceAccount: wrongWestpacAccount,
        originatorName: 'ACME PAYROLL LTD',
        paymentDate: '2026-03-23'
      } as Parameters<typeof createPortablePaymentFile>[0])
    ).toThrowError(/expected bank 03/i);

    const result = validatePortablePaymentFileConfig({
      bank: 'westpac',
      sourceAccount: wrongWestpacAccount,
      originatorName: 'ACME PAYROLL LTD'
    } as Parameters<typeof validatePortablePaymentFileConfig>[0]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('NZ_ACCOUNT_BANK');
    expect(result.errors[0]?.path).toBe('config.sourceAccount');
  });

  it('returns bank-compatibility warnings for ignored or approximate portable fields', () => {
    const result = validatePortablePaymentTransaction(
      {
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
          analysis: 'PAYROLL',
          reference: 'MAR26'
        }
      },
      { bank: 'westpac' }
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.internalReference'
        }),
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.payee.reference'
        }),
        expect.objectContaining({
          code: 'PORTABLE_FIELD_APPROXIMATED',
          path: 'transaction.payee.code'
        }),
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.payer.name'
        }),
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.payer.analysis'
        })
      ])
    );
  });

  it('returns TSB-specific ignored-field warnings for portable payment validation', () => {
    const result = validatePortablePaymentTransaction(
      {
        toAccount: '15-3900-7654321-01',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          particulars: 'SALARY',
          analysis: 'IGNORED'
        },
        payer: {
          name: 'ACME PAYROLL'
        }
      },
      { bank: 'tsb' }
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.payee.analysis'
        }),
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transaction.payer.name'
        })
      ])
    );
  });

  it('aggregates config and transaction diagnostics across a batch', () => {
    const wrongBnzSourceAccount = '18-3902-1002003-00' as string;

    const result = validatePortablePaymentBatch({
      config: {
        bank: 'bnz',
        sourceAccount: wrongBnzSourceAccount,
        originatorName: 'BNZ EXPORTS',
        paymentDate: '2026-03-23'
      } as Parameters<typeof validatePortablePaymentBatch>[0]['config'],
      transactions: [
        {
          toAccount: '18-3902-1002003-00',
          amount: '12.50',
          payee: {
            name: 'Broken Account'
          }
        },
        {
          toAccount: '01-0902-0068389-00',
          amount: '12.345',
          payer: {
            analysis: 'IGNORED'
          },
          payee: {
            name: 'Broken Amount'
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NZ_ACCOUNT_BRANCH',
          path: 'config.sourceAccount'
        }),
        expect.objectContaining({
          code: 'NZ_ACCOUNT_BRANCH',
          path: 'transactions[0].toAccount'
        }),
        expect.objectContaining({
          code: 'INVALID_MONEY',
          path: 'transactions[1].amount'
        })
      ])
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PORTABLE_FIELD_IGNORED',
          path: 'transactions[1].payer.analysis'
        })
      ])
    );
  });

  it('explains existing validation errors with suggestions', () => {
    const parsed = parseNzAccount('18-3902-1002003-00');

    expect(parsed.ok).toBe(false);

    if (parsed.ok) {
      return;
    }

    const explanation = explainValidationError(parsed.error);

    expect(explanation.code).toBe('NZ_ACCOUNT_BRANCH');
    expect(explanation.suggestion).toContain('parseNzAccount');
  });
});
