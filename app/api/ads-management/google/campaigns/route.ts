import { NextResponse } from "next/server";
import { fetchManagedSearchCampaigns } from "@/lib/ads-management/google";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams; const accountId = params.get("accountId")?.trim() || ""; if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 }); return NextResponse.json(await fetchManagedSearchCampaigns(accountId, { startDate: params.get("startDate")?.trim(), endDate: params.get("endDate")?.trim() })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Google Ads campaigns." }, { status: 500 }); }
}
