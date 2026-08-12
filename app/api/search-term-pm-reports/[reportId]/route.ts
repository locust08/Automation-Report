import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getSearchTermPmReport } from "@/lib/search-term-pm-reports/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pm", "admin"].includes(session.role)) return NextResponse.json({ error: "Project Manager access is required." }, { status: 403 });
  const { reportId } = await context.params;
  const report = getSearchTermPmReport(Number(reportId));
  return report ? NextResponse.json(report) : NextResponse.json({ error: "Report not found." }, { status: 404 });
}
