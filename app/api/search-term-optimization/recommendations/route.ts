import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getGoogleRecommendationsForAccount } from "@/lib/search-term-optimization/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || undefined;
  try {
    const result = await getGoogleRecommendationsForAccount(accountId);
    return NextResponse.json({ recommendations: result.rows, warning: result.warning });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Google Ads recommendations." },
      { status: 502 },
    );
  }
}
