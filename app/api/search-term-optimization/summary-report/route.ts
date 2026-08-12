import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { listSearchTermDecisionSummaryRows } from "@/lib/search-term-optimization/supabase-repository";
import { createAllAccountsDecisionSummaryPdf } from "@/lib/search-term-optimization/summary-pdf-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request:Request) {
  const session = await getServerAuthSession();
  if (!session || !["admin", "tl", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "Summary report access is required." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const date = searchParams.get("date")?.trim() ?? "";
  const startDate = searchParams.get("startDate")?.trim() ?? "";
  const endDate = searchParams.get("endDate")?.trim() ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

  if (date && (startDate || endDate)) {
    return NextResponse.json({ error: "Use either date or startDate/endDate, not both." }, { status: 400 });
  }
  if (date && !isDate(date)) return NextResponse.json({ error: "A valid report date is required." }, { status: 400 });
  if (startDate && !isDate(startDate)) return NextResponse.json({ error: "A valid start date is required." }, { status: 400 });
  if (endDate && !isDate(endDate)) return NextResponse.json({ error: "A valid end date is required." }, { status: 400 });
  if (startDate && endDate && startDate > endDate) return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });

  const rows = await listSearchTermDecisionSummaryRows(date ? { date } : { startDate: startDate || undefined, endDate: endDate || undefined });
  const formatMalaysiaDate = (value: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00+08:00`));
  const label = date
    ? formatMalaysiaDate(date)
    : startDate && endDate
      ? `${formatMalaysiaDate(startDate)} to ${formatMalaysiaDate(endDate)}`
      : startDate
        ? `from ${formatMalaysiaDate(startDate)}`
        : endDate
          ? `up to ${formatMalaysiaDate(endDate)}`
          : undefined;

  const pdf = createAllAccountsDecisionSummaryPdf(rows, label);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="search-term-decision-summary-${date || startDate || endDate || "all"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
