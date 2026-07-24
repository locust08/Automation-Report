import { NextResponse } from "next/server";

import { MetaCsvParseError } from "@/lib/meta-import/parser";
import { commitMetaImport } from "@/lib/meta-import/repository";
import {
  buildMetaImportPreview,
  createMetaImportJob,
  MetaImportRequestError,
  readMetaImportUpload,
} from "@/lib/meta-import/server";
import type { MetaImportCommitResult } from "@/lib/meta-import/types";
import type { MetaImportedRow, MetaImportPreviewRow } from "@/lib/meta-import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const upload = await readMetaImportUpload(request);
    const confirmation = new URL(request.url).searchParams.get("confirm") === "1";
    if (!confirmation) {
      return NextResponse.json({ error: "Import confirmation is required." }, { status: 400 });
    }
    const preview = await buildMetaImportPreview(upload);
    const fileErrors = preview.fileIssues.filter((issue) => issue.severity === "error");
    if (fileErrors.length > 0) {
      return NextResponse.json({ error: fileErrors.map((issue) => issue.message).join(" ") }, { status: 400 });
    }
    const job = createMetaImportJob({ preview, accountId: upload.expectedAccountId, importedBy: "Dashboard user" });
    const rows = preview.rows
      .filter((row) => row.validationStatus !== "invalid" && row.duplicateAction !== "skip")
      .map(toImportedRow);
    const committed = await commitMetaImport({ job, rows });
    const reportUrl = `/overall?metaAccountId=${encodeURIComponent(upload.expectedAccountId)}&source=meta_csv${
      preview.dateRange.startDate ? `&startDate=${preview.dateRange.startDate}` : ""
    }${preview.dateRange.endDate ? `&endDate=${preview.dateRange.endDate}` : ""}`;
    const result: MetaImportCommitResult = {
      success: committed.job.status !== "failed",
      job: committed.job,
      rowsCreated: committed.created,
      rowsUpdated: committed.updated,
      rowsSkipped: preview.summary.skipRows,
      invalidRows: preview.summary.invalidRows,
      errors: committed.job.errorSummary ? [committed.job.errorSummary] : [],
      reportUrl,
    };
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    if (error instanceof MetaImportRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof MetaCsvParseError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    console.error("[meta-import] commit failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "CSV import failed." }, { status: 500 });
  }
}

function toImportedRow(row: MetaImportPreviewRow): MetaImportedRow {
  const value: Partial<MetaImportPreviewRow> = { ...row };
  delete value.rowNumber;
  delete value.validationStatus;
  delete value.duplicateAction;
  delete value.issues;
  return value as MetaImportedRow;
}
