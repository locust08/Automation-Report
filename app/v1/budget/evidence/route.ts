import { NextResponse } from "next/server";
import { authenticateBudget, verifyBudgetGrant } from "@/lib/budget/digitalbee-auth";
import { budgetEvidence } from "@/lib/budget/evidence";
import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const scope = await authenticateBudget(request);
    await verifyBudgetGrant(scope, "budget_evidence");
    const result = await budgetEvidence(scope, new URL(request.url).searchParams);
    await verifyBudgetGrant(scope, "budget_evidence");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DigitalBeeServiceError ? error.status : 503;
    return NextResponse.json({ error: "evidence_unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
