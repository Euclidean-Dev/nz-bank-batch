import type { BatchFile } from './shared/batch-file.js';
import type {
  AdapterError,
  DateError,
  FieldError,
  MoneyError,
  NzAccountError
} from './shared/errors.js';
import type { RenderFileOptions } from './shared/records.js';
import type { Cents, DateInput } from './nz/types.js';
import {
  createDomesticExtendedFile,
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
  createPaymentCsvFile,
  createPaymentFixedLengthFile,
  type WestpacPaymentFile,
  type WestpacPaymentFileError,
  type WestpacPaymentTransaction
} from './banks/westpac/index.js';

export type PortablePaymentBank = 'anz' | 'asb' | 'bnz' | 'kiwibank' | 'westpac';
export type PortableDebitBank = 'asb' | 'bnz' | 'kiwibank';
export type PortablePaymentRenderFormat = 'csv' | 'fixed-length';
export type PortablePaymentCategory = 'standard' | 'salary-and-wages';

export type PortablePaymentParty = {
  readonly name: string;
  readonly particulars?: string;
  readonly code?: string;
  readonly reference?: string;
  readonly analysis?: string;
};

export type PortablePaymentPayer = {
  readonly name?: string;
  readonly particulars?: string;
  readonly code?: string;
  readonly reference?: string;
  readonly analysis?: string;
};

export type PortableDebitPayer = PortablePaymentParty;
export type PortableDebitCollector = PortablePaymentPayer;

export type PortableDebitContra = {
  readonly account: string;
  readonly name?: string;
  readonly particulars?: string;
  readonly code?: string;
  readonly reference?: string;
};

export type PortablePaymentFileConfig = {
  readonly bank: PortablePaymentBank;
  readonly sourceAccount: string;
  readonly originatorName: string;
  readonly paymentDate?: DateInput;
  readonly batchReference?: string;
  readonly batchCreationDate?: DateInput;
  readonly renderFormat?: PortablePaymentRenderFormat;
};

export type PortableDebitFileConfig =
  | {
      readonly bank: 'asb';
      readonly collectorName: string;
      readonly collectionDate?: DateInput;
      readonly registrationId: string;
      readonly contra?: PortableDebitContra;
    }
  | {
      readonly bank: 'bnz' | 'kiwibank';
      readonly sourceAccount: string;
      readonly collectorName: string;
      readonly collectionDate?: DateInput;
      readonly batchReference?: string;
    };

export type PortablePaymentTransaction = {
  readonly toAccount: string;
  readonly amount: string | bigint | Cents;
  readonly category?: PortablePaymentCategory;
  readonly payee: PortablePaymentParty;
  readonly payer?: PortablePaymentPayer;
  readonly internalReference?: string;
};

export type PortableDebitTransaction = {
  readonly fromAccount: string;
  readonly amount: string | bigint | Cents;
  readonly payer: PortableDebitPayer;
  readonly collector?: PortableDebitCollector;
};

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
  readonly renderFormat?: PortablePaymentRenderFormat;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
};

export type PortableDebitFileError = PortablePaymentFileError;

export type PortableDebitFile = BatchFile<PortableDebitTransaction, PortableDebitFileError> & {
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
  | WestpacPaymentFile;

type UnderlyingPortableDebitFile =
  | AsbFile<AsbDirectDebitTransaction>
  | BnzFile
  | KiwibankFile;

function toAsbParty(party: PortablePaymentParty): AsbPartyDetails {
  return {
    name: party.name,
    code: party.code ?? party.analysis ?? '',
    ...(party.reference !== undefined ? { alphaReference: party.reference } : {}),
    ...(party.particulars !== undefined ? { particulars: party.particulars } : {})
  };
}

function toAsbOtherParty(
  party: PortablePaymentPayer | undefined,
  defaultName: string
): AsbOtherPartyDetails {
  return {
    ...(party?.name !== undefined || defaultName.length > 0 ? { name: party?.name ?? defaultName } : {}),
    ...(party?.code !== undefined || party?.analysis !== undefined
      ? { code: party.code ?? party.analysis }
      : {}),
    ...(party?.reference !== undefined ? { alphaReference: party.reference } : {}),
    ...(party?.particulars !== undefined ? { particulars: party.particulars } : {})
  };
}

function createUnderlyingPaymentFile(
  config: PortablePaymentFileConfig
): UnderlyingPortablePaymentFile {
  switch (config.bank) {
    case 'anz':
      return createDomesticExtendedFile({
        batchDueDate: config.paymentDate ?? new Date(),
        batchCreationDate: config.batchCreationDate ?? config.paymentDate ?? new Date()
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
        ...(config.batchReference !== undefined ? { userReference: config.batchReference } : {}),
        ...(config.paymentDate !== undefined ? { processDate: config.paymentDate } : {})
      });

    case 'kiwibank':
      return createKiwibankDirectCreditFile({
        fromAccount: config.sourceAccount,
        originatorName: config.originatorName,
        ...(config.batchReference !== undefined ? { batchReference: config.batchReference } : {}),
        ...(config.paymentDate !== undefined ? { processDate: config.paymentDate } : {})
      });

    case 'westpac':
      return (config.renderFormat ?? 'csv') === 'fixed-length'
        ? createPaymentFixedLengthFile({
            fromAccount: config.sourceAccount,
            customerName: config.originatorName,
            ...(config.batchReference !== undefined ? { fileReference: config.batchReference } : {}),
            ...(config.paymentDate !== undefined ? { scheduledDate: config.paymentDate } : {})
          })
        : createPaymentCsvFile({
            fromAccount: config.sourceAccount,
            customerName: config.originatorName,
            ...(config.batchReference !== undefined ? { fileReference: config.batchReference } : {}),
            ...(config.paymentDate !== undefined ? { scheduledDate: config.paymentDate } : {})
          });
  }
}

function createUnderlyingDebitFile(config: PortableDebitFileConfig): UnderlyingPortableDebitFile {
  switch (config.bank) {
    case 'asb':
      return createAsbDirectDebitFile({
        registrationId: config.registrationId,
        dueDate: config.collectionDate ?? new Date(),
        clientShortName: config.collectorName,
        ...(config.contra !== undefined
          ? {
              contra: {
                account: config.contra.account,
                ...(config.contra.code !== undefined ? { code: config.contra.code } : {}),
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
        originatorName: config.collectorName,
        ...(config.batchReference !== undefined ? { userReference: config.batchReference } : {}),
        ...(config.collectionDate !== undefined ? { processDate: config.collectionDate } : {})
      });

    case 'kiwibank':
      return createKiwibankDirectDebitFile({
        fromAccount: config.sourceAccount,
        originatorName: config.collectorName,
        ...(config.batchReference !== undefined ? { batchReference: config.batchReference } : {}),
        ...(config.collectionDate !== undefined ? { processDate: config.collectionDate } : {})
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
        ...(transaction.category === 'salary-and-wages' ? { transactionCode: '52' } : {}),
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
        ...(transaction.category === 'salary-and-wages' ? { transactionCode: '052' } : {}),
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
        ...(transaction.payee.code !== undefined ? { code: transaction.payee.code } : {}),
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
        ...(transaction.payee.code !== undefined ? { code: transaction.payee.code } : {}),
        ...(transaction.payee.reference !== undefined
          ? { reference: transaction.payee.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined
          ? { information: transaction.payee.analysis }
          : {})
      } satisfies KiwibankTransaction;

      return kiwibankFile.addTransaction(kiwibankTransaction);
    }

    case 'westpac': {
      const westpacFile = file as WestpacPaymentFile;
      const westpacTransaction = {
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        accountName: transaction.payee.name,
        ...(transaction.payer?.reference !== undefined
          ? { payerReference: transaction.payer.reference }
          : {}),
        ...(transaction.payee.analysis !== undefined || transaction.payee.code !== undefined
          ? { payeeAnalysis: transaction.payee.analysis ?? transaction.payee.code }
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
  switch (config.bank) {
    case 'asb': {
      const asbFile = file as AsbFile<AsbDirectDebitTransaction>;
      const asbTransaction = {
        toAccount: transaction.fromAccount,
        amount: transaction.amount,
        thisParty: toAsbParty(transaction.payer),
        otherParty: toAsbOtherParty(transaction.collector, '')
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
          : transaction.collector?.particulars !== undefined
            ? { particulars: transaction.collector.particulars }
            : {}),
        ...(transaction.collector?.code !== undefined
          ? { code: transaction.collector.code }
          : transaction.collector?.analysis !== undefined
            ? { code: transaction.collector.analysis }
            : {}),
        ...(transaction.payer.reference !== undefined
          ? { reference: transaction.payer.reference }
          : transaction.collector?.reference !== undefined
            ? { reference: transaction.collector.reference }
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
          : transaction.collector?.particulars !== undefined
            ? { particulars: transaction.collector.particulars }
            : {}),
        ...(transaction.collector?.code !== undefined
          ? { code: transaction.collector.code }
          : transaction.collector?.analysis !== undefined
            ? { code: transaction.collector.analysis }
            : {}),
        ...(transaction.payer.reference !== undefined
          ? { reference: transaction.payer.reference }
          : transaction.collector?.reference !== undefined
            ? { reference: transaction.collector.reference }
            : {}),
        ...(transaction.payer.analysis !== undefined
          ? { information: transaction.payer.analysis }
          : {})
      } satisfies KiwibankTransaction;

      return kiwibankFile.addTransaction(kiwibankTransaction);
    }
  }
}

export function createPortablePaymentFile(config: PortablePaymentFileConfig): PortablePaymentFile {
  const underlying = createUnderlyingPaymentFile(config);

  return {
    kind: 'portable-payment',
    bank: config.bank,
    ...(config.bank === 'westpac' ? { renderFormat: config.renderFormat ?? 'csv' } : {}),
    addTransaction(transaction) {
      return addPortablePaymentTransaction(config, underlying, transaction) as ReturnType<
        PortablePaymentFile['addTransaction']
      >;
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

export function createPortableDebitFile(config: PortableDebitFileConfig): PortableDebitFile {
  const underlying = createUnderlyingDebitFile(config);

  return {
    kind: 'portable-debit',
    bank: config.bank,
    addTransaction(transaction) {
      return addPortableDebitTransaction(config, underlying, transaction) as ReturnType<
        PortableDebitFile['addTransaction']
      >;
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
  | WestpacPaymentFileError;

export type PortableDebitSourceError = AsbFileError | BnzFileError | KiwibankFileError;