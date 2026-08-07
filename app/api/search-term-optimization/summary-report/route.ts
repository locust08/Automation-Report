import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { listSearchTermDecisionSummaryRows } from "@/lib/search-term-optimization/sqlite-repository";
import { createAllAccountsDecisionSummaryPdf } from "@/lib/search-term-optimization/summary-pdf-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || !["admin", "ethan", "tl", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "Summary report access is required." }, { status: 403 });
  }

  const pdf = createAllAccountsDecisionSummaryPdf(listSearchTermDecisionSummaryRows());
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="search-term-all-account-summary-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
