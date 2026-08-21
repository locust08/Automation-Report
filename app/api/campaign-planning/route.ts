import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { CampaignLocalModelError, createCampaignPlan, listCampaignPlans } from "@/lib/campaign-planning/sqlite-repository";
import { createCampaignPlanSchema } from "@/lib/campaign-planning/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "user") return NextResponse.json({ error: "Campaign access is required." }, { status: 403 });
  try { return NextResponse.json(listCampaignPlans()); }
  catch (error) { return localError(error, "Unable to load local campaigns."); }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    const input = createCampaignPlanSchema.parse(await request.json());
    return NextResponse.json(createCampaignPlan(input, { id: session.sub, email: session.email }), { status: 201 });
  } catch (error) { return localError(error, "Unable to create the local campaign."); }
}

function localError(error: unknown, fallback: string) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
  if (error instanceof CampaignLocalModelError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

