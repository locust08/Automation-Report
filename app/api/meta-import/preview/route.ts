import { NextResponse } from "next/server";

import { MetaCsvParseError } from "@/lib/meta-import/parser";
import { buildMetaImportPreview, MetaImportRequestError, readMetaImportUpload } from "@/lib/meta-import/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const upload = await readMetaImportUpload(request);
    return NextResponse.json(await buildMetaImportPreview(upload));
  } catch (error) {
    return importErrorResponse(error);
  }
}

function importErrorResponse(error: unknown): NextResponse {
  if (error instanceof MetaImportRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof MetaCsvParseError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  console.error("[meta-import] preview failed", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "CSV preview failed." }, { status: 500 });
}
