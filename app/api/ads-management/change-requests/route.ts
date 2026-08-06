import { NextResponse } from "next/server";
import { createChangeSet, listAccountChangeSets } from "@/lib/ads-management/supabase";
import type { DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || ""; if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 }); return NextResponse.json({ requests: await listAccountChangeSets(accountId) }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const body = await request.json() as { accountId?: string; accountName?: string; title?: string; reason?: string; creatorName?: string; baselineCapturedAt?: string; changes?: DraftChangeInput[]; editorContext?: DraftEditorContext }; if (!body.accountId || !body.creatorName || !body.baselineCapturedAt) return NextResponse.json({ error: "accountId, creatorName, and baselineCapturedAt are required." }, { status: 400 }); return NextResponse.json(await createChangeSet({ accountId: body.accountId, accountName: body.accountName || `Account ${body.accountId}`, title: body.title || "Google Ads changes", reason: body.reason || "", creatorName: body.creatorName, baselineCapturedAt: body.baselineCapturedAt, changes: body.changes || [], editorContext: body.editorContext }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
function message(error: unknown) { return error instanceof Error ? error.message : "Workflow request failed."; }
