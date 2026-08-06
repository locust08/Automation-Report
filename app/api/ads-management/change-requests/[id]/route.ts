import { NextResponse } from "next/server";
import { getChangeSet, replaceDraftChanges } from "@/lib/ads-management/supabase";
import type { DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await getChangeSet((await params).id)); } catch (error) { return NextResponse.json({ error: msg(error) }, { status: 404 }); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const body = await request.json() as { version: number; actorName: string; reason?: string; changes: DraftChangeInput[]; editorContext?: DraftEditorContext }; return NextResponse.json(await replaceDraftChanges((await params).id, body.version, body.changes || [], body.actorName || "Unknown user", body.reason, body.editorContext)); } catch (error) { return NextResponse.json({ error: msg(error) }, { status: 409 }); } }
function msg(error: unknown) { return error instanceof Error ? error.message : "Change request failed."; }
