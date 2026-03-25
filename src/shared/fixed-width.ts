import { FieldError } from './errors.js';
import { err, ok, type Result } from './result.js';

export type FixedWidthAlignment = 'left' | 'right';

export type FixedWidthFieldSpec = {
  readonly name: string;
  readonly length: number;
  readonly align?: FixedWidthAlignment;
  readonly pad?: string;
  readonly truncate?: boolean;
  readonly required?: boolean;
  readonly allowedPattern?: RegExp;
};

export type FixedWidthFieldInput = {
  readonly value: string | number | bigint | null | undefined;
  readonly spec: FixedWidthFieldSpec;
};

const ASCII_PRINTABLE = /^[ -~]*$/;

function padValue(
  value: string,
  length: number,
  align: FixedWidthAlignment,
  pad: string
): string {
  return align === 'right' ? value.padStart(length, pad) : value.padEnd(length, pad);
}

export function renderFixedWidthField(
  input: FixedWidthFieldInput
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

    return ok(''.padEnd(spec.length, spec.pad ?? ' '));
  }

  let stringValue = String(value).trimEnd();

  if (!ASCII_PRINTABLE.test(stringValue)) {
    return err(
      new FieldError('FIELD_ASCII', `Field ${spec.name} must contain printable ASCII only.`, {
        field: spec.name,
        value: stringValue
      })
    );
  }

  if (spec.allowedPattern && !spec.allowedPattern.test(stringValue)) {
    return err(
      new FieldError('FIELD_ASCII', `Field ${spec.name} contains unsupported characters.`, {
        field: spec.name,
        value: stringValue
      })
    );
  }

  if (stringValue.length > spec.length) {
    if (!spec.truncate) {
      return err(
        new FieldError('FIELD_LENGTH', `Field ${spec.name} exceeds fixed width ${String(spec.length)}.`, {
          field: spec.name,
          value: stringValue,
          length: spec.length
        })
      );
    }

    stringValue = stringValue.slice(0, spec.length).trimEnd();
  }

  return ok(
    padValue(stringValue, spec.length, spec.align ?? 'left', spec.pad ?? ' ')
  );
}

export function renderFixedWidthRecord(
  fields: readonly FixedWidthFieldInput[]
): Result<string, FieldError> {
  const output: string[] = [];

  for (const field of fields) {
    const rendered = renderFixedWidthField(field);

    if (!rendered.ok) {
      return rendered;
    }

    output.push(rendered.value);
  }

  return ok(output.join(''));
}