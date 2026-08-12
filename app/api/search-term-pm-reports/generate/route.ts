import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { generateSearchTermPmReport } from "@/lib/search-term-pm-reports/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pm", "admin"].includes(session.role)) return NextResponse.json({ error: "Project Manager access is required." }, { status: 403 });
  try {
    const body = await request.json() as { changeSetId?: number };
    if (!Number.isInteger(body.changeSetId) || Number(body.changeSetId) < 1) return NextResponse.json({ error: "A valid changeSetId is required." }, { status: 400 });
    return NextResponse.json(generateSearchTermPmReport(Number(body.changeSetId)), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate PM report." }, { status: 400 });
  }
}
