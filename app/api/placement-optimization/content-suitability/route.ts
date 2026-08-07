import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getContentSuitability } from "@/lib/placement-optimization/content-suitability-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLES = new Set(["co", "approver", "pm", "admin", "ethan"]);

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Your role cannot access content suitability." },
      { status: 403 },
    );
  }
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "Google Ads account ID is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await getContentSuitability({
        accountId,
        refresh: url.searchParams.get("refresh") === "1",
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load content suitability." },
      { status: 502 },
    );
  }
}
