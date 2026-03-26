import { err, ok, type Result } from './result.js';

export type ParsedFileDifferenceKind =
  | 'value-mismatch'
  | 'type-mismatch'
  | 'missing-in-actual'
  | 'missing-in-expected';

export type ParsedFileDifference = {
  readonly path: string;
  readonly kind: ParsedFileDifferenceKind;
  readonly expected: unknown;
  readonly actual: unknown;
};

export type ParsedFileComparison = {
  readonly equal: boolean;
  readonly differences: readonly ParsedFileDifference[];
};

export type ParsedFileInputParser<TParsed, TError> = (
  input: string | Buffer
) => Result<TParsed, TError>;

export type ParsedFileFixtureParseError<TError> = {
  readonly side: 'expected' | 'actual';
  readonly error: TError;
};

export type ParsedFileFixtureComparison<TParsed> = {
  readonly expectedParsed: TParsed;
  readonly actualParsed: TParsed;
  readonly comparison: ParsedFileComparison;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normaliseForJson(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normaliseForJson(item));
  }

  if (isPlainObject(value)) {
    const normalised: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      normalised[key] = normaliseForJson(entry);
    }

    return normalised;
  }

  return value;
}

function stringifyValue(value: unknown): string {
  return JSON.stringify(normaliseForJson(value));
}

function compareValues(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: ParsedFileDifference[]
): void {
  if (Object.is(expected, actual)) {
    return;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLength = Math.max(expected.length, actual.length);

    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = `${path}[${String(index)}]`;

      if (index >= expected.length) {
        differences.push({
          path: nextPath,
          kind: 'missing-in-expected',
          expected: undefined,
          actual: actual[index]
        });
        continue;
      }

      if (index >= actual.length) {
        differences.push({
          path: nextPath,
          kind: 'missing-in-actual',
          expected: expected[index],
          actual: undefined
        });
        continue;
      }

      compareValues(expected[index], actual[index], nextPath, differences);
    }

    return;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

    for (const key of keys) {
      const nextPath = path.length === 0 ? key : `${path}.${key}`;

      if (!(key in actual)) {
        differences.push({
          path: nextPath,
          kind: 'missing-in-actual',
          expected: expected[key],
          actual: undefined
        });
        continue;
      }

      if (!(key in expected)) {
        differences.push({
          path: nextPath,
          kind: 'missing-in-expected',
          expected: undefined,
          actual: actual[key]
        });
        continue;
      }

      compareValues(expected[key], actual[key], nextPath, differences);
    }

    return;
  }

  if (typeof expected !== typeof actual) {
    differences.push({
      path,
      kind: 'type-mismatch',
      expected,
      actual
    });
    return;
  }

  differences.push({
    path,
    kind: 'value-mismatch',
    expected,
    actual
  });
}

export function compareParsedFiles(
  expected: unknown,
  actual: unknown
): ParsedFileComparison {
  const differences: ParsedFileDifference[] = [];

  compareValues(expected, actual, '', differences);

  return {
    equal: differences.length === 0,
    differences
  };
}

export function compareParsedFileFixtures<TParsed, TError>(
  expectedInput: string | Buffer,
  actualInput: string | Buffer,
  parseFile: ParsedFileInputParser<TParsed, TError>
): Result<
  ParsedFileFixtureComparison<TParsed>,
  ParsedFileFixtureParseError<TError>
> {
  const expectedParsed = parseFile(expectedInput);

  if (!expectedParsed.ok) {
    return err({
      side: 'expected',
      error: expectedParsed.error
    });
  }

  const actualParsed = parseFile(actualInput);

  if (!actualParsed.ok) {
    return err({
      side: 'actual',
      error: actualParsed.error
    });
  }

  return ok({
    expectedParsed: expectedParsed.value,
    actualParsed: actualParsed.value,
    comparison: compareParsedFiles(expectedParsed.value, actualParsed.value)
  });
}

export function formatParsedFileComparison(
  comparison: ParsedFileComparison
): string {
  if (comparison.equal) {
    return 'No differences.';
  }

  return comparison.differences
    .map(
      (difference) =>
        `${difference.path || '(root)'} [${difference.kind}] expected=${stringifyValue(difference.expected)} actual=${stringifyValue(difference.actual)}`
    )
    .join('\n');
}
