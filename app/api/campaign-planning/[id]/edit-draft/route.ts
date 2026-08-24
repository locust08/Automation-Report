import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  CampaignPlanningRepositoryError,
  deleteCampaignEditDraft,
  getCampaignEditDraft,
  getCampaignPlan,
  upsertCampaignEditDraft,
} from "@/lib/campaign-planning/supabase-repository";
import { campaignEditDraftInputSchema } from "@/lib/campaign-planning/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    const [detail, draft] = await Promise.all([
      getCampaignPlan(authorized.planId),
      getCampaignEditDraft(authorized.planId, authorized.subject),
    ]);
    return NextResponse.json({
      draft,
      stale: Boolean(draft && (draft.baseRevisionId !== detail.currentRevision.id || draft.baseLockVersion !== detail.plan.lockVersion)),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load the incomplete campaign edit.");
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    const input = campaignEditDraftInputSchema.parse(await request.json());
    const detail = await getCampaignPlan(authorized.planId);
    if (detail.plan.status !== "draft") return NextResponse.json({ error: "Only draft campaigns can be edited." }, { status: 409 });
    if (input.platform !== detail.plan.platform) return NextResponse.json({ error: "Campaign platform cannot be changed." }, { status: 409 });
    if (input.base_revision_id !== detail.currentRevision.id || input.base_lock_version !== detail.plan.lockVersion) {
      return NextResponse.json({ error: "This campaign changed while you were editing it.", stale: true }, { status: 409 });
    }
    return NextResponse.json({ draft: await upsertCampaignEditDraft(authorized.planId, authorized.subject, input) });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid incomplete campaign edit." }, { status: 400 });
    return errorResponse(error, "Unable to save the incomplete campaign edit.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    await deleteCampaignEditDraft(authorized.planId, authorized.subject);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, "Unable to discard the incomplete campaign edit.");
  }
}

async function authorize(context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return { planId: 0, subject: "", response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "admin") return { planId: 0, subject: "", response: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }) };
  const { id } = await context.params;
  const planId = Number(id);
  if (!Number.isSafeInteger(planId) || planId < 1) return { planId: 0, subject: "", response: NextResponse.json({ error: "Invalid campaign ID." }, { status: 400 }) };
  return { planId, subject: session.sub, response: null };
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
