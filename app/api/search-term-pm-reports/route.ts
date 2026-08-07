import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { listSearchTermPmReports } from "@/lib/search-term-pm-reports/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pm", "admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Project Manager access is required." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(listSearchTermPmReports({
      accountId: params.get("accountId") || undefined,
      startDate: params.get("startDate") || undefined,
      endDate: params.get("endDate") || undefined,
      limit: Number(params.get("limit") || 10),
      offset: Number(params.get("offset") || 0),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load PM reports." }, { status: 500 });
  }
}
