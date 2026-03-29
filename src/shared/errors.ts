type ErrorContext = Record<string, unknown>;

export class NzBatchError<TCode extends string = string> extends Error {
  public readonly code: TCode;
  public readonly context: ErrorContext | undefined;

  public constructor(code: TCode, message: string, context?: ErrorContext) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

export class NzAccountError extends NzBatchError<
  | 'NZ_ACCOUNT_FORMAT'
  | 'NZ_ACCOUNT_CHECKSUM'
  | 'NZ_ACCOUNT_BRANCH'
  | 'NZ_ACCOUNT_BANK'
> {}

export class MoneyError extends NzBatchError<
  'INVALID_MONEY' | 'INVALID_CENTS'
> {}

export class DateError extends NzBatchError<'INVALID_DATE'> {}

export class FieldError extends NzBatchError<
  'FIELD_REQUIRED' | 'FIELD_ASCII' | 'FIELD_COMMA' | 'FIELD_LENGTH'
> {}

export class AdapterError extends NzBatchError<
  'ADAPTER_CONFIG' | 'ADAPTER_TRANSACTION'
> {}
