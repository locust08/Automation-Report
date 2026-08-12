import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getLatestDashboardFromSupabase } from "@/lib/search-term-optimization/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedAccountId = new URL(request.url).searchParams.get("accountId")?.trim() || undefined;
  const accountId = ["admin", "ethan"].includes(session.role) ? requestedAccountId : undefined;

  try {
    const dashboard = await getLatestDashboardFromSupabase(accountId);
    if (!dashboard) throw new Error(accountId ? `No saved search-term analysis was found for account ${accountId}.` : "No saved search-term analysis was found.");
    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load search-term optimization data.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
