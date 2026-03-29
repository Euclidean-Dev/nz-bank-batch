import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeBatchFile } from '../src/node.js';
import { writeBatchFile as writeBatchFileBrowser } from '../src/node-browser.js';
import { createPortablePaymentFile } from '../src/portable.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dirPath) =>
      rm(dirPath, { recursive: true, force: true })
    )
  );
});

describe('Node helper entrypoint', () => {
  it('writes rendered batch output to disk', async () => {
    const dirPath = await mkdtemp(join(tmpdir(), 'nz-bank-batch-'));
    tempDirs.push(dirPath);

    const filePath = join(dirPath, 'payments.csv');
    const file = createPortablePaymentFile({
      bank: 'westpac',
      sourceAccount: '03-1702-0456789-00',
      originatorName: 'ACME PAYROLL LTD',
      batchReference: 'MARCH2026',
      paymentDate: '2026-03-23'
    });

    expect(
      file.addTransaction({
        toAccount: '12-3200-0123456-00',
        amount: '12.50',
        payee: {
          name: 'Jane Smith',
          particulars: 'SALARY',
          analysis: 'MARCH26'
        },
        payer: {
          reference: 'PAY001'
        }
      }).ok
    ).toBe(true);

    await writeBatchFile(filePath, file, {
      render: {
        lineEnding: '\n'
      }
    });

    await expect(readFile(filePath, 'utf8')).resolves.toBe(
      file.toString({ lineEnding: '\n' })
    );
  });

  it('throws a clear error from the browser stub', async () => {
    const file = createPortablePaymentFile({
      bank: 'asb',
      sourceAccount: '12-3200-0456789-00',
      originatorName: 'ACME PAYROLL',
      paymentDate: '2026-03-23'
    });

    await expect(writeBatchFileBrowser('payments.txt', file)).rejects.toThrow(
      /only available in Node\.js runtimes/i
    );
  });
});