import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { createSearchTermPmReportPdf } from "@/lib/search-term-pm-reports/pdf-report";
import { getSearchTermPmReport } from "@/lib/search-term-pm-reports/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pm", "admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Project Manager access is required." }, { status: 403 });
  const { reportId } = await context.params;
  const report = getSearchTermPmReport(Number(reportId));
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const filename = `search-term-pm-report-${report.googleCustomerId}-${report.id}.pdf`;
  const pdf = createSearchTermPmReportPdf(report);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
