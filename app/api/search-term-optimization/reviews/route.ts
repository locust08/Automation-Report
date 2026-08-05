import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { saveSpecialistDecision, type SpecialistDecision } from "@/lib/search-term-optimization/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_ROLES = new Set(["pms", "specialist", "admin"]);

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REVIEW_ROLES.has(session.role)) {
    return NextResponse.json({ error: "Your role cannot review search terms." }, { status: 403 });
  }

  const body = await request.json() as { recommendationIds?: unknown; decision?: unknown };
  const recommendationIds = Array.isArray(body.recommendationIds)
    ? [...new Set(body.recommendationIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    : [];
  const decision = body.decision as SpecialistDecision;
  if (recommendationIds.length === 0 || !["approved", "rejected", "to_be_determined"].includes(decision)) {
    return NextResponse.json({ error: "Valid recommendation IDs and decision are required." }, { status: 400 });
  }

  try {
    return NextResponse.json(saveSpecialistDecision({
      recommendationIds,
      decision,
      reviewer: { id: session.sub, email: session.email, role: session.role },
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the specialist decision." },
      { status: 500 },
    );
  }
}
