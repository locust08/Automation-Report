import { NextRequest, NextResponse } from "next/server";
import { createRollbackChangeRequest } from "@/lib/ads-management/service";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import type { ChangeEvidence } from "@/lib/ads-management/types";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can create rollbacks." }, { status: 403 });
    const body = await request.json() as { reason?: string; evidence?: ChangeEvidence };
    return NextResponse.json(await createRollbackChangeRequest((await params).id, workflowActorFromRequest(request, session), body.reason ?? "", body.evidence ?? { summary: "" }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rollback creation failed." }, { status: 400 });
  }
}
