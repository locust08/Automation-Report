import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { saveLivePlacementReviews, type LivePlacementReview } from "@/lib/traffic-quality/supabase-repository";
import { isWorkflowApprovalRequired } from "@/lib/workflow-settings/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pms", "specialist", "co", "approver", "tl", "pm", "admin"].includes(session.role)) return NextResponse.json({ error: "Your role cannot review placements." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { accountId?: unknown; accountName?: unknown; startDate?: unknown; endDate?: unknown; decision?: unknown; comment?: unknown; placements?: unknown };
  const accountId = String(body.accountId ?? "").replace(/\D/g, "");
  const placements = Array.isArray(body.placements) ? body.placements.filter(isPlacementInput).slice(0, 100) : [];
  if (body.decision === "add_agency_risk" && !["tl", "approver", "admin"].includes(session.role)) return NextResponse.json({ error: "Only an authorised team lead or administrator can add an agency placement risk." }, { status: 403 });
  if (accountId.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.endDate)) || !["exclude", "keep", "reject", "kiv", "request_pm_feedback", "request_client_feedback", "add_agency_risk"].includes(String(body.decision)) || !placements.length) return NextResponse.json({ error: "Valid live placements, decision, and reporting dates are required." }, { status: 400 });
  try {
    return NextResponse.json(await saveLivePlacementReviews({ accountId, accountName: String(body.accountName || `Google Ads ${accountId}`), placements, action: String(body.decision) as Parameters<typeof saveLivePlacementReviews>[0]["action"], comment: typeof body.comment === "string" ? body.comment : undefined, actor: { id: session.sub, email: session.email, role: session.role }, approvalRequired: await isWorkflowApprovalRequired("placement_exclusion_approval") }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save placement decisions." }, { status: 409 });
  }
}

function isPlacementInput(value: unknown): value is LivePlacementReview {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LivePlacementReview>;
  return typeof row.placement === "string" && row.placement.length > 0 && typeof row.placementType === "string" && row.placementType.length > 0 && typeof row.campaignId === "string" && /^\d+$/.test(row.campaignId) && typeof row.campaignName === "string" && typeof row.campaignType === "string";
}

export async function DELETE() {
  return NextResponse.json({ error: "Traffic-quality decision events are immutable." }, { status: 405 });
}
