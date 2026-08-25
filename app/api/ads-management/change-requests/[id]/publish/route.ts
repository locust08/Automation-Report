import { NextRequest, NextResponse } from "next/server";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";
import { publishChangeRequest } from "@/lib/ads-management/service";
import { getChangeSet } from "@/lib/ads-management/supabase";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import { assertM01LivePilotAllowed, M01LivePilotLockedError } from "@/lib/traffic-quality/live-pilot";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can publish Google Ads changes." }, { status: 403 });
    const { id } = await params;
    assertM01LivePilotAllowed(await getChangeSet(id));
    const body = await request.json().catch(() => ({})) as { completionMessage?: string };
    return NextResponse.json(await publishChangeRequest(id, workflowActorFromRequest(request, session), body.completionMessage));
  } catch (error) {
    if (error instanceof M01LivePilotLockedError) return NextResponse.json({ error: error.code, message: error.message }, { status: 423 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing failed." }, { status: 400 });
  }
}
