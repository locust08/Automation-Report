import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { isAdminRole } from "@/lib/auth/roles";
import { savePlacementApproverDecision } from "@/lib/placement-optimization/supabase-repository";
import type { PlacementApproverDecision } from "@/lib/placement-optimization/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "approver" && !isAdminRole(session.role)) return NextResponse.json({ error: "Only an approver can authorize placement exclusions." }, { status: 403 });
  const body = await request.json() as { recommendationIds?: unknown; decision?: unknown };
  const ids = Array.isArray(body.recommendationIds) ? [...new Set(body.recommendationIds.map(String).filter((id) => /^\d+:\d+$/.test(id)))] : [];
  const decision = body.decision as PlacementApproverDecision;
  if (!ids.length || !["approved", "rejected", "returned"].includes(decision)) return NextResponse.json({ error: "Valid placement IDs and decision are required." }, { status: 400 });
  if (ids.length > 100) return NextResponse.json({ error: "Select no more than 100 placements at a time." }, { status: 400 });
  try {
    return NextResponse.json(await savePlacementApproverDecision({ recommendationIds: ids, decision, reviewer: { id: session.sub, email: session.email, role: session.role } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save approval." }, { status: 409 });
  }
}
