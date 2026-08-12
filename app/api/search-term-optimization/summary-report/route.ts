import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { listSearchTermDecisionSummaryRows } from "@/lib/search-term-optimization/supabase-repository";
import { createAllAccountsDecisionSummaryPdf } from "@/lib/search-term-optimization/summary-pdf-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request:Request) {
  const session = await getServerAuthSession();
  if (!session || !["admin", "ethan", "tl", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "Summary report access is required." }, { status: 403 });
  }

  const date=new URL(request.url).searchParams.get("date")?.trim()??"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`)))return NextResponse.json({error:"A valid report date is required."},{status:400});
  const pdf = createAllAccountsDecisionSummaryPdf(await listSearchTermDecisionSummaryRows(date),date);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="search-term-decision-summary-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
