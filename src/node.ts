import { writeFile } from 'node:fs/promises';

import type { BatchFile } from './shared/batch-file.js';
import type { RenderFileOptions } from './shared/records.js';

export type WriteBatchFileOptions = {
  readonly render?: RenderFileOptions;
  readonly flag?: string;
  readonly flush?: boolean;
  readonly mode?: number;
  readonly signal?: AbortSignal;
};

export type WriteBatchFile = <TTransaction, TError>(
  path: string | URL,
  file: BatchFile<TTransaction, TError>,
  options?: WriteBatchFileOptions
) => Promise<void>;

export const writeBatchFile: WriteBatchFile = async (path, file, options) => {
  await writeFile(path, file.toBuffer(options?.render), {
    ...(options?.flag !== undefined ? { flag: options.flag } : {}),
    ...(options?.flush !== undefined ? { flush: options.flush } : {}),
    ...(options?.mode !== undefined ? { mode: options.mode } : {}),
    ...(options?.signal !== undefined ? { signal: options.signal } : {})
  });
};