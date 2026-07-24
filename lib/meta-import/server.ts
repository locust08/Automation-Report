import { randomUUID } from "node:crypto";

import { META_IMPORT_REQUIRED_FIELDS } from "@/lib/meta-import/columns";
import { parseMetaCsv } from "@/lib/meta-import/parser";
import { classifyMetaImportRows } from "@/lib/meta-import/repository";
import type {
  MetaImportColumnMapping,
  MetaImportIssue,
  MetaImportJob,
  MetaImportPreview,
  MetaImportPreviewRow,
} from "@/lib/meta-import/types";
import { validateMetaImportRows } from "@/lib/meta-import/validation";

export interface MetaImportUploadInput {
  file: File;
  expectedAccountId: string;
  allowAccountMismatch: boolean;
  mapping: MetaImportColumnMapping | null;
}

export async function readMetaImportUpload(request: Request): Promise<MetaImportUploadInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en").includes("multipart/form-data")) {
    throw new MetaImportRequestError("Upload the CSV as multipart form data.", 415);
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new MetaImportRequestError("Select a CSV file to upload.", 400);
  }
  const expectedAccountId = normalizeAccountId(readString(formData.get("accountId")));
  if (!expectedAccountId) {
    throw new MetaImportRequestError("A Meta Ad Account ID is required.", 400);
  }
  return {
    file,
    expectedAccountId,
    allowAccountMismatch: readString(formData.get("allowAccountMismatch")) === "true",
    mapping: parseMapping(readString(formData.get("mapping"))),
  };
}

export async function buildMetaImportPreview(input: MetaImportUploadInput): Promise<MetaImportPreview> {
  const parsed = parseMetaCsv({
    bytes: new Uint8Array(await input.file.arrayBuffer()),
    filename: input.file.name,
  });
  const mapping = input.mapping ?? parsed.mapping;
  validateMappedHeaders(mapping, parsed.headers);
  const initial = validateMetaImportRows({
    rows: parsed.rows,
    mapping,
    expectedAccountId: input.expectedAccountId,
    allowAccountMismatch: input.allowAccountMismatch,
  });
  const validRows = initial.rows.filter((row) => row.validationStatus !== "invalid");
  const duplicateActions = await classifyMetaImportRows(validRows);
  const validated = validateMetaImportRows({
    rows: parsed.rows,
    mapping,
    expectedAccountId: input.expectedAccountId,
    allowAccountMismatch: input.allowAccountMismatch,
    duplicateActions,
  });
  const dates = validated.rows
    .filter((row) => row.reportingStart && row.reportingEnd)
    .flatMap((row) => [row.reportingStart, row.reportingEnd])
    .sort();
  const fileIssues: MetaImportIssue[] = [...parsed.issues];
  for (const field of META_IMPORT_REQUIRED_FIELDS) {
    if (!mapping[field]) {
      fileIssues.push({ severity: "error", code: "missing_required_column", message: `Map the required ${field} column.` });
    }
  }
  if (validated.reportingLevel === "mixed") {
    fileIssues.push({
      severity: "warning",
      code: "mixed_reporting_levels",
      message: "The file contains mixed campaign, ad-set, or ad-level rows. Review it carefully before import.",
    });
  }

  return {
    headers: parsed.headers,
    mapping,
    requiredFields: META_IMPORT_REQUIRED_FIELDS,
    reportingLevel: validated.reportingLevel,
    dateRange: { startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null },
    detectedDelimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter,
    rows: validated.rows,
    summary: validated.summary,
    file: { name: input.file.name, size: input.file.size, rowCount: parsed.rows.length },
    fileIssues,
  };
}

export function createMetaImportJob(input: {
  preview: MetaImportPreview;
  accountId: string;
  importedBy: string;
}): MetaImportJob {
  const now = new Date().toISOString();
  const failedRows = input.preview.summary.invalidRows;
  const successfulRows = input.preview.summary.createRows + input.preview.summary.updateRows;
  return {
    id: randomUUID(),
    originalFilename: input.preview.file.name,
    accountId: input.accountId,
    importedBy: input.importedBy,
    uploadedAt: now,
    completedAt: now,
    reportingStart: input.preview.dateRange.startDate,
    reportingEnd: input.preview.dateRange.endDate,
    reportingLevel: input.preview.reportingLevel,
    totalRows: input.preview.summary.totalRows,
    createdRows: input.preview.summary.createRows,
    updatedRows: input.preview.summary.updateRows,
    skippedRows: input.preview.summary.skipRows,
    failedRows,
    status: failedRows > 0 && successfulRows > 0 ? "partial" : failedRows > 0 ? "failed" : "completed",
    errorSummary: summarizeErrors(input.preview.rows),
  };
}

export class MetaImportRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "MetaImportRequestError";
  }
}

function parseMapping(raw: string): MetaImportColumnMapping | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Mapping must be an object.");
    }
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    ) as MetaImportColumnMapping;
  } catch {
    throw new MetaImportRequestError("The column mapping is invalid.", 400);
  }
}

function validateMappedHeaders(mapping: MetaImportColumnMapping, headers: string[]): void {
  const headerSet = new Set(headers);
  const unknown = Object.values(mapping).filter((header): header is string => Boolean(header && !headerSet.has(header)));
  if (unknown.length > 0) {
    throw new MetaImportRequestError(`Mapped columns were not found: ${unknown.join(", ")}.`, 400);
  }
}

function summarizeErrors(rows: MetaImportPreviewRow[]): string | null {
  const errors = Array.from(
    new Set(rows.flatMap((row) => row.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message)))
  );
  return errors.length > 0 ? errors.slice(0, 5).join(" | ") : null;
}

function readString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountId(value: string): string {
  return value.replace(/^act_/i, "").replace(/\D/g, "");
}

