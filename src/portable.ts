import type { BatchFile } from './shared/batch-file.js';
import {
  AdapterError,
  DateError,
  FieldError,
  MoneyError,
  NzAccountError,
  NzBatchError
} from './shared/errors.js';
import type { RenderFileOptions } from './shared/records.js';
import type {
  AnzAccountInput,
  AsbAccountInput,
  BnzAccountInput,
  Cents,
  DateInput,
  KiwibankAccountInput,
  TsbAccountInput,
  WestpacAccountInput
} from './nz/types.js';
import { assertNzBankAccount, parseNzAccount } from './nz/account.js';
import { parseCents } from './nz/money.js';
import {
  createDirectDebitFile as createAnzDirectDebitFile,
  createDomesticExtendedFile,
  type AnzDirectDebitFile,
  type AnzDirectDebitFileError,
  type AnzDirectDebitTransaction,
  type AnzDomesticExtendedFileError,
  type AnzDomesticExtendedTransaction
} from './banks/anz/index.js';
import {
  createDirectCreditFile as createAsbDirectCreditFile,
  createDirectDebitFile as createAsbDirectDebitFile,
  type AsbDirectCreditTransaction,
  type AsbDirectDebitTransaction,
  type AsbFile,
  type AsbFileError,
  type AsbOtherPartyDetails,
  type AsbPartyDetails
} from './banks/asb/index.js';
import {
  createDirectCreditFile as createBnzDirectCreditFile,
  createDirectDebitFile as createBnzDirectDebitFile,
  type BnzFile,
  type BnzFileError,
  type BnzTransaction
} from './banks/bnz/index.js';
import {
  createDirectCreditFile as createKiwibankDirectCreditFile,
  createDirectDebitFile as createKiwibankDirectDebitFile,
  type KiwibankFile,
  type KiwibankFileError,
  type KiwibankTransaction
} from './banks/kiwibank/index.js';
import {
  createDirectCreditFile as createTsbDirectCreditFile,
  type TsbDirectCreditFile,
  type TsbDirectCreditFileError,
  type TsbDirectCreditTransaction
} from './banks/tsb/index.js';
import {
  createDirectCreditFile as createWestpacDirectCreditFile,
  createDirectDebitFile as createWestpacDirectDebitFile,
  type WestpacDirectDebitFile,
  type WestpacDirectDebitTransaction,
  type WestpacPaymentFile,
  type WestpacPaymentFileError,
  type WestpacPaymentTransaction
} from './banks/westpac/index.js';

/** Supported banks for the portable outbound payment API. */
export type PortablePaymentBank =
  | 'anz'
  | 'asb'
  | 'bnz'
  | 'kiwibank'
  | 'tsb'
  | 'westpac';

/** Supported banks for the portable direct debit API. */
export type PortableDebitBank = 'anz' | 'asb' | 'bnz' | 'kiwibank' | 'westpac';

/**
 * Portable payment category.
 *
 * `salary-and-wages` only changes the rendered transaction code for banks that support a
 * dedicated salary/wages distinction today:
 *
 * - ANZ: renders transaction code `52`
 * - ASB: renders transaction code `052`
 * - BNZ, Kiwibank, and TSB: currently treated the same as `standard`
 * - Westpac: renders transaction code `52`
 */
export type PortablePaymentCategory = 'standard' | 'salary-and-wages';

/**
 * Party details shown to the receiving side of a portable payment or debit.
 *
 * The same business fields map differently by bank, so IntelliSense needs the semantics here,
 * not just the type names.
 *
 * Portable-safe sizing rules when you expect to switch banks:
 *
 * - keep `name` within 20 printable ASCII characters
 * - keep `particulars`, `code`, `reference`, and `analysis` within 12 printable ASCII characters
 *
 * ANZ, TSB, and Westpac reject over-length text. ASB, BNZ, and Kiwibank truncate several native
 * text fields to fit their upload layouts.
 */
export type PortablePaymentParty = {
  /**
   * Human-readable party name.
   *
   * This is usually the payee or payer name visible to the counterparty.
   * All supported banks use a name field.
   *
   * Portable-safe limit: 20 printable ASCII characters.
   *
   * - ANZ: maps to `otherPartyName` / `subscriberName`, rejects over-length values
   * - ASB: maps to MT9 name fields, truncates to 20 characters
   * - BNZ and Kiwibank: maps to `accountName`, truncates to 20 characters
  * - TSB: maps to the credit account name, rejects over-length values above 20 characters
   * - Westpac: maps to `accountName`, rejects over-length values above 20 characters
   *
   * Example: `Jane Smith`
   */
  readonly name: string;

  /**
   * Particulars or narrative line for the party.
   *
   * Commonly used for invoice references, payroll markers, or short statement text.
   * Supported by all current portable payment banks.
   *
   * Portable-safe limit: 12 printable ASCII characters.
   *
   * - ANZ and Westpac reject over-length values
  * - TSB also rejects over-length values
  * - ASB, BNZ, and Kiwibank truncate to 12 characters
   *
   * Example: `PAY`
   */
  readonly particulars?: string;

  /**
   * Short code or alpha reference for the party.
   *
   * Business meaning varies by bank:
   *
   * - ANZ: maps to the other-party alpha reference
   * - ASB: maps to the MT9 code field
   * - BNZ and Kiwibank: maps to the code field
  * - TSB: maps to the part/code field
   * - Westpac: only used as a fallback for `payeeAnalysis` when `analysis` is omitted
   *
   * Portable-safe limit: 12 printable ASCII characters.
   *
   * Westpac does not have a distinct portable `code` field. When `analysis` is absent,
   * `code` is reused as `payeeAnalysis` and preflight validation reports an approximation warning.
   *
   * Example: `MARCH`
   */
  readonly code?: string;

  /**
   * Free-text reference line for the party.
   *
   * This often carries a customer reference, invoice number, or payroll reference. It is not the
   * same as `code` or `particulars`, and some banks ignore it for specific roles.
   *
   * Portable-safe limit: 12 printable ASCII characters.
   *
   * Westpac portable payments ignore `payee.reference` completely.
   *
   * Example: `SALARY`
   */
  readonly reference?: string;

  /**
   * Analysis or information field for the party.
   *
   * This is the most bank-sensitive portable field:
   *
   * - ANZ: maps to the analysis code field
   * - ASB: falls back into the code field when `code` is omitted
   * - BNZ and Kiwibank: maps to the information field
  * - TSB: ignored by the TSB portable mapping
   * - Westpac: maps to `payeeAnalysis`
   *
   * Portable-safe limit: 12 printable ASCII characters.
   *
   * ASB does not expose a separate analysis field. When `code` is omitted, `analysis` is reused as
   * the MT9 code field and preflight validation reports an approximation warning.
   *
   * Example: `MARCH26`
   */
  readonly analysis?: string;
};

/**
 * Optional payer details attached to a portable payment.
 *
 * Not every bank has a true second-party block for outbound payments. Some fields are ignored or
 * approximated depending on the target bank, so use `validatePortablePaymentTransaction()` or
 * `validatePortablePaymentBatch()` when you want compatibility warnings before rendering.
 *
 * Portable-safe sizing is the same as `PortablePaymentParty`: 20 printable ASCII characters for
 * `name`, 12 for the short narrative fields.
 */
export type PortablePaymentPayer = {
  /**
   * Human-readable payer name.
   *
   * Used by ANZ and ASB. Ignored by BNZ, Kiwibank, and Westpac portable payment output.
   * Keep this within 20 printable ASCII characters when supplied.
   *
   * Example: `ACME PAYROLL`
   */
  readonly name?: string;

  /**
   * Payer particulars line.
   *
   * Used by ANZ and ASB. Ignored by BNZ, Kiwibank, and Westpac portable payment output.
   * Keep this within 12 printable ASCII characters when supplied.
   */
  readonly particulars?: string;

  /**
   * Payer code field.
   *
   * ASB maps this to the MT9 code field. Other portable payment adapters either ignore it or
   * prefer `analysis` for their native equivalent.
   * Keep this within 12 printable ASCII characters when supplied.
   */
  readonly code?: string;

  /**
   * Payer reference line.
   *
   * Used by ANZ, ASB, and Westpac. Ignored by BNZ and Kiwibank portable payment output.
   * Keep this within 12 printable ASCII characters when supplied.
   */
  readonly reference?: string;

  /**
   * Payer analysis field.
   *
   * Used by ANZ and ASB. Ignored by BNZ, Kiwibank, and Westpac portable payment output.
   * Keep this within 12 printable ASCII characters when supplied.
   */
  readonly analysis?: string;
};

/**
 * Direct-debit payer details.
 *
 * This reuses the same semantic field model and sizing guidance as `PortablePaymentParty`.
 */
export type PortableDebitPayer = PortablePaymentParty;

/**
 * Optional originator details attached to a portable direct debit transaction.
 *
 * ASB maps these fields to the debit `otherParty` block. BNZ and Kiwibank do not expose a full
 * second-party debit block, so only selected fields are reused as fallbacks.
 */
export type PortableDebitOriginator = PortablePaymentPayer;

/**
 * Backward-compatible alias for `PortableDebitOriginator`.
 *
 * `originator` is the preferred neutral naming because it aligns with portable payment file config
 * fields such as `originatorName`.
 */
export type PortableDebitCollector = PortableDebitOriginator;

type PortableDebitOriginatorNameFields =
  | {
      /**
       * Originator or creditor name shown in the batch header where supported.
       *
       * This is the aligned portable-debit name and matches portable payment config.
       */
      readonly originatorName: string;
      readonly collectorName?: never;
    }
  | {
      /**
       * Backward-compatible alias for `originatorName`.
       *
       * This remains supported for existing portable direct debit callers.
       */
      readonly collectorName: string;
      readonly originatorName?: never;
    };

type PortableDebitDateFields =
  | {
      /**
       * Requested debit or process date.
       *
       * This is the aligned portable-debit name and matches portable payment config.
       */
      readonly paymentDate: DateInput;
      readonly collectionDate?: never;
    }
  | {
      /**
       * Backward-compatible alias for `paymentDate`.
       *
       * This remains supported for existing portable direct debit callers.
       */
      readonly collectionDate: DateInput;
      readonly paymentDate?: never;
    }
  | {
      readonly paymentDate?: never;
      readonly collectionDate?: never;
    };

type PortableDebitOriginatorFields =
  | {
      /**
       * Optional originator-side metadata.
       *
       * This is the aligned portable-debit name and mirrors the file-level `originatorName`.
       */
      readonly originator?: PortableDebitOriginator;
      readonly collector?: never;
    }
  | {
      /**
       * Backward-compatible alias for `originator`.
       *
       * This remains supported for existing portable direct debit callers.
       */
      readonly collector?: PortableDebitCollector;
      readonly originator?: never;
    }
  | {
      readonly originator?: never;
      readonly collector?: never;
    };

/**
 * ASB-only contra record configuration for portable direct debit files.
 *
 * This is included in the neutral API because ASB direct debit exposes a real contra record in the
 * underlying MT9 format.
 */
export type PortableDebitContra = {
  /** NZ account to receive the contra entry, for example `01-0123-0456789-00`. */
  readonly account: AsbAccountInput;

  /**
   * Optional contra party name.
   *
   * ASB maps this to `otherPartyName` and truncates over-length values to 20 characters.
   */
  readonly name?: string;

  /** Optional contra particulars line. ASB truncates this field to 12 characters. */
  readonly particulars?: string;

  /** Optional contra code field. ASB truncates this field to 12 characters. */
  readonly code?: string;

  /** Optional contra reference line. ASB truncates this field to 12 characters. */
  readonly reference?: string;
};

type PortablePaymentFileConfigBase<TBank extends PortablePaymentBank> = {
  /** Bank adapter to target from the neutral portable payment model. */
  readonly bank: TBank;

  /**
   * Originator name or payer name shown in the file header where supported.
   *
   * This is required by all portable payment banks, but the rendered field name differs by bank:
   * ANZ subscriber name fallback, ASB client short name, BNZ/Kiwibank originator name, Westpac
   * customer name.
   *
   * Example: `ACME PAYROLL`
   */
  readonly originatorName: string;

  /**
   * Requested payment or process date.
   *
   * Accepted as `Date`, `YYYY-MM-DD`, `DD-MM-YYYY`, `YYYYMMDD`, or `YYMMDD`, then normalised into
   * the bank-specific wire format.
   */
  readonly paymentDate?: DateInput;
};

/**
 * ANZ portable payment configuration.
 *
 * `batchCreationDate` is ANZ-specific metadata used by the domestic extended header. When omitted,
 * it falls back to `paymentDate`, then the current date.
 */
export type PortableAnzPaymentFileConfig =
  PortablePaymentFileConfigBase<'anz'> & {
    /** ANZ-owned NZ source account such as `01-0123-0456789-00` or `06-1400-7654321-00`. */
    readonly sourceAccount: AnzAccountInput;

    /**
     * ANZ domestic extended batch creation date.
     *
     * Use this when the upload batch creation day must differ from the due date. Ignored by other
     * banks.
     */
    readonly batchCreationDate?: DateInput;
    readonly batchReference?: never;
    readonly westpacRenderFormat?: never;
  };

/** ASB portable payment configuration. */
export type PortableAsbPaymentFileConfig =
  PortablePaymentFileConfigBase<'asb'> & {
    /** ASB-owned NZ source account such as `12-3200-0456789-00`. */
    readonly sourceAccount: AsbAccountInput;

    readonly batchReference?: never;
    readonly batchCreationDate?: never;
    readonly westpacRenderFormat?: never;
  };

/**
 * BNZ portable payment configuration.
 *
 * `batchReference` maps to BNZ `userReference`.
 */
export type PortableBnzPaymentFileConfig =
  PortablePaymentFileConfigBase<'bnz'> & {
    /** BNZ-owned NZ source account such as `02-0001-0000001-00`. */
    readonly sourceAccount: BnzAccountInput;

    /**
     * Batch-level reference shown in BNZ output.
     *
     * Example: `MARCH2026`
     */
    readonly batchReference?: string;
    readonly batchCreationDate?: never;
    readonly westpacRenderFormat?: never;
  };

/**
 * Kiwibank portable payment configuration.
 *
 * `batchReference` maps to the Kiwibank batch reference field.
 */
export type PortableKiwibankPaymentFileConfig =
  PortablePaymentFileConfigBase<'kiwibank'> & {
    /** Kiwibank-owned NZ source account such as `38-9000-7654321-00`. */
    readonly sourceAccount: KiwibankAccountInput;

    /**
     * Batch-level reference shown in Kiwibank output.
     *
     * Example: `MARCH2026`
     */
    readonly batchReference?: string;
    readonly batchCreationDate?: never;
    readonly westpacRenderFormat?: never;
  };

/** TSB portable payment configuration. */
export type PortableTsbPaymentFileConfig =
  PortablePaymentFileConfigBase<'tsb'> & {
    /** TSB-owned NZ source account such as `15-3900-1234567-00`. */
    readonly sourceAccount: TsbAccountInput;

    readonly batchReference?: never;
    readonly batchCreationDate?: never;
    readonly westpacRenderFormat?: never;
  };

/**
 * Westpac portable payment configuration.
 *
 * Westpac portable payments use the Business Online Deskbank CSV direct-credit layout.
 */
export type PortableWestpacPaymentFileConfig =
  PortablePaymentFileConfigBase<'westpac'> & {
    /** Westpac-owned NZ source account such as `03-1702-0456789-00`. */
    readonly sourceAccount: WestpacAccountInput;

    /**
     * File-level reference used by Westpac header output.
     *
     * Example: `MARCH2026`
     */
    readonly batchReference?: string;

    readonly batchCreationDate?: never;
    readonly westpacRenderFormat?: never;
  };

/**
 * Portable outbound payment file configuration.
 *
 * This is a discriminated union keyed by `bank`, so editor autocomplete can hide bank-only fields
 * that do not apply to the selected target.
 */
export type PortablePaymentFileConfig =
  | PortableAnzPaymentFileConfig
  | PortableAsbPaymentFileConfig
  | PortableBnzPaymentFileConfig
  | PortableKiwibankPaymentFileConfig
  | PortableTsbPaymentFileConfig
  | PortableWestpacPaymentFileConfig;

type PortableDebitFileConfigBase<TBank extends PortableDebitBank> = {
  /** Bank adapter to target from the neutral portable direct debit model. */
  readonly bank: TBank;
} & PortableDebitOriginatorNameFields & PortableDebitDateFields;

/**
 * ANZ portable direct debit configuration.
 *
 * ANZ's MTS-style direct debit file carries due-date metadata but does not use a portable source
 * account, registration id, contra record, or batch reference field.
 */
export type PortableAnzDebitFileConfig = PortableDebitFileConfigBase<'anz'> & {
  /** Optional ANZ batch creation date for the header record. Defaults to `paymentDate`. */
  readonly batchCreationDate?: DateInput;
  readonly sourceAccount?: never;
  readonly registrationId?: never;
  readonly contra?: never;
  readonly batchReference?: never;
};

/**
 * ASB portable direct debit configuration.
 *
 * ASB is the only portable direct debit target that exposes registration metadata and an optional
 * contra record in the neutral API.
 */
export type PortableAsbDebitFileConfig = PortableDebitFileConfigBase<'asb'> & {
  /**
   * ASB MT9 registration identifier.
   *
   * Keep this within 15 printable characters and use the exact value issued for your ASB direct
   * debit facility.
   */
  readonly registrationId: string;

  /**
   * Optional ASB contra record.
   *
   * When supplied, the contra amount is included in the rendered ASB trailer totals.
   */
  readonly contra?: PortableDebitContra;
};

/**
 * BNZ portable direct debit configuration.
 *
 * `batchReference` maps to BNZ `userReference` and is truncated to 12 characters.
 */
export type PortableBnzDebitFileConfig = PortableDebitFileConfigBase<'bnz'> & {
  /**
   * NZ settlement account used to collect the debit batch.
   *
   * The account is validated against the bundled NZ bank table and bank checksum rules used by the
   * BNZ adapter.
   */
  readonly sourceAccount: BnzAccountInput;

  /** Optional BNZ batch-level reference. Portable-safe limit: 12 printable ASCII characters. */
  readonly batchReference?: string;
};

/**
 * Kiwibank portable direct debit configuration.
 *
 * `batchReference` maps to the Kiwibank batch reference field and is truncated to 12 characters.
 */
export type PortableKiwibankDebitFileConfig =
  PortableDebitFileConfigBase<'kiwibank'> & {
    /**
     * NZ settlement account used to collect the debit batch.
     *
     * The account is validated against the bundled NZ bank table and bank checksum rules used by the
     * Kiwibank adapter.
     */
    readonly sourceAccount: KiwibankAccountInput;

    /** Optional Kiwibank batch-level reference. Portable-safe limit: 12 printable ASCII characters. */
    readonly batchReference?: string;
  };

/**
 * Westpac portable direct debit configuration.
 *
 * `sourceAccount` is the collector account credited by each direct debit detail row.
 */
export type PortableWestpacDebitFileConfig =
  PortableDebitFileConfigBase<'westpac'> & {
    /** NZ settlement account credited by the direct-debit batch. */
    readonly sourceAccount: WestpacAccountInput;

    /** Optional Westpac file-level reference shown in the header description field. */
    readonly batchReference?: string;
  };

/**
 * Portable outbound direct debit file configuration.
 *
 * This is a discriminated union keyed by `bank`, so autocomplete can surface ASB-only fields such
 * as `registrationId` and `contra` only when they actually apply.
 */
export type PortableDebitFileConfig =
  | PortableAnzDebitFileConfig
  | PortableAsbDebitFileConfig
  | PortableBnzDebitFileConfig
  | PortableKiwibankDebitFileConfig
  | PortableWestpacDebitFileConfig;

/**
 * Neutral outbound payment transaction.
 *
 * One transaction shape is mapped into bank-specific payment formats. Use validation helpers when
 * you need warnings for ignored or approximate fields before rendering.
 */
export type PortablePaymentTransaction = {
  /**
   * Destination NZ account in standard format, for example `12-3200-0123456-00`.
   *
   * The value is normalised and validated before rendering. Invalid bank or branch combinations are
   * reported as `NZ_ACCOUNT_BRANCH` diagnostics.
   */
  readonly toAccount: string;

  /**
   * Payment amount.
   *
   * Accepts a decimal amount string such as `12.50`, a bigint cents value, or a branded `Cents`
   * value.
   */
  readonly amount: string | bigint | Cents;

  /**
   * High-level payment category.
   *
   * `salary-and-wages` only changes the transaction code for banks that support that distinction.
   * Use validation warnings to spot banks where the category is currently ignored.
   */
  readonly category?: PortablePaymentCategory;

  /**
   * Receiving party details.
   *
   * `payee.reference`, `payee.code`, `payee.particulars`, and `payee.analysis` do not mean the same
   * thing for every bank, so prefer validation warnings when switching banks.
   */
  readonly payee: PortablePaymentParty;

  /**
   * Optional payer details.
   *
   * Some banks use these fields directly, some ignore them, and others only map a subset.
   */
  readonly payer?: PortablePaymentPayer;

  /**
   * Internal reference line for adapters that expose one.
   *
   * Currently only ASB direct credit uses this field directly.
   *
   * Example: `PAYROLL01`
   */
  readonly internalReference?: string;
};

export type PortableDebitTransaction = {
  /**
   * NZ account to debit, for example `01-0123-0456789-00`.
   *
   * This is validated and normalised before rendering. Invalid bank or branch combinations are
   * reported as `NZ_ACCOUNT_BRANCH` diagnostics by the underlying adapters.
   */
  readonly fromAccount: string;

  /**
   * Debit amount.
   *
   * Accepts a decimal amount string such as `45.00`, a bigint cents value, or a branded `Cents`
   * value.
   */
  readonly amount: string | bigint | Cents;

  /**
   * Payer details shown on the debit transaction.
   *
   * Portable-safe sizing is the same as portable payments: keep `name` within 20 printable ASCII
   * characters and keep short narrative fields within 12.
   */
  readonly payer: PortableDebitPayer;

  /**
   * Optional collector-side metadata.
   *
   * ASB maps this into the debit `otherParty` block. BNZ and Kiwibank reuse only a subset of these
   * fields when the payer-side portable data does not already provide them.
   */
} & PortableDebitOriginatorFields;

export type PortablePaymentFileError =
  | AdapterError
  | DateError
  | FieldError
  | MoneyError
  | NzAccountError;

export type PortablePaymentFile = BatchFile<
  PortablePaymentTransaction,
  PortablePaymentFileError
> & {
  readonly kind: 'portable-payment';
  readonly bank: PortablePaymentBank;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type PortableDebitFileError = PortablePaymentFileError;

export type PortableDebitFile = BatchFile<
  PortableDebitTransaction,
  PortableDebitFileError
> & {
  readonly kind: 'portable-debit';
  readonly bank: PortableDebitBank;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

type UnderlyingPortablePaymentFile =
  | ReturnType<typeof createDomesticExtendedFile>
  | AsbFile<AsbDirectCreditTransaction>
  | BnzFile
  | KiwibankFile
  | TsbDirectCreditFile
  | WestpacPaymentFile;

type UnderlyingPortableDebitFile =
  | AnzDirectDebitFile
  | AsbFile<AsbDirectDebitTransaction>
  | BnzFile
  | KiwibankFile
  | WestpacDirectDebitFile;

function toAsbParty(party: PortablePaymentParty): AsbPartyDetails {
  return {
    name: party.name,
    code: party.code ?? party.analysis ?? '',
    ...(party.reference !== undefined
      ? { alphaReference: party.reference }
      : {}),
    ...(party.particulars !== undefined
      ? { particulars: party.particulars }
      : {})
  };
}

function toAsbOtherParty(
  party: PortablePaymentPayer | undefined,
  defaultName: string
): AsbOtherPartyDetails {
  return {
    ...(party?.name !== undefined || defaultName.length > 0
      ? { name: party?.name ?? defaultName }
      : {}),
    ...(party?.code !== undefined || party?.analysis !== undefined
      ? { code: party.code ?? party.analysis }
      : {}),
    ...(party?.reference !== undefined
      ? { alphaReference: party.reference }
      : {}),
    ...(party?.particulars !== undefined
      ? { particulars: party.particulars }
      : {})
  };
}

function getPortableDebitOriginatorName(config: PortableDebitFileConfig): string {
  return 'originatorName' in config
    ? config.originatorName
    : config.collectorName;
}

function getPortableDebitPaymentDate(
  config: PortableDebitFileConfig
): DateInput | undefined {
  return 'paymentDate' in config ? config.paymentDate : config.collectionDate;
}

function getPortableDebitOriginator(
  transaction: PortableDebitTransaction
): PortableDebitOriginator | undefined {
  return 'originator' in transaction ? transaction.originator : transaction.collector;
}

function createUnderlyingPaymentFile(
  config: PortablePaymentFileConfig
): UnderlyingPortablePaymentFile {
  assertPortableConfigSourceAccount(config);

  switch (config.bank) {
    case 'anz':
      return createDomesticExtendedFile({
        batchDueDate: config.paymentDate ?? new Date(),
        batchCreationDate:
          config.batchCreationDate ?? config.paymentDate ?? new Date()
      });

    case 'asb':
      return createAsbDirectCreditFile({
        fromAccount: config.sourceAccount,
        dueDate: config.paymentDate ?? new Date(),
        clientShortName: config.originatorName
      });

    case 'bnz':
      return createBnzDirectCreditFile({
        fromAccount: config.sourceAccount,
        originatorName: config.originatorName,
        ...(config.batchReference !== undefined
          ? { userReference: config.batchReference }
          : {}),
        ...(config.paymentDate !== undefined
          ? { processDate: config.paymentDate }
          : {})
      });

    case 'kiwibank':
      return createKiwibankDirectCreditFile({
        fromAccount: config.sourceAccount,
        originatorName: config.originatorName,
        ...(config.batchReference !== undefined
          ? { batchReference: config.batchReference }
          : {}),
        ...(config.paymentDate !== undefined
          ? { processDate: config.paymentDate }
          : {})
      });

    case 'tsb':
      return createTsbDirectCreditFile({
        fromAccount: config.sourceAccount,
        originatorName: config.originatorName,
        ...(config.paymentDate !== undefined
          ? { dueDate: config.paymentDate }
          : {})
      });

    case 'westpac':
      return createWestpacDirectCreditFile({
        fromAccount: config.sourceAccount,
        customerName: config.originatorName,
        ...(config.batchReference !== undefined
          ? { fileReference: config.batchReference }
          : {}),
        ...(config.paymentDate !== undefined
          ? { scheduledDate: config.paymentDate }
          : {})
      });
  }
}

function createUnderlyingDebitFile(
  config: PortableDebitFileConfig
): UnderlyingPortableDebitFile {
  assertPortableDebitConfigSourceAccount(config);
  const originatorName = getPortableDebitOriginatorName(config);
  const paymentDate = getPortableDebitPaymentDate(config);

  switch (config.bank) {
    case 'anz':
      return createAnzDirectDebitFile({
        batchDueDate: paymentDate ?? new Date(),
        batchCreationDate:
          config.batchCreationDate ?? paymentDate ?? new Date()
      });

    case 'asb':
      return createAsbDirectDebitFile({
        registrationId: config.registrationId,
        dueDate: paymentDate ?? new Date(),
        clientShortName: originatorName,
        ...(config.contra !== undefined
          ? {
              contra: {
                account: config.contra.account,
                ...(config.contra.code !== undefined
                  ? { code: config.contra.code }
                  : {}),
                ...(config.contra.reference !== undefined
                  ? { alphaReference: config.contra.reference }
                  : {}),
                ...(config.contra.particulars !== undefined
                  ? { particulars: config.contra.particulars }
                  : {}),
                ...(config.contra.name !== undefined
                  ? { otherPartyName: config.contra.name }
                  : {})
              }
            }
          : {})
      });

    case 'bnz':
      return createBnzDirectDebitFile({
        fromAccount: config.sourceAccount,
        originatorName,
        ...(config.batchReference !== undefined
          ? { userReference: config.batchReference }
          : {}),
        ...(paymentDate !== undefined
          ? { processDate: paymentDate }
          : {})
      });

    case 'kiwibank':
      return createKiwibankDirectDebitFile({
        fromAccount: config.sourceAccount,
        originatorName,
        ...(config.batchReference !== undefined
          ? { batchReference: config.batchReference }
          : {}),
        ...(paymentDate !== undefined
          ? { processDate: paymentDate }
          : {})
      });

    case 'westpac':
      return createWestpacDirectDebitFile({
        toAccount: config.sourceAccount,
        customerName: originatorName,
        ...(config.batchReference !== undefined
          ? { fileReference: config.batchReference }
          : {}),
        ...(paymentDate !== undefined
          ? { scheduledDate: paymentDate }
          : {})
      });
  }
}

function addPortablePaymentTransaction(
  config: PortablePaymentFileConfig,
  file: UnderlyingPortablePaymentFile,
  transaction: PortablePaymentTransaction
) {
  switch (config.bank) {
    case 'anz': {
      const anzFile = file as ReturnType<typeof createDomesticExtendedFile>;
      const anzTransaction = {
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        ...(transaction.category === 'salary-and-wages'
          ? { transactionCode: '52' }
          : {}),
        otherPartyName: transaction.payee.name,
        ...(transaction.payee.reference !== undefined
          ? { otherPartyReference: transaction.payee.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined
          ? { otherPartyAnalysisCode: transaction.payee.analysis }
          : {}),
        ...(transaction.payee.code !== undefined
          ? { otherPartyAlphaReference: transaction.payee.code }
          : {}),
        ...(transaction.payee.particulars !== undefined
          ? { otherPartyParticulars: transaction.payee.particulars }
          : {}),
        subscriberName: transaction.payer?.name ?? config.originatorName,
        ...(transaction.payer?.analysis !== undefined
          ? { subscriberAnalysisCode: transaction.payer.analysis }
          : {}),
        ...(transaction.payer?.reference !== undefined
          ? { subscriberReference: transaction.payer.reference }
          : {}),
        ...(transaction.payer?.particulars !== undefined
          ? { subscriberParticulars: transaction.payer.particulars }
          : {})
      } satisfies AnzDomesticExtendedTransaction;

      return anzFile.addTransaction(anzTransaction);
    }

    case 'asb': {
      const asbFile = file as AsbFile<AsbDirectCreditTransaction>;
      const asbTransaction = {
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        ...(transaction.category === 'salary-and-wages'
          ? { transactionCode: '052' }
          : {}),
        ...(transaction.internalReference !== undefined
          ? { internalReference: transaction.internalReference }
          : {}),
        thisParty: toAsbParty(transaction.payee),
        otherParty: toAsbOtherParty(transaction.payer, config.originatorName)
      } satisfies AsbDirectCreditTransaction;

      return asbFile.addTransaction(asbTransaction);
    }

    case 'bnz': {
      const bnzFile = file as BnzFile;
      const bnzTransaction = {
        counterpartyAccount: transaction.toAccount,
        amount: transaction.amount,
        accountName: transaction.payee.name,
        ...(transaction.payee.particulars !== undefined
          ? { particulars: transaction.payee.particulars }
          : {}),
        ...(transaction.payee.code !== undefined
          ? { code: transaction.payee.code }
          : {}),
        ...(transaction.payee.reference !== undefined
          ? { reference: transaction.payee.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined
          ? { information: transaction.payee.analysis }
          : {})
      } satisfies BnzTransaction;

      return bnzFile.addTransaction(bnzTransaction);
    }

    case 'kiwibank': {
      const kiwibankFile = file as KiwibankFile;
      const kiwibankTransaction = {
        counterpartyAccount: transaction.toAccount,
        amount: transaction.amount,
        accountName: transaction.payee.name,
        ...(transaction.payee.particulars !== undefined
          ? { particulars: transaction.payee.particulars }
          : {}),
        ...(transaction.payee.code !== undefined
          ? { code: transaction.payee.code }
          : {}),
        ...(transaction.payee.reference !== undefined
          ? { reference: transaction.payee.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined
          ? { information: transaction.payee.analysis }
          : {})
      } satisfies KiwibankTransaction;

      return kiwibankFile.addTransaction(kiwibankTransaction);
    }

    case 'tsb': {
      const tsbFile = file as TsbDirectCreditFile;
      const tsbTransaction = {
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        accountName: transaction.payee.name,
        particulars: transaction.payee.particulars ?? '',
        ...(transaction.payee.code !== undefined
          ? { code: transaction.payee.code }
          : {}),
        ...(transaction.payee.reference !== undefined
          ? { reference: transaction.payee.reference }
          : {})
      } satisfies TsbDirectCreditTransaction;

      return tsbFile.addTransaction(tsbTransaction);
    }

    case 'westpac': {
      const westpacFile = file as WestpacPaymentFile;
      const westpacTransaction = {
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        accountName: transaction.payee.name,
        ...(transaction.category === 'salary-and-wages'
          ? { transactionCode: '52' as const }
          : {}),
        ...(transaction.payer?.reference !== undefined
          ? { payerReference: transaction.payer.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined ||
        transaction.payee.code !== undefined
          ? {
              payeeAnalysis:
                transaction.payee.analysis ?? transaction.payee.code
            }
          : {}),
        ...(transaction.payee.particulars !== undefined
          ? { payeeParticulars: transaction.payee.particulars }
          : {})
      } satisfies WestpacPaymentTransaction;

      return westpacFile.addTransaction(westpacTransaction);
    }
  }
}

function addPortableDebitTransaction(
  config: PortableDebitFileConfig,
  file: UnderlyingPortableDebitFile,
  transaction: PortableDebitTransaction
) {
  const originator = getPortableDebitOriginator(transaction);

  switch (config.bank) {
    case 'anz': {
      const anzFile = file as AnzDirectDebitFile;
      const collectorName =
        originator?.name ?? getPortableDebitOriginatorName(config);
      const customerReference =
        transaction.payer.reference ?? transaction.payer.name;
      const anzTransaction = {
        fromAccount: transaction.fromAccount,
        amount: transaction.amount,
        organisationName: collectorName,
        customerReference
      } satisfies AnzDirectDebitTransaction;

      return anzFile.addTransaction(anzTransaction);
    }

    case 'asb': {
      const asbFile = file as AsbFile<AsbDirectDebitTransaction>;
      const asbTransaction = {
        toAccount: transaction.fromAccount,
        amount: transaction.amount,
        thisParty: toAsbParty(transaction.payer),
        otherParty: toAsbOtherParty(originator, '')
      } satisfies AsbDirectDebitTransaction;

      return asbFile.addTransaction(asbTransaction);
    }

    case 'bnz': {
      const bnzFile = file as BnzFile;
      const bnzTransaction = {
        counterpartyAccount: transaction.fromAccount,
        amount: transaction.amount,
        accountName: transaction.payer.name,
        ...(transaction.payer.particulars !== undefined
          ? { particulars: transaction.payer.particulars }
          : originator?.particulars !== undefined
            ? { particulars: originator.particulars }
            : {}),
        ...(originator?.code !== undefined
          ? { code: originator.code }
          : originator?.analysis !== undefined
            ? { code: originator.analysis }
            : {}),
        ...(transaction.payer.reference !== undefined
          ? { reference: transaction.payer.reference }
          : originator?.reference !== undefined
            ? { reference: originator.reference }
            : {}),
        ...(transaction.payer.analysis !== undefined
          ? { information: transaction.payer.analysis }
          : {})
      } satisfies BnzTransaction;

      return bnzFile.addTransaction(bnzTransaction);
    }

    case 'kiwibank': {
      const kiwibankFile = file as KiwibankFile;
      const kiwibankTransaction = {
        counterpartyAccount: transaction.fromAccount,
        amount: transaction.amount,
        accountName: transaction.payer.name,
        ...(transaction.payer.particulars !== undefined
          ? { particulars: transaction.payer.particulars }
          : originator?.particulars !== undefined
            ? { particulars: originator.particulars }
            : {}),
        ...(originator?.code !== undefined
          ? { code: originator.code }
          : originator?.analysis !== undefined
            ? { code: originator.analysis }
            : {}),
        ...(transaction.payer.reference !== undefined
          ? { reference: transaction.payer.reference }
          : originator?.reference !== undefined
            ? { reference: originator.reference }
            : {}),
        ...(transaction.payer.analysis !== undefined
          ? { information: transaction.payer.analysis }
          : {})
      } satisfies KiwibankTransaction;

      return kiwibankFile.addTransaction(kiwibankTransaction);
    }

    case 'westpac': {
      const westpacFile = file as WestpacDirectDebitFile;
      const payerAnalysis =
        transaction.payer.analysis ?? originator?.code;
      const westpacTransaction = {
        fromAccount: transaction.fromAccount,
        amount: transaction.amount,
        accountName: transaction.payer.name,
        ...(transaction.payer.reference !== undefined
          ? { payerReference: transaction.payer.reference }
          : {}),
        ...(payerAnalysis !== undefined ? { payerAnalysis } : {}),
        ...(transaction.payer.particulars !== undefined
          ? { payerParticulars: transaction.payer.particulars }
          : {})
      } satisfies WestpacDirectDebitTransaction;

      return westpacFile.addTransaction(westpacTransaction);
    }
  }
}

export function createPortablePaymentFile(
  config: PortablePaymentFileConfig
): PortablePaymentFile {
  const underlying = createUnderlyingPaymentFile(config);

  return {
    kind: 'portable-payment',
    bank: config.bank,
    addTransaction(transaction) {
      return addPortablePaymentTransaction(
        config,
        underlying,
        transaction
      ) as ReturnType<PortablePaymentFile['addTransaction']>;
    },
    summary() {
      return underlying.summary();
    },
    toBuffer(options?: RenderFileOptions) {
      return underlying.toBuffer(options);
    },
    toString(options?: RenderFileOptions) {
      return underlying.toString(options);
    }
  };
}

export function createPortableDebitFile(
  config: PortableDebitFileConfig
): PortableDebitFile {
  const underlying = createUnderlyingDebitFile(config);

  return {
    kind: 'portable-debit',
    bank: config.bank,
    addTransaction(transaction) {
      return addPortableDebitTransaction(
        config,
        underlying,
        transaction
      ) as ReturnType<PortableDebitFile['addTransaction']>;
    },
    summary() {
      return underlying.summary();
    },
    toBuffer(options?: RenderFileOptions) {
      return underlying.toBuffer(options);
    },
    toString(options?: RenderFileOptions) {
      return underlying.toString(options);
    }
  };
}

export type PortablePaymentSourceError =
  | AnzDomesticExtendedFileError
  | AsbFileError
  | BnzFileError
  | KiwibankFileError
  | TsbDirectCreditFileError
  | WestpacPaymentFileError;

export type PortableDebitSourceError =
  | AnzDirectDebitFileError
  | AsbFileError
  | BnzFileError
  | KiwibankFileError
  | WestpacPaymentFileError;

export type PortablePaymentValidationWarningCode =
  | 'PORTABLE_FIELD_APPROXIMATED'
  | 'PORTABLE_FIELD_IGNORED';

export type PortablePaymentValidationIssueCode =
  | PortablePaymentFileError['code']
  | PortablePaymentValidationWarningCode;

/** Structured validation issue returned by portable preflight helpers. */
export type PortablePaymentValidationIssue = {
  /** `error` blocks safe rendering. `warning` indicates lossy or ignored portable semantics. */
  readonly severity: 'error' | 'warning';

  /** Stable machine-readable code for programmatic handling. */
  readonly code: PortablePaymentValidationIssueCode;

  /** Path-like location such as `config.sourceAccount` or `transactions[3].toAccount`. */
  readonly path: string;

  /** Human-readable explanation of what failed or what may be ignored. */
  readonly message: string;

  /** Optional structured context copied from the underlying error or compatibility rule. */
  readonly context?: Record<string, unknown>;

  /** Practical next step to try in application code or user input flows. */
  readonly suggestion?: string;
};

/** Aggregated validation result from portable preflight helpers. */
export type PortablePaymentValidationResult = {
  readonly ok: boolean;
  readonly errors: readonly PortablePaymentValidationIssue[];
  readonly warnings: readonly PortablePaymentValidationIssue[];
};

/** Context for validating a single portable payment transaction outside batch creation. */
export type PortablePaymentTransactionValidationOptions = {
  /** Bank adapter the transaction should be checked against. */
  readonly bank: PortablePaymentBank;
};

/** Input for validating a complete portable payment batch before rendering. */
export type PortablePaymentBatchValidationInput = {
  /** File-level portable payment config to validate. */
  readonly config: PortablePaymentFileConfig;

  /** Transactions to validate against the selected bank. */
  readonly transactions: readonly PortablePaymentTransaction[];
};

/**
 * Structured explanation of an existing validation error.
 *
 * Useful when application code catches a thrown `NzBatchError` or inspects a failed `Result` and
 * wants a suggestion string without hard-coding error codes.
 */
export type PortableValidationErrorExplanation = {
  readonly code: PortablePaymentFileError['code'];
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly suggestion?: string;
};

type PortableExplainedBatchError = {
  readonly code: string;
  readonly message: string;
  readonly context: Record<string, unknown> | undefined;
};

const VALIDATION_SOURCE_ACCOUNTS = {
  anz: '01-0123-0456789-00',
  asb: '12-3200-0456789-00',
  bnz: '02-0001-0000001-00',
  kiwibank: '38-9000-7654321-00',
  tsb: '15-3900-1234567-00',
  westpac: '03-1702-0456789-00'
} as const;

const VALIDATION_ORIGINATOR_NAME = 'NZ BANK BATCH';

function assertPortableConfigSourceAccount(config: PortablePaymentFileConfig) {
  switch (config.bank) {
    case 'anz':
      assertNzBankAccount(config.sourceAccount, ['01', '06'] as const);
      return;
    case 'asb':
      assertNzBankAccount(config.sourceAccount, ['12'] as const);
      return;
    case 'bnz':
      assertNzBankAccount(config.sourceAccount, ['02'] as const);
      return;
    case 'kiwibank':
      assertNzBankAccount(config.sourceAccount, ['38'] as const);
      return;
    case 'tsb':
      assertNzBankAccount(config.sourceAccount, ['15'] as const);
      return;
    case 'westpac':
      assertNzBankAccount(config.sourceAccount, ['03'] as const);
      return;
  }
}

function assertPortableDebitConfigSourceAccount(config: PortableDebitFileConfig) {
  switch (config.bank) {
    case 'anz':
      return;
    case 'asb':
      if (config.contra !== undefined) {
        assertNzBankAccount(config.contra.account, ['12'] as const);
      }

      return;
    case 'bnz':
      assertNzBankAccount(config.sourceAccount, ['02'] as const);
      return;
    case 'kiwibank':
      assertNzBankAccount(config.sourceAccount, ['38'] as const);
      return;
    case 'westpac':
      assertNzBankAccount(config.sourceAccount, ['03'] as const);
      return;
  }
}

function getValidationSuggestion(
  error: PortableExplainedBatchError
): string | undefined {
  switch (error.code) {
    case 'NZ_ACCOUNT_FORMAT':
      return 'Use a standard NZ account such as 01-0123-0456789-00, or validate candidate accounts with parseNzAccount() before generating files.';
    case 'NZ_ACCOUNT_BANK':
      return 'Use an account number that belongs to the selected bank for this file config, or validate it first with parseNzBankAccount().';
    case 'NZ_ACCOUNT_BRANCH':
      return 'Validate candidate accounts with parseNzAccount() before generating files and confirm the bank and branch exist in the bundled NZ bank table.';
    case 'NZ_ACCOUNT_CHECKSUM':
      return 'Check the account digits against the expected NZ checksum rule, or validate the input first with parseNzAccount({ validateChecksum: true }).';
    case 'INVALID_DATE':
      return 'Use Date, YYYY-MM-DD, DD-MM-YYYY, YYYYMMDD, or YYMMDD input so the adapter can normalise the date unambiguously.';
    case 'INVALID_MONEY':
    case 'INVALID_CENTS':
      return 'Pass a decimal amount string like "12.50", a bigint cents value, or pre-validate with parseCents()/assertCents().';
    case 'FIELD_REQUIRED':
      return 'Provide the missing field before rendering, or remove the portable field if this bank does not support it.';
    case 'FIELD_ASCII':
      return 'Use printable ASCII only for bank file fields and strip accented or unsupported punctuation characters.';
    case 'FIELD_COMMA':
      return 'Remove commas from the field value before rendering this bank format.';
    case 'FIELD_LENGTH':
      return 'Shorten the value to the bank-specific maximum length or switch to validation mode first to catch truncation risks earlier.';
    case 'ADAPTER_CONFIG':
      return 'Check the config fields called out in the message, then re-run validatePortablePaymentFileConfig() before rendering.';
    case 'ADAPTER_TRANSACTION':
      return 'Check the transaction fields called out in the message, then re-run validatePortablePaymentTransaction() or validatePortablePaymentBatch().';
    default:
      return undefined;
  }
}

function explainNzBatchError(
  error: PortableExplainedBatchError
): PortableValidationErrorExplanation {
  const suggestion = getValidationSuggestion(error);

  return {
    code: error.code as PortablePaymentFileError['code'],
    message: error.message,
    ...(error.context !== undefined ? { context: error.context } : {}),
    ...(suggestion !== undefined ? { suggestion } : {})
  };
}

function buildIssue(
  severity: 'error' | 'warning',
  code: PortablePaymentValidationIssueCode,
  path: string,
  message: string,
  context?: Record<string, unknown>,
  suggestion?: string
): PortablePaymentValidationIssue {
  return {
    severity,
    code,
    path,
    message,
    ...(context !== undefined ? { context } : {}),
    ...(suggestion !== undefined ? { suggestion } : {})
  };
}

function appendIssue(
  issues: PortablePaymentValidationIssue[],
  issue: PortablePaymentValidationIssue
) {
  const exists = issues.some(
    (candidate) =>
      candidate.severity === issue.severity &&
      candidate.code === issue.code &&
      candidate.path === issue.path &&
      candidate.message === issue.message
  );

  if (!exists) {
    issues.push(issue);
  }
}

function issueFromError(
  error: PortableExplainedBatchError,
  path: string
): PortablePaymentValidationIssue {
  const explanation = explainNzBatchError(error);
  return buildIssue(
    'error',
    explanation.code,
    path,
    explanation.message,
    explanation.context,
    explanation.suggestion
  );
}

function inferConfigErrorPath(error: PortableExplainedBatchError): string {
  switch (error.code) {
    case 'NZ_ACCOUNT_FORMAT':
    case 'NZ_ACCOUNT_BANK':
    case 'NZ_ACCOUNT_BRANCH':
    case 'NZ_ACCOUNT_CHECKSUM':
      return 'config.sourceAccount';
    case 'INVALID_DATE':
      return 'config.paymentDate';
    case 'FIELD_REQUIRED':
    case 'FIELD_ASCII':
    case 'FIELD_COMMA':
    case 'FIELD_LENGTH': {
      const field = error.context?.field;

      if (
        field === 'fileReference' ||
        field === 'userReference' ||
        field === 'batchReference'
      ) {
        return 'config.batchReference';
      }

      if (
        field === 'customerName' ||
        field === 'clientShortName' ||
        field === 'originatorName'
      ) {
        return 'config.originatorName';
      }

      return 'config';
    }
    default:
      return 'config';
  }
}

function inferTransactionErrorPath(
  error: PortableExplainedBatchError,
  basePath: string
): string {
  switch (error.code) {
    case 'NZ_ACCOUNT_FORMAT':
    case 'NZ_ACCOUNT_BANK':
    case 'NZ_ACCOUNT_BRANCH':
    case 'NZ_ACCOUNT_CHECKSUM':
      return `${basePath}.toAccount`;
    case 'INVALID_MONEY':
    case 'INVALID_CENTS':
      return `${basePath}.amount`;
    default:
      return basePath;
  }
}

function createPortablePaymentValidationConfig(
  bank: PortablePaymentBank
): PortablePaymentFileConfig {
  switch (bank) {
    case 'anz':
      return {
        bank,
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS[bank],
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23',
        batchCreationDate: '2026-03-23'
      };
    case 'asb':
      return {
        bank: 'asb',
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS.asb,
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23'
      };
    case 'bnz':
      return {
        bank: 'bnz',
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS.bnz,
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23'
      };
    case 'kiwibank':
      return {
        bank: 'kiwibank',
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS.kiwibank,
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23'
      };
    case 'tsb':
      return {
        bank: 'tsb',
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS.tsb,
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23'
      };
    case 'westpac':
      return {
        bank: 'westpac',
        sourceAccount: VALIDATION_SOURCE_ACCOUNTS.westpac,
        originatorName: VALIDATION_ORIGINATOR_NAME,
        paymentDate: '2026-03-23'
      };
  }
}

function collectPaymentCompatibilityWarnings(
  bank: PortablePaymentBank,
  transaction: PortablePaymentTransaction,
  basePath: string
): PortablePaymentValidationIssue[] {
  const warnings: PortablePaymentValidationIssue[] = [];

  const warnIgnored = (
    fieldPath: string,
    message: string,
    context?: Record<string, unknown>
  ) => {
    appendIssue(
      warnings,
      buildIssue(
        'warning',
        'PORTABLE_FIELD_IGNORED',
        fieldPath,
        message,
        context,
        'Remove the field for this bank or switch to a bank-specific adapter if you need the bank-native capability.'
      )
    );
  };

  const warnApprox = (
    fieldPath: string,
    message: string,
    context?: Record<string, unknown>
  ) => {
    appendIssue(
      warnings,
      buildIssue(
        'warning',
        'PORTABLE_FIELD_APPROXIMATED',
        fieldPath,
        message,
        context,
        'Check the bank-specific mapping before relying on this portable field during a bank switch.'
      )
    );
  };

  if (
    transaction.category === 'salary-and-wages' &&
    bank !== 'anz' &&
    bank !== 'asb' &&
    bank !== 'westpac'
  ) {
    warnIgnored(
      `${basePath}.category`,
      `Portable category "salary-and-wages" is currently ignored for ${bank} payment output.`,
      { bank, category: transaction.category }
    );
  }

  if (transaction.internalReference !== undefined && bank !== 'asb') {
    warnIgnored(
      `${basePath}.internalReference`,
      `internalReference is only used by ASB portable payment output and is ignored for ${bank}.`,
      { bank }
    );
  }

  switch (bank) {
    case 'anz':
      if (transaction.payer?.code !== undefined) {
        warnIgnored(
          `${basePath}.payer.code`,
          'payer.code is ignored by ANZ portable payment output.',
          { bank }
        );
      }

      break;

    case 'bnz':
    case 'kiwibank':
    case 'tsb':
      if (transaction.payer?.name !== undefined) {
        warnIgnored(
          `${basePath}.payer.name`,
          `payer.name is ignored by ${bank} portable payment output.`,
          { bank }
        );
      }

      if (transaction.payer?.particulars !== undefined) {
        warnIgnored(
          `${basePath}.payer.particulars`,
          `payer.particulars is ignored by ${bank} portable payment output.`,
          { bank }
        );
      }

      if (transaction.payer?.code !== undefined) {
        warnIgnored(
          `${basePath}.payer.code`,
          `payer.code is ignored by ${bank} portable payment output.`,
          { bank }
        );
      }

      if (transaction.payer?.reference !== undefined) {
        warnIgnored(
          `${basePath}.payer.reference`,
          `payer.reference is ignored by ${bank} portable payment output.`,
          { bank }
        );
      }

      if (transaction.payer?.analysis !== undefined) {
        warnIgnored(
          `${basePath}.payer.analysis`,
          `payer.analysis is ignored by ${bank} portable payment output.`,
          { bank }
        );
      }

      if (bank === 'tsb' && transaction.payee.analysis !== undefined) {
        warnIgnored(
          `${basePath}.payee.analysis`,
          'payee.analysis is ignored by TSB portable payment output.',
          { bank }
        );
      }

      break;

    case 'westpac':
      if (transaction.payee.reference !== undefined) {
        warnIgnored(
          `${basePath}.payee.reference`,
          'payee.reference is ignored by Westpac portable payment output.',
          { bank }
        );
      }

      if (
        transaction.payee.code !== undefined &&
        transaction.payee.analysis !== undefined
      ) {
        warnIgnored(
          `${basePath}.payee.code`,
          'payee.code is ignored when payee.analysis is also provided for Westpac portable payment output.',
          { bank }
        );
      }

      if (
        transaction.payee.code !== undefined &&
        transaction.payee.analysis === undefined
      ) {
        warnApprox(
          `${basePath}.payee.code`,
          'payee.code is reused as Westpac payeeAnalysis when payee.analysis is omitted.',
          { bank }
        );
      }

      if (transaction.payer?.name !== undefined) {
        warnIgnored(
          `${basePath}.payer.name`,
          'payer.name is ignored by Westpac portable payment output.',
          { bank }
        );
      }

      if (transaction.payer?.particulars !== undefined) {
        warnIgnored(
          `${basePath}.payer.particulars`,
          'payer.particulars is ignored by Westpac portable payment output.',
          { bank }
        );
      }

      if (transaction.payer?.code !== undefined) {
        warnIgnored(
          `${basePath}.payer.code`,
          'payer.code is ignored by Westpac portable payment output.',
          { bank }
        );
      }

      if (transaction.payer?.analysis !== undefined) {
        warnIgnored(
          `${basePath}.payer.analysis`,
          'payer.analysis is ignored by Westpac portable payment output.',
          { bank }
        );
      }

      break;

    case 'asb':
      if (
        transaction.payee.analysis !== undefined &&
        transaction.payee.code === undefined
      ) {
        warnApprox(
          `${basePath}.payee.analysis`,
          'payee.analysis is used as an ASB code fallback when payee.code is omitted.',
          { bank }
        );
      }

      if (
        transaction.payer?.analysis !== undefined &&
        transaction.payer.code === undefined
      ) {
        warnApprox(
          `${basePath}.payer.analysis`,
          'payer.analysis is used as an ASB code fallback when payer.code is omitted.',
          { bank }
        );
      }

      break;
  }

  return warnings;
}

function toValidationResult(
  errors: readonly PortablePaymentValidationIssue[],
  warnings: readonly PortablePaymentValidationIssue[]
): PortablePaymentValidationResult {
  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Convert an existing thrown or returned validation error into a structured explanation with a
 * practical suggestion.
 */
export function explainValidationError(
  error: PortablePaymentFileError | PortablePaymentSourceError
): PortableValidationErrorExplanation {
  return explainNzBatchError(error);
}

/**
 * Validate portable payment file config before building a file.
 *
 * This is useful for form workflows and import pipelines that want to surface config issues without
 * creating a file object first.
 */
export function validatePortablePaymentFileConfig(
  config: PortablePaymentFileConfig
): PortablePaymentValidationResult {
  const errors: PortablePaymentValidationIssue[] = [];

  try {
    createUnderlyingPaymentFile(config);
  } catch (caught) {
    if (caught instanceof NzBatchError) {
      appendIssue(errors, issueFromError(caught, inferConfigErrorPath(caught)));
    } else {
      throw caught;
    }
  }

  return toValidationResult(errors, []);
}

/**
 * Validate a single portable payment transaction for a target bank.
 *
 * The transaction is checked against the same adapter rules used during file rendering, with added
 * warnings for ignored or approximate portable fields.
 */
export function validatePortablePaymentTransaction(
  transaction: PortablePaymentTransaction,
  options: PortablePaymentTransactionValidationOptions
): PortablePaymentValidationResult {
  const errors: PortablePaymentValidationIssue[] = [];
  const warnings = collectPaymentCompatibilityWarnings(
    options.bank,
    transaction,
    'transaction'
  );

  const accountResult = parseNzAccount(transaction.toAccount);

  if (!accountResult.ok) {
    appendIssue(
      errors,
      issueFromError(accountResult.error, 'transaction.toAccount')
    );
  }

  const amountResult = parseCents(transaction.amount);

  if (!amountResult.ok) {
    appendIssue(
      errors,
      issueFromError(amountResult.error, 'transaction.amount')
    );
  }

  try {
    const file = createPortablePaymentFile(
      createPortablePaymentValidationConfig(options.bank)
    );
    const result = file.addTransaction(transaction);

    if (!result.ok) {
      appendIssue(
        errors,
        issueFromError(
          result.error,
          inferTransactionErrorPath(result.error, 'transaction')
        )
      );
    }
  } catch (caught) {
    if (caught instanceof NzBatchError) {
      appendIssue(
        errors,
        issueFromError(caught, inferTransactionErrorPath(caught, 'transaction'))
      );
    } else {
      throw caught;
    }
  }

  return toValidationResult(errors, warnings);
}

/**
 * Validate a complete portable payment batch and collect all discovered issues at once.
 *
 * Errors block safe rendering. Warnings describe ignored or approximate portable fields that may be
 * surprising during a bank switch.
 */
export function validatePortablePaymentBatch(
  input: PortablePaymentBatchValidationInput
): PortablePaymentValidationResult {
  const errors: PortablePaymentValidationIssue[] = [];
  const warnings: PortablePaymentValidationIssue[] = [];
  const configResult = validatePortablePaymentFileConfig(input.config);

  for (const issue of configResult.errors) {
    appendIssue(errors, issue);
  }

  let file: PortablePaymentFile | null = null;

  if (configResult.ok) {
    file = createPortablePaymentFile(input.config);
  }

  input.transactions.forEach((transaction, index) => {
    const basePath = `transactions[${String(index)}]`;

    for (const warning of collectPaymentCompatibilityWarnings(
      input.config.bank,
      transaction,
      basePath
    )) {
      appendIssue(warnings, warning);
    }

    if (file !== null) {
      const result = file.addTransaction(transaction);

      if (!result.ok) {
        appendIssue(
          errors,
          issueFromError(
            result.error,
            inferTransactionErrorPath(result.error, basePath)
          )
        );
      }

      return;
    }

    const transactionResult = validatePortablePaymentTransaction(transaction, {
      bank: input.config.bank
    });

    for (const error of transactionResult.errors) {
      appendIssue(
        errors,
        buildIssue(
          error.severity,
          error.code,
          error.path.replace(/^transaction/, basePath),
          error.message,
          error.context,
          error.suggestion
        )
      );
    }

    for (const warning of transactionResult.warnings) {
      appendIssue(
        warnings,
        buildIssue(
          warning.severity,
          warning.code,
          warning.path.replace(/^transaction/, basePath),
          warning.message,
          warning.context,
          warning.suggestion
        )
      );
    }
  });

  return toValidationResult(errors, warnings);
}
