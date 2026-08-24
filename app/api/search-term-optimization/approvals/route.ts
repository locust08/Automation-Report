import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { saveApproverDecision, type ApproverDecision } from "@/lib/search-term-optimization/supabase-repository";
import { isWorkflowApprovalRequired } from "@/lib/workflow-settings/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "approver" && session.role !== "admin") {
    return NextResponse.json({ error: "Only an approver can authorize change sets." }, { status: 403 });
  }
  if (!await isWorkflowApprovalRequired("search_term_approval")) {
    return NextResponse.json({ error: "A separate search-term approval is disabled in Workflow Settings." }, { status: 409 });
  }

  const body = await request.json() as { recommendationIds?: unknown; decision?: unknown };
  const recommendationIds = Array.isArray(body.recommendationIds)
    ? [...new Set(body.recommendationIds.map(String).filter((id) => /^(?:\d+:\d+|rel:\d+)$/.test(id)))]
    : [];
  const decision = body.decision as ApproverDecision;
  if (recommendationIds.length === 0 || !["accepted", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Valid recommendation IDs and an approver decision are required." }, { status: 400 });
  }

  try {
    return NextResponse.json(await saveApproverDecision({
      recommendationIds,
      decision,
      approver: { id: session.sub, email: session.email, role: session.role },
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the approver decision." },
      { status: 409 },
    );
  }
}
