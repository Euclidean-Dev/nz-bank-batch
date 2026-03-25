import { DateError } from '../shared/errors.js';
import { err, ok, type Result } from '../shared/result.js';
import type { YyMmDd, YyyyMmDd } from './types.js';

const YYMMDD_PATTERN = /^(\d{2})(\d{2})(\d{2})$/;
const YYYYMMDD_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseYyMmDd(input: string): Result<YyMmDd, DateError> {
  const trimmed = input.trim();
  const match = YYMMDD_PATTERN.exec(trimmed);

  if (!match) {
    return err(
      new DateError('INVALID_DATE', 'Date must be in YYMMDD format.', { input })
    );
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw) + 2000;
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!isValidDate(year, month, day)) {
    return err(
      new DateError('INVALID_DATE', 'Date is not a valid calendar day.', { input })
    );
  }

  return ok(trimmed as YyMmDd);
}

export function assertYyMmDd(input: string): YyMmDd {
  const result = parseYyMmDd(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function parseYyyyMmDd(input: string): Result<YyyyMmDd, DateError> {
  const trimmed = input.trim();
  const match = YYYYMMDD_PATTERN.exec(trimmed);

  if (!match) {
    return err(
      new DateError('INVALID_DATE', 'Date must be in YYYYMMDD format.', { input })
    );
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!isValidDate(year, month, day)) {
    return err(
      new DateError('INVALID_DATE', 'Date is not a valid calendar day.', { input })
    );
  }

  return ok(trimmed as YyyyMmDd);
}

export function assertYyyyMmDd(input: string): YyyyMmDd {
  const result = parseYyyyMmDd(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}
