import { NextRequest, NextResponse } from "next/server";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";
import { retryChangeRequestVerification } from "@/lib/ads-management/service";
import { getChangeSet } from "@/lib/ads-management/supabase";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import { assertM01LivePilotAllowed, M01LivePilotLockedError } from "@/lib/traffic-quality/live-pilot";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Your role cannot retry verification." }, { status: 403 });
    const { id } = await params;
    assertM01LivePilotAllowed(await getChangeSet(id));
    return NextResponse.json(await retryChangeRequestVerification(id, workflowActorFromRequest(request, session)));
  } catch (error) {
    if (error instanceof M01LivePilotLockedError) return NextResponse.json({ error: error.code, message: error.message }, { status: 423 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification retry failed." }, { status: 400 });
  }
}
