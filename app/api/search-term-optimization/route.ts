import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getLatestDashboardFromSupabase } from "@/lib/search-term-optimization/supabase-repository";
import { isSupabaseUnavailableError } from "@/lib/optimization/supabase-rest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedAccountId = new URL(request.url).searchParams.get("accountId")?.trim() || undefined;
  const accountId = session.role === "admin" ? requestedAccountId : undefined;

  try {
    const dashboard = await getLatestDashboardFromSupabase(accountId);
    if (!dashboard) return NextResponse.json({ code: "SEARCH_TERM_ANALYSIS_NOT_FOUND", error: "No saved search-term analysis was found for this account." }, { status: 404 });
    return NextResponse.json(dashboard);
  } catch (error) {
    if (isSupabaseUnavailableError(error)) return NextResponse.json({ code: "SEARCH_TERM_STORAGE_UNAVAILABLE", error: "Saved analysis is temporarily unavailable. Please try again." }, { status: 503 });
    return NextResponse.json({ code: "SEARCH_TERM_DASHBOARD_LOAD_FAILED", error: "Unable to load the saved search-term analysis." }, { status: 500 });
  }
}
