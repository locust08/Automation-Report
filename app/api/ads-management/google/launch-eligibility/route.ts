import { NextRequest, NextResponse } from "next/server";
import { adoptLegacyCampaign, getLaunchEligibility } from "@/lib/ads-management/supabase";
import { assertReviewContext } from "@/lib/ads-management/change-control";
import type { ChangeEvidence } from "@/lib/ads-management/types";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const search = new URL(request.url).searchParams;
    const accountId = search.get("accountId")?.trim() ?? "";
    const campaignId = search.get("campaignId")?.trim() ?? "";
    if (!accountId || !campaignId) return NextResponse.json({ error: "accountId and campaignId are required." }, { status: 400 });
    return NextResponse.json(await getLaunchEligibility(accountId, campaignId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Eligibility lookup failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can authorize legacy adoption." }, { status: 403 });
    const body = await request.json() as { accountId?: string; campaignId?: string; campaignName?: string; reason?: string; evidence?: ChangeEvidence };
    if (!body.accountId || !body.campaignId || !body.campaignName) return NextResponse.json({ error: "accountId, campaignId, and campaignName are required." }, { status: 400 });
    const evidence = body.evidence ?? { summary: "" };
    assertReviewContext(body.reason ?? "", evidence);
    await adoptLegacyCampaign({ accountId: body.accountId, campaignId: body.campaignId, campaignName: body.campaignName, reason: body.reason ?? "", evidence, actorId: session.sub, actorName: sessionDisplayName(session) });
    return NextResponse.json(await getLaunchEligibility(body.accountId, body.campaignId), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Legacy adoption failed." }, { status: 400 });
  }
}
