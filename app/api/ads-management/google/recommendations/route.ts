import { NextRequest, NextResponse } from "next/server";
import { getCachedManagedRecommendations } from "@/lib/ads-management/cache";
import { authSessionFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || "";
    if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });
    return NextResponse.json(await getCachedManagedRecommendations(accountId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Google Ads recommendations." }, { status: 500 });
  }
}
