import type { Result } from './result.js';
import type { RenderFileOptions } from './records.js';
import type { Cents } from '../nz/types.js';

export type BatchFileSummary = {
  readonly count: number;
  readonly totalCents: Cents;
  readonly hashTotal: bigint;
};

export type BatchFile<TTransaction, TError> = {
  readonly addTransaction: (transaction: TTransaction) => Result<void, TError>;
  readonly toBuffer: (options?: RenderFileOptions) => Buffer;
  readonly toString: (options?: RenderFileOptions) => string;
  readonly summary: () => BatchFileSummary;
};
