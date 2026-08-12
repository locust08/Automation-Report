import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { saveSpecialistDecision, type SpecialistDecision } from "@/lib/search-term-optimization/supabase-repository";

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
    ? [...new Set(body.recommendationIds.map(String).filter((id) => /^\d+:\d+$/.test(id)))]
    : [];
  const decision = body.decision as SpecialistDecision;
  if (recommendationIds.length === 0 || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Valid recommendation IDs and decision are required." }, { status: 400 });
  }
  if (recommendationIds.length > 100) {
    return NextResponse.json({ error: "Select no more than 100 search terms at a time." }, { status: 400 });
  }

  try {
    return NextResponse.json(await saveSpecialistDecision({
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
