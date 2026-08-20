import { NextRequest, NextResponse } from "next/server";
import { retryFailedChangeRequestItems } from "@/lib/ads-management/service";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can retry Google Ads changes." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { completionMessage?: string };
    return NextResponse.json(await retryFailedChangeRequestItems((await params).id, workflowActorFromRequest(request, session), body.completionMessage));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish retry failed." }, { status: 400 });
  }
}
