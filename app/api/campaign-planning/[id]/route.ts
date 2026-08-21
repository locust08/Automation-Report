import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { CampaignLocalModelError, getCampaignPlan } from "@/lib/campaign-planning/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "user") return NextResponse.json({ error: "Campaign access is required." }, { status: 403 });
  try {
    const { id } = await context.params;
    const planId = Number(id);
    if (!Number.isInteger(planId) || planId < 1) return NextResponse.json({ error: "Invalid campaign ID." }, { status: 400 });
    return NextResponse.json(getCampaignPlan(planId));
  } catch (error) {
    const status = error instanceof CampaignLocalModelError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load campaign." }, { status });
  }
}

