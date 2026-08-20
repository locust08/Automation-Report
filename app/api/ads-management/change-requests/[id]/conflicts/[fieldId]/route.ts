import { NextRequest, NextResponse } from "next/server";
import { resolveConflict } from "@/lib/ads-management/service";
import { workflowActorFromRequest } from "@/lib/ads-management/request-actor";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) { try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can resolve Google Ads conflicts." }, { status: 403 }); const body = await request.json() as { resolution?: string; newValue?: unknown }; const routeParams = await params; return NextResponse.json(await resolveConflict(routeParams.id, routeParams.fieldId, body.resolution || "", workflowActorFromRequest(request, session), body.newValue)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Conflict resolution failed." }, { status: 400 }); } }
