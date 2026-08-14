import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildDateRange } from "@/lib/reporting/date";
import { cancelPlacementCache, getPlacementCacheStatus, loadMorePlacementCache, startPlacementCache } from "@/lib/placement-optimization/cache-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { accountId?: string; startDate?: string; endDate?: string; refresh?: boolean; loadMore?: boolean };
    const accountId = normalizeAccount(body.accountId);
    if (!accountId) return NextResponse.json({ error: "Select a valid Google Ads account first." }, { status: 400 });
    const range = buildDateRange(body.startDate ?? null, body.endDate ?? null);
    const job = body.loadMore === true
      ? await loadMorePlacementCache({ accountId, startDate: range.startDate, endDate: range.endDate })
      : await startPlacementCache({ accountId, startDate: range.startDate, endDate: range.endDate, refresh: body.refresh === true });
    return NextResponse.json(toJob(job), { status: 202 });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const accountId = normalizeAccount(url.searchParams.get("accountId"));
    if (!accountId) return NextResponse.json({ error: "A valid account is required." }, { status: 400 });
    const range = buildDateRange(url.searchParams.get("startDate"), url.searchParams.get("endDate"));
    const job=await getPlacementCacheStatus({ accountId, startDate: range.startDate, endDate: range.endDate });
    return NextResponse.json({ job: job?toJob(job):null });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const accountId = normalizeAccount(url.searchParams.get("accountId"));
    if (!accountId) return NextResponse.json({ error: "A valid account is required." }, { status: 400 });
    const range = buildDateRange(url.searchParams.get("startDate"), url.searchParams.get("endDate"));
    return NextResponse.json(toJob(await cancelPlacementCache({ accountId, startDate: range.startDate, endDate: range.endDate })));
  } catch (error) { return apiError(error); }
}

function normalizeAccount(value: string | null | undefined) { const accountId = (value ?? "").replace(/\D/g, ""); return accountId.length === 10 ? accountId : null; }
function toJob(value:Awaited<ReturnType<typeof startPlacementCache>>){return{id:value.id,status:value.status,stage:value.stage,processed_rows:value.processedRows,total_rows:value.totalRows,has_more:value.hasMore,error:value.error,started_at:value.startedAt,updated_at:value.updatedAt,expires_at:value.expiresAt,account_id:value.accountId,start_date:value.startDate,end_date:value.endDate};}
function apiError(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Placement retrieval failed." }, { status: 502 }); }
