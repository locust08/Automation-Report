import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { applyCampaignPlanAction, CampaignLocalModelError } from "@/lib/campaign-planning/sqlite-repository";
import { campaignPlanActionSchema } from "@/lib/campaign-planning/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    const { id } = await context.params;
    const planId = Number(id);
    if (!Number.isInteger(planId) || planId < 1) return NextResponse.json({ error: "Invalid campaign ID." }, { status: 400 });
    const input = campaignPlanActionSchema.parse(await request.json());
    return NextResponse.json(applyCampaignPlanAction(planId, input, { id: session.sub, email: session.email }));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    const status = error instanceof CampaignLocalModelError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update campaign." }, { status });
  }
}
