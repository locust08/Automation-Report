import { parse } from "csv-parse/sync";

import { detectMetaImportMapping } from "@/lib/meta-import/columns";
import {
  META_IMPORT_MAX_FILE_BYTES,
  META_IMPORT_MAX_ROWS,
  type MetaImportColumnMapping,
  type MetaImportIssue,
} from "@/lib/meta-import/types";

export interface ParsedMetaCsv {
  headers: string[];
  rows: Record<string, string>[];
  mapping: MetaImportColumnMapping;
  delimiter: string;
  issues: MetaImportIssue[];
}

export function parseMetaCsv(input: { bytes: Uint8Array; filename: string }): ParsedMetaCsv {
  validateMetaCsvFile(input);
  const text = decodeCsv(input.bytes);
  if (!text.trim()) {
    throw new MetaCsvParseError("The CSV file is empty.", "empty_file");
  }

  const delimiter = detectDelimiter(text);
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      delimiter,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
      cast: false,
      max_record_size: 1024 * 1024,
    }) as Record<string, string>[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CSV parsing error.";
    throw new MetaCsvParseError(`The CSV is malformed: ${message}`, "malformed_csv");
  }

  if (records.length === 0) {
    throw new MetaCsvParseError("The CSV contains headers but no data rows.", "empty_rows");
  }
  if (records.length > META_IMPORT_MAX_ROWS) {
    throw new MetaCsvParseError(
      `The CSV contains ${records.length.toLocaleString()} rows. The maximum is ${META_IMPORT_MAX_ROWS.toLocaleString()}.`,
      "too_many_rows"
    );
  }

  const headers = Object.keys(records[0] ?? {});
  if (headers.length === 0 || headers.every((header) => !header.trim())) {
    throw new MetaCsvParseError("The CSV does not contain a valid header row.", "missing_headers");
  }

  return {
    headers,
    rows: records.map((row) => sanitizeRecord(row)),
    mapping: detectMetaImportMapping(headers),
    delimiter,
    issues: [],
  };
}

export class MetaCsvParseError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "MetaCsvParseError";
  }
}

function validateMetaCsvFile(input: { bytes: Uint8Array; filename: string }): void {
  if (!input.filename.toLocaleLowerCase("en").endsWith(".csv")) {
    throw new MetaCsvParseError("Only .csv files are supported.", "invalid_file_type");
  }
  if (input.bytes.byteLength === 0) {
    throw new MetaCsvParseError("The CSV file is empty.", "empty_file");
  }
  if (input.bytes.byteLength > META_IMPORT_MAX_FILE_BYTES) {
    throw new MetaCsvParseError(
      `The CSV exceeds the ${META_IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB upload limit.`,
      "file_too_large"
    );
  }
  if (input.bytes.some((byte) => byte === 0) && !hasUtf16Bom(input.bytes)) {
    throw new MetaCsvParseError("The uploaded file does not look like a text CSV.", "invalid_file_content");
  }
}

function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function hasUtf16Bom(bytes: Uint8Array): boolean {
  return (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = countUnquoted(sample, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function countUnquoted(value: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && value[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

function sanitizeRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, sanitizeCsvText(String(value ?? ""))])
  );
}

export function sanitizeCsvText(value: string): string {
  const cleaned = value.replace(/\u0000/g, "").trim();
  return /^[=+@]/.test(cleaned) || /^[\t\r]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

