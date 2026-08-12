import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { loadMonitoringActivity } from "@/lib/team-lead-monitoring/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tl", "admin"].includes(session.role)) return NextResponse.json({ error: "Team Lead access is required." }, { status: 403 });
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  try { return NextResponse.json(loadMonitoringActivity({ offset, limit })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load monitoring history." }, { status: 500 }); }
}
