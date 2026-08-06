import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { loadTeamLeadMonitoring } from "@/lib/team-lead-monitoring/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tl", "admin"].includes(session.role)) return NextResponse.json({ error: "Team Lead access is required." }, { status: 403 });
  try { return NextResponse.json(loadTeamLeadMonitoring()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load monitoring data." }, { status: 500 }); }
}

