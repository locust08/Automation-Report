import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  CampaignPlanningRepositoryError,
  createCampaignPlanDraft,
  deleteCampaignWizardDraft,
  disconnectedStage2Meta,
  listCampaignPlans,
} from "@/lib/campaign-planning/supabase-repository";
import { createCampaignPlanSchema } from "@/lib/campaign-planning/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "user") {
    return NextResponse.json({ error: "Campaign access is required." }, { status: 403 });
  }
  try {
    return NextResponse.json(await listCampaignPlans());
  } catch (error) {
    const response = repositoryError(error, "Unable to load local Supabase campaign drafts.");
    return NextResponse.json({ ...disconnectedStage2Meta(), error: response.message }, { status: response.status });
  }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  try {
    const input = createCampaignPlanSchema.parse(await request.json());
    const detail = await createCampaignPlanDraft(input, {
      actorId: session.sub,
      userAgent: request.headers.get("user-agent"),
    });
    await deleteCampaignWizardDraft(session.sub).catch(() => undefined);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid campaign draft." }, { status: 400 });
    }
    const response = repositoryError(error, "Unable to create the local Supabase campaign draft.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

function repositoryError(error: unknown, fallback: string): { message: string; status: number } {
  if (error instanceof CampaignPlanningRepositoryError) {
    return { message: error.message, status: error.status };
  }
  return { message: error instanceof Error ? error.message : fallback, status: 500 };
}
