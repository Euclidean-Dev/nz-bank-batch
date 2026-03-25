import { ok, type Result } from '../../shared/result.js';
import { parseIb4bFile, type ParsedIb4bFile } from '../../shared/ib4b-parser.js';
import type { KiwibankParseError, ParsedKiwibankFile } from './types.js';

function mapParsedFile(parsed: ParsedIb4bFile): ParsedKiwibankFile {
  return {
    kind: parsed.kind,
    transactionCode: parsed.transactionCode,
    fromAccount: parsed.fromAccount,
    originatorName: parsed.originatorName,
    batchReference: parsed.reference,
    processDate: parsed.processDate,
    effectiveDate: parsed.effectiveDate,
    transactions: parsed.transactions,
    summary: parsed.summary
  };
}

export function parseFile(
  input: string | Buffer
): Result<ParsedKiwibankFile, KiwibankParseError> {
  const parsed = parseIb4bFile(input);

  if (!parsed.ok) {
    return parsed;
  }

  return ok(mapParsedFile(parsed.value));
}