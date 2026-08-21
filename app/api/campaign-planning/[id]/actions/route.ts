import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { CampaignPlanningRepositoryError, runMockCampaignWorkflow } from "@/lib/campaign-planning/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "run_full_mock") {
    return NextResponse.json({ error: "Only the offline mock workflow is enabled." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    return NextResponse.json(await runMockCampaignWorkflow(Number(id), session.sub));
  } catch (error) {
    const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mock workflow failed." }, { status });
  }
}
