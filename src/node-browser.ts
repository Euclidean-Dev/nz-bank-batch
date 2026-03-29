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

function unsupportedError(): Error {
  return new Error(
    'nz-bank-batch/node is only available in Node.js runtimes. Use file.toString() or file.toBuffer() in browser code.'
  );
}

export const writeBatchFile: WriteBatchFile = () =>
  Promise.reject(unsupportedError());