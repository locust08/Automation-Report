import { NextRequest, NextResponse } from "next/server";
import { retryChangeRequestVerification } from "@/lib/ads-management/service";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Your role cannot retry verification." }, { status: 403 });
    return NextResponse.json(await retryChangeRequestVerification((await params).id, workflowActorFromRequest(request, session)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification retry failed." }, { status: 400 });
  }
}
