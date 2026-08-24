import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  CampaignPlanningRepositoryError,
  deleteCampaignWizardDraft,
  getCampaignWizardDraft,
  upsertCampaignWizardDraft,
} from "@/lib/campaign-planning/supabase-repository";
import { campaignWizardDraftInputSchema } from "@/lib/campaign-planning/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  const denied = authorize(session);
  if (denied) return denied;
  try {
    return NextResponse.json({ draft: await getCampaignWizardDraft(session!.sub) });
  } catch (error) {
    return errorResponse(error, "Unable to load the incomplete campaign setup.");
  }
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  const denied = authorize(session);
  if (denied) return denied;
  try {
    const input = campaignWizardDraftInputSchema.parse(await request.json());
    return NextResponse.json({ draft: await upsertCampaignWizardDraft(session!.sub, input) });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid incomplete campaign setup." }, { status: 400 });
    return errorResponse(error, "Unable to save the incomplete campaign setup.");
  }
}

export async function DELETE() {
  const session = await getServerAuthSession();
  const denied = authorize(session);
  if (denied) return denied;
  try {
    await deleteCampaignWizardDraft(session!.sub);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, "Unable to discard the incomplete campaign setup.");
  }
}

function authorize(session: Awaited<ReturnType<typeof getServerAuthSession>>) {
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  return null;
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
