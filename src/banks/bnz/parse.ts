import { ok, type Result } from '../../shared/result.js';
import { parseIb4bFile, type ParsedIb4bFile } from '../../shared/ib4b-parser.js';
import type { BnzParseError, ParsedBnzFile } from './types.js';

function mapParsedFile(parsed: ParsedIb4bFile): ParsedBnzFile {
  return {
    kind: parsed.kind,
    transactionCode: parsed.transactionCode,
    fromAccount: parsed.fromAccount,
    originatorName: parsed.originatorName,
    userReference: parsed.reference,
    processDate: parsed.processDate,
    effectiveDate: parsed.effectiveDate,
    transactions: parsed.transactions,
    summary: parsed.summary
  };
}

export function parseFile(input: string | Buffer): Result<ParsedBnzFile, BnzParseError> {
  const parsed = parseIb4bFile(input);

  if (!parsed.ok) {
    return parsed;
  }

  return ok(mapParsedFile(parsed.value));
}