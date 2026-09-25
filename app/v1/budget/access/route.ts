import { NextResponse } from "next/server";
import { authenticateBudget, verifyBudgetGrant } from "@/lib/budget/digitalbee-auth";
import { budgetAccess } from "@/lib/budget/evidence";
import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const scope = await authenticateBudget(request);
    await verifyBudgetGrant(scope, "budget_access");
    const result = await budgetAccess(scope);
    await verifyBudgetGrant(scope, "budget_access");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DigitalBeeServiceError ? error.status : 503;
    return NextResponse.json({ error: "access_unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
