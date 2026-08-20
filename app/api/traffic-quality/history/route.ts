import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { listTrafficQualityHistory } from "@/lib/traffic-quality/supabase-repository";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = (new URL(request.url).searchParams.get("accountId") ?? "").replace(/\D/g, "");
  if (accountId.length !== 10) return NextResponse.json({ error: "A valid Google Ads account is required." }, { status: 400 });
  return NextResponse.json({ events: await listTrafficQualityHistory(accountId) });
}
