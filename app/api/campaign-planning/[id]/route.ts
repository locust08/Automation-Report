import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  CampaignPlanningRepositoryError,
  disconnectedStage2Meta,
  getCampaignPlan,
  updateCampaignPlanRevision,
} from "@/lib/campaign-planning/supabase-repository";
import { formatCampaignValidationError } from "@/lib/campaign-planning/campaign-submission-validation";
import { updateCampaignPlanSchema } from "@/lib/campaign-planning/validation";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await context.params;
  try {
    const input = updateCampaignPlanSchema.parse(await request.json());
    return NextResponse.json(await updateCampaignPlanRevision(Number(id), input.expected_lock_version, input.campaign, {
      actorId: session.sub,
      userAgent: request.headers.get("user-agent"),
    }));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json(formatCampaignValidationError(error), { status: 400 });
    const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the campaign draft." }, { status });
  }
}
