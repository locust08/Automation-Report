import { NextRequest, NextResponse } from "next/server";
import { createChangeSet, listAccountChangeSets, listEditableAccountChangeSets } from "@/lib/ads-management/supabase";
import { getLaunchEligibility } from "@/lib/ads-management/supabase";
import type { ChangeEvidence, DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const searchParams = new URL(request.url).searchParams; const accountId = searchParams.get("accountId")?.trim() || ""; if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 }); const requests = searchParams.get("editable") === "true" ? await listEditableAccountChangeSets(accountId, session.sub) : await listAccountChangeSets(accountId); return NextResponse.json({ requests }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const session = await authSessionFromRequest(request); if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can create Google Ads change requests." }, { status: 403 }); const body = await request.json() as { accountId?: string; accountName?: string; campaignId?: string; title?: string; reason?: string; evidence?: ChangeEvidence; baselineCapturedAt?: string; changes?: DraftChangeInput[]; editorContext?: DraftEditorContext }; if (!body.accountId || !body.campaignId || !body.baselineCapturedAt) return NextResponse.json({ error: "accountId, campaignId, and baselineCapturedAt are required." }, { status: 400 }); const eligibility = await getLaunchEligibility(body.accountId, body.campaignId); if (!eligibility.eligible) return NextResponse.json({ error: "Campaign is not eligible for post-launch editing. Verify its Module 4 launch or authorize legacy adoption first.", eligibility }, { status: 409 }); return NextResponse.json(await createChangeSet({ accountId: body.accountId, accountName: body.accountName || `Account ${body.accountId}`, campaignId: body.campaignId, title: body.title || "Google Ads changes", reason: body.reason || "", evidence: body.evidence ?? { summary: "" }, creatorId: session.sub, creatorName: sessionDisplayName(session), baselineCapturedAt: body.baselineCapturedAt, changes: body.changes || [], editorContext: body.editorContext }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
function message(error: unknown) { return error instanceof Error ? error.message : "Workflow request failed."; }
