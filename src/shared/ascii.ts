import { FieldError } from './errors.js';
import { err, ok, type Result } from './result.js';

export type CsvFieldSpec = {
  readonly name: string;
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly truncate?: boolean;
};

export type CsvFieldInput = {
  readonly value: string | number | bigint | null | undefined;
  readonly spec: CsvFieldSpec;
};

const ASCII_PRINTABLE = /^[ -~]*$/;

export function prepareCsvField(
  input: CsvFieldInput
): Result<string, FieldError> {
  const { spec, value } = input;

  if (value === null || value === undefined || value === '') {
    if (spec.required) {
      return err(
        new FieldError('FIELD_REQUIRED', `Field ${spec.name} is required.`, {
          field: spec.name
        })
      );
    }

    return ok('');
  }

  const stringValue = String(value).trimEnd();

  if (!ASCII_PRINTABLE.test(stringValue)) {
    return err(
      new FieldError(
        'FIELD_ASCII',
        `Field ${spec.name} must contain printable ASCII only.`,
        { field: spec.name, value: stringValue }
      )
    );
  }

  if (stringValue.includes(',')) {
    return err(
      new FieldError(
        'FIELD_COMMA',
        `Field ${spec.name} must not contain commas.`,
        {
          field: spec.name,
          value: stringValue
        }
      )
    );
  }

  if (spec.maxLength !== undefined && stringValue.length > spec.maxLength) {
    if (!spec.truncate) {
      return err(
        new FieldError(
          'FIELD_LENGTH',
          `Field ${spec.name} exceeds max length ${String(spec.maxLength)}.`,
          { field: spec.name, value: stringValue, maxLength: spec.maxLength }
        )
      );
    }

    return ok(stringValue.slice(0, spec.maxLength).trimEnd());
  }

  return ok(stringValue);
}
