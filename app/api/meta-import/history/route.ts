import { NextResponse } from "next/server";

import { listMetaImportJobs } from "@/lib/meta-import/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.replace(/\D/g, "") || undefined;
    return NextResponse.json({ jobs: await listMetaImportJobs(accountId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import history failed." }, { status: 500 });
  }
}
