import { DateError } from '../shared/errors.js';
import { err, ok, type Result } from '../shared/result.js';
import type { DateInput, YyMmDd, YyyyMmDd } from './types.js';

const YYMMDD_PATTERN = /^(\d{2})(\d{2})(\d{2})$/;
const YYYYMMDD_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const DDMMYYYY_PATTERN = /^(\d{2})(\d{2})(\d{4})$/;
const YYYY_MM_DD_PATTERN = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const DD_MM_YYYY_PATTERN = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

type ParsedDateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

type ParseDateInputOptions = {
  readonly compactSixOrder?: 'yymmdd' | 'ddmmyy';
  readonly compactEightOrder?: 'yyyymmdd' | 'ddmmyyyy';
};

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function invalidFormat(input: DateInput): DateError {
  return new DateError(
    'INVALID_DATE',
    'Date must be a valid date in a supported format such as YYYY-MM-DD, DD-MM-YYYY, YYYYMMDD, YYMMDD, or a Date object.',
    { input }
  );
}

function invalidCalendarDay(input: DateInput): DateError {
  return new DateError('INVALID_DATE', 'Date is not a valid calendar day.', { input });
}

function buildDateParts(
  input: DateInput,
  year: number,
  month: number,
  day: number
): Result<ParsedDateParts, DateError> {
  if (!isValidDate(year, month, day)) {
    return err(invalidCalendarDay(input));
  }

  return ok({ year, month, day });
}

function parseCompactSix(
  input: string,
  originalInput: DateInput,
  order: 'yymmdd' | 'ddmmyy'
): Result<ParsedDateParts, DateError> {
  const match = YYMMDD_PATTERN.exec(input);

  if (!match) {
    return err(invalidFormat(originalInput));
  }

  const [, first, second, third] = match;

  if (order === 'yymmdd') {
    return buildDateParts(originalInput, 2000 + Number(first), Number(second), Number(third));
  }

  return buildDateParts(originalInput, 2000 + Number(third), Number(second), Number(first));
}

function parseCompactEight(
  input: string,
  originalInput: DateInput,
  order: 'yyyymmdd' | 'ddmmyyyy'
): Result<ParsedDateParts, DateError> {
  const match = (order === 'yyyymmdd' ? YYYYMMDD_PATTERN : DDMMYYYY_PATTERN).exec(input);

  if (!match) {
    return err(invalidFormat(originalInput));
  }

  const [, first, second, third] = match;

  if (order === 'yyyymmdd') {
    return buildDateParts(originalInput, Number(first), Number(second), Number(third));
  }

  return buildDateParts(originalInput, Number(third), Number(second), Number(first));
}

function parseStringDateInput(
  input: string,
  originalInput: DateInput,
  options: ParseDateInputOptions = {}
): Result<ParsedDateParts, DateError> {
  const compactSixOrder = options.compactSixOrder ?? 'yymmdd';
  const compactEightOrder = options.compactEightOrder ?? 'yyyymmdd';

  if (/^\d{6}$/.test(input)) {
    return parseCompactSix(input, originalInput, compactSixOrder);
  }

  if (/^\d{8}$/.test(input)) {
    const preferred = parseCompactEight(input, originalInput, compactEightOrder);

    if (preferred.ok) {
      return preferred;
    }

    const fallbackOrder = compactEightOrder === 'yyyymmdd' ? 'ddmmyyyy' : 'yyyymmdd';
    return parseCompactEight(input, originalInput, fallbackOrder);
  }

  const yearFirstLong = YYYY_MM_DD_PATTERN.exec(input);

  if (yearFirstLong) {
    const [, yearRaw, monthRaw, dayRaw] = yearFirstLong;
    return buildDateParts(originalInput, Number(yearRaw), Number(monthRaw), Number(dayRaw));
  }

  const dayFirstLong = DD_MM_YYYY_PATTERN.exec(input);

  if (dayFirstLong) {
    const [, dayRaw, monthRaw, yearRaw] = dayFirstLong;
    return buildDateParts(originalInput, Number(yearRaw), Number(monthRaw), Number(dayRaw));
  }

  return err(invalidFormat(originalInput));
}

function parseDateInput(
  input: DateInput,
  options: ParseDateInputOptions = {}
): Result<ParsedDateParts, DateError> {
  if (input instanceof Date) {
    const time = input.getTime();

    if (Number.isNaN(time)) {
      return err(invalidFormat(input));
    }

    return buildDateParts(input, input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }

  return parseStringDateInput(input.trim(), input, options);
}

function formatParts(parts: ParsedDateParts) {
  const year = String(parts.year);
  const shortYear = year.slice(-2);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');

  return {
    yyMmDd: `${shortYear}${month}${day}` as YyMmDd,
    yyyyMmDd: `${year.padStart(4, '0')}${month}${day}` as YyyyMmDd,
    ddMmYy: `${day}${month}${shortYear}`
  };
}

export function parseYyMmDd(input: DateInput): Result<YyMmDd, DateError> {
  const result = parseDateInput(input, { compactSixOrder: 'yymmdd', compactEightOrder: 'yyyymmdd' });

  if (!result.ok) {
    return result;
  }

  return ok(formatParts(result.value).yyMmDd);
}

export function assertYyMmDd(input: DateInput): YyMmDd {
  const result = parseYyMmDd(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function parseYyyyMmDd(input: DateInput): Result<YyyyMmDd, DateError> {
  const result = parseDateInput(input, { compactSixOrder: 'yymmdd', compactEightOrder: 'yyyymmdd' });

  if (!result.ok) {
    return result;
  }

  return ok(formatParts(result.value).yyyyMmDd);
}

export function assertYyyyMmDd(input: DateInput): YyyyMmDd {
  const result = parseYyyyMmDd(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function parseDdMmYy(input: DateInput): Result<string, DateError> {
  const result = parseDateInput(input, { compactSixOrder: 'ddmmyy', compactEightOrder: 'ddmmyyyy' });

  if (!result.ok) {
    return result;
  }

  return ok(formatParts(result.value).ddMmYy);
}

export function assertDdMmYy(input: DateInput): string {
  const result = parseDdMmYy(input);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}
