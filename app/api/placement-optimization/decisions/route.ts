import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { isAdminRole } from "@/lib/auth/roles";
import { clearPlacementDecision, saveOptimizerDecision, savePlacementApproverDecision } from "@/lib/placement-optimization/supabase-repository";
import type { PlacementDecision } from "@/lib/placement-optimization/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "co" && !isAdminRole(session.role)) return NextResponse.json({ error: "Only a Campaign Optimizer can review placements." }, { status: 403 });
  const body = await request.json() as { recommendationIds?: unknown; decision?: unknown };
  const ids = Array.isArray(body.recommendationIds) ? [...new Set(body.recommendationIds.map(String).filter((id) => /^\d+:\d+$/.test(id)))] : [];
  const decision = body.decision as PlacementDecision;
  if (!ids.length || !["exclude", "keep", "kiv"].includes(decision)) return NextResponse.json({ error: "Valid placement IDs and decision are required." }, { status: 400 });
  if (ids.length > 100) return NextResponse.json({ error: "Select no more than 100 placements at a time." }, { status: 400 });
  try {
    if (decision === "exclude") {
      const result = await savePlacementApproverDecision({ recommendationIds: ids, decision: "approved", reviewer: { id: session.sub, email: session.email, role: session.role } });
      return NextResponse.json({
        ...result,
        decision,
        status: "published",
        reviewerEmail: session.email,
        reviewerRole: session.role,
        createdAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({
      ...await saveOptimizerDecision({ recommendationIds: ids, decision, reviewer: { id: session.sub, email: session.email, role: session.role } }),
      decision,
      status: decision === "keep" ? "kept" : "kiv",
      reviewerEmail: session.email,
      reviewerRole: session.role,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save decision." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "co" && session.role !== "approver" && !isAdminRole(session.role)) return NextResponse.json({ error: "Your role cannot remove placement decisions." }, { status: 403 });
  const body = await request.json() as { recommendationIds?: unknown };
  const ids = Array.isArray(body.recommendationIds) ? [...new Set(body.recommendationIds.map(String).filter((id) => /^\d+:\d+$/.test(id)))] : [];
  if (!ids.length) return NextResponse.json({ error: "Valid placement IDs are required." }, { status: 400 });
  try {
    return NextResponse.json({
      ...await clearPlacementDecision({ recommendationIds: ids, reviewer: { id: session.sub, email: session.email, role: session.role } }),
      status: "pending_optimizer",
      reviewerEmail: session.email,
      reviewerRole: session.role,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove the placement decision." }, { status: 409 });
  }
}
