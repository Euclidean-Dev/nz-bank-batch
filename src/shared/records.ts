import { prepareCsvField, type CsvFieldInput } from './ascii.js';
import { FieldError } from './errors.js';
import { ok, type Result } from './result.js';

export type LineEnding = '\r\n' | '\n';

export type RenderFileOptions = {
  readonly lineEnding?: LineEnding;
  readonly terminalLineEnding?: boolean;
  readonly appendBlankLine?: boolean;
};

export function renderCsvRecord(
  fields: readonly CsvFieldInput[]
): Result<string, FieldError> {
  const output: string[] = [];

  for (const field of fields) {
    const prepared = prepareCsvField(field);

    if (!prepared.ok) {
      return prepared;
    }

    output.push(prepared.value);
  }

  return ok(output.join(','));
}

export function renderCsvFile(
  records: readonly string[],
  options: RenderFileOptions = {}
): string {
  const lineEnding = options.lineEnding ?? '\r\n';
  const terminalLineEnding = options.terminalLineEnding ?? true;
  const appendBlankLine = options.appendBlankLine ?? false;

  let output = records.join(lineEnding);

  if (terminalLineEnding) {
    output += lineEnding;
  }

  if (appendBlankLine) {
    output += lineEnding;
  }

  return output;
}

export function ensureRenderedRecord<TError extends Error>(
  result: Result<string, TError>
): string {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}
