import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountSearchPayload = {
  success?: boolean;
  accounts?: Array<{
    accountName: string;
    adAccountId: string;
    accessPath?: string | null;
    platform?: string | null;
  }>;
  error?: string;
};

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ accounts: [] });

  const workerUrl = process.env.MONTHLY_REPORT_WORKER_URL?.trim()
    || process.env.REPORT_AUTOMATION_WORKER_URL?.trim();
  const workerSecret = process.env.WORKER_API_SECRET?.trim();
  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      { error: "Account directory is unavailable: Worker URL or API secret is not configured." },
      { status: 503 }
    );
  }

  try {
    const url = new URL("/ad-accounts/search", ensureTrailingSlash(workerUrl));
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${workerSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null) as AccountSearchPayload | null;
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Account directory returned HTTP ${response.status}.`);
    }
    return NextResponse.json({ accounts: payload.accounts ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search the account directory." },
      { status: 502 }
    );
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
