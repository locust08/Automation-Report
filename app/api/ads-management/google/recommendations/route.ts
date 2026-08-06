import { NextResponse } from "next/server";
import { fetchManagedRecommendations } from "@/lib/ads-management/google";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || "";
    if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });
    return NextResponse.json(await fetchManagedRecommendations(accountId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Google Ads recommendations." }, { status: 500 });
  }
}
