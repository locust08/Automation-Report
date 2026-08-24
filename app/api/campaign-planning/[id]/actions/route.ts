import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { approveReadyCampaign, CampaignPlanningRepositoryError, validateCampaignReadiness } from "@/lib/campaign-planning/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { action?: string; idempotency_key?: string } | null;
  const action = body?.action;
  if (["publish", "activate", "verify", "retry", "handoff"].includes(action ?? "")) {
    return NextResponse.json({ error: "provider_execution_locked", message: "Provider execution is intentionally disabled. This dashboard stops at Ready for provider integration." }, { status: 423 });
  }
  if (action !== "validate_readiness" && action !== "approve_readiness") {
    return NextResponse.json({ error: "Unsupported dashboard action." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const idempotencyKey = body?.idempotency_key?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
    }
    const requestContext = {
      actorId: session.sub,
      ip: requestIp(request),
      userAgent: request.headers.get("user-agent"),
      idempotencyKey,
    };
    return NextResponse.json(action === "validate_readiness"
      ? await validateCampaignReadiness(Number(id), requestContext)
      : await approveReadyCampaign(Number(id), requestContext));
  } catch (error) {
    const status = error instanceof CampaignPlanningRepositoryError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign readiness action failed." }, { status });
  }
}

function requestIp(request: Request): string | null {
  const value = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || null;
  if (!value || !/^[0-9a-f:.]+$/i.test(value)) return null;
  return value;
}
