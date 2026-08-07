import { NextRequest, NextResponse } from "next/server";
import { createChangeSet, listAccountChangeSets } from "@/lib/ads-management/supabase";
import type { DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || ""; if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 }); return NextResponse.json({ requests: await listAccountChangeSets(accountId) }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); if (!canEditAds(session.role)) return NextResponse.json({ error: "Your role cannot create Google Ads change requests." }, { status: 403 }); const body = await request.json() as { accountId?: string; accountName?: string; title?: string; reason?: string; baselineCapturedAt?: string; changes?: DraftChangeInput[]; editorContext?: DraftEditorContext }; if (!body.accountId || !body.baselineCapturedAt) return NextResponse.json({ error: "accountId and baselineCapturedAt are required." }, { status: 400 }); return NextResponse.json(await createChangeSet({ accountId: body.accountId, accountName: body.accountName || `Account ${body.accountId}`, title: body.title || "Google Ads changes", reason: body.reason || "", creatorId: session.sub, creatorName: sessionDisplayName(session), baselineCapturedAt: body.baselineCapturedAt, changes: body.changes || [], editorContext: body.editorContext }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
function message(error: unknown) { return error instanceof Error ? error.message : "Workflow request failed."; }
