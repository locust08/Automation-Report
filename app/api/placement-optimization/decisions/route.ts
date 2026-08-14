import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { isAdminRole } from "@/lib/auth/roles";
import { publishPlacementExclusions } from "@/lib/optimization/google-ads-mutations";
import { exclusionKey, existingPlacementExclusionKeys, savePublishedPlacementExclusions, type ExclusionInput } from "@/lib/placement-optimization/exclusion-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "co" && !isAdminRole(session.role)) return NextResponse.json({ error: "Only a Campaign Optimizer can exclude placements." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { accountId?: unknown; startDate?: unknown; endDate?: unknown; decision?: unknown; placements?: unknown };
  const accountId = String(body.accountId ?? "").replace(/\D/g, "");
  const placements = Array.isArray(body.placements) ? body.placements.filter(isPlacementInput).slice(0, 100) : [];
  if (accountId.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.endDate)) || body.decision !== "exclude" || !placements.length) return NextResponse.json({ error: "Valid live placements and reporting dates are required." }, { status: 400 });
  try {
    const existing = await existingPlacementExclusionKeys(accountId);
    const publishable = placements.filter(row => !existing.has(exclusionKey(row.campaignId!, row.placementType, row.placement)));
    if (!publishable.length) return NextResponse.json({ published: 0, deduplicated: placements.length, decision: "exclude", status: "published", reviewerRole: session.role });
    const publication = await publishPlacementExclusions(accountId, publishable.map(row => ({ campaignId: row.campaignId!, placement: row.placement, placementType: row.placementType })));
    const saved = await savePublishedPlacementExclusions({ customerId: accountId, startDate: String(body.startDate), endDate: String(body.endDate), reviewer: { id: session.sub, role: session.role }, placements: publishable, resourceNames: publication.resourceNames });
    return NextResponse.json({ ...saved, deduplicated: placements.length-publishable.length, decision: "exclude", status: "published", reviewerRole: session.role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to publish placement exclusions." }, { status: 409 });
  }
}

function isPlacementInput(value: unknown): value is ExclusionInput {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ExclusionInput>;
  return typeof row.placement === "string" && row.placement.length > 0 && typeof row.placementType === "string" && row.placementType.length > 0 && typeof row.campaignId === "string" && /^\d+$/.test(row.campaignId) && typeof row.campaignName === "string" && typeof row.campaignType === "string";
}

export async function DELETE() {
  return NextResponse.json({ error: "Published placement exclusions are permanent history and cannot be removed here." }, { status: 405 });
}
