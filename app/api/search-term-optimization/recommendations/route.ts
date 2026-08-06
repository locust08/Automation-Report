import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/session";
import { getGoogleRecommendationsForAccount } from "@/lib/search-term-optimization/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token || !(await verifyAuthToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
