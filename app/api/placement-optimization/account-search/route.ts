import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ accounts: [] });
  try {
    const workerUrl = process.env.MONTHLY_REPORT_WORKER_URL?.trim() || process.env.REPORT_AUTOMATION_WORKER_URL?.trim();
    const workerSecret = process.env.WORKER_API_SECRET?.trim();
    if (!workerUrl || !workerSecret) throw new Error("Account directory is unavailable.");
    const url = new URL("/ad-accounts/search", workerUrl.endsWith("/") ? workerUrl : `${workerUrl}/`);
    url.searchParams.set("q", query);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${workerSecret}` }, cache: "no-store" });
    const payload = await response.json() as { success?: boolean; accounts?: unknown[]; error?: string };
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to search accounts.");
    return NextResponse.json({ accounts: payload.accounts ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to search Google Ads accounts." }, { status: 500 });
  }
}
