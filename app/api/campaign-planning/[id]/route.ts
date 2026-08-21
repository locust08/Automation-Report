import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  CampaignPlanningRepositoryError,
  disconnectedStage2Meta,
  getCampaignPlan,
} from "@/lib/campaign-planning/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "user") {
    return NextResponse.json({ error: "Campaign access is required." }, { status: 403 });
  }

  const { id } = await context.params;
  const planId = Number(id);
  if (!Number.isSafeInteger(planId) || planId < 1) {
    return NextResponse.json({ error: "Invalid campaign ID." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getCampaignPlan(planId));
  } catch (error) {
    const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to load the campaign draft.";
    return NextResponse.json({ ...disconnectedStage2Meta(), error: message }, { status });
  }
}
