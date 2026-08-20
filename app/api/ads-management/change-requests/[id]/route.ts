import { NextRequest, NextResponse } from "next/server";
import { getChangeSet, replaceDraftChanges } from "@/lib/ads-management/supabase";
import type { ChangeEvidence, DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); return NextResponse.json(await getChangeSet((await params).id)); } catch (error) { return NextResponse.json({ error: msg(error) }, { status: 404 }); } }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can edit Google Ads change requests." }, { status: 403 }); const body = await request.json() as { version: number; reason?: string; evidence?: ChangeEvidence; changes: DraftChangeInput[]; editorContext?: DraftEditorContext }; return NextResponse.json(await replaceDraftChanges((await params).id, body.version, body.changes || [], sessionDisplayName(session), session.sub, body.reason, body.evidence, body.editorContext)); } catch (error) { return NextResponse.json({ error: msg(error) }, { status: 409 }); } }
function msg(error: unknown) { return error instanceof Error ? error.message : "Change request failed."; }
