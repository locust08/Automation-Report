import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { saveLivePlacementApproval, type LivePlacementReview } from "@/lib/traffic-quality/supabase-repository";
import { isWorkflowApprovalRequired } from "@/lib/workflow-settings/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "approver" && session.role !== "admin") return NextResponse.json({ error: "Only an approver can authorize placement exclusions." }, { status: 403 });
  if (!await isWorkflowApprovalRequired("placement_exclusion_approval")) return NextResponse.json({ error: "A separate placement approval is disabled in Workflow Settings." }, { status: 409 });
  const body = await request.json().catch(() => null) as { recommendationIds?: unknown; accountId?: unknown; placements?: unknown; decision?: unknown } | null;
  const recommendationIds = Array.isArray(body?.recommendationIds) ? body.recommendationIds.map(String) : [];
  const accountId = String(body?.accountId ?? "").replace(/\D/g, "");
  const placements = Array.isArray(body?.placements) ? body.placements as LivePlacementReview[] : [];
  if ((!recommendationIds.length && !placements.length) || !["approved", "rejected", "returned"].includes(String(body?.decision))) return NextResponse.json({ error: "Valid placement decisions are required." }, { status: 400 });
  try {
    return NextResponse.json(await saveLivePlacementApproval({ recommendationIds, accountId, placements, decision: body?.decision as "approved" | "rejected" | "returned", actor: { id: session.sub, email: session.email, role: session.role } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save placement approval." }, { status: 409 });
  }
}
