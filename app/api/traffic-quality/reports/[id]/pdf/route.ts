import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { createTrafficQualityReportPdf, type TrafficQualityReportSnapshot } from "@/lib/traffic-quality/pdf-report";
import { getTrafficQualityReport } from "@/lib/traffic-quality/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.string().uuid().safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "A valid report ID is required." }, { status: 400 });
  const report = await getTrafficQualityReport(parsed.data);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  const pdf = createTrafficQualityReportPdf(report.report_snapshot as TrafficQualityReportSnapshot);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="traffic-quality-${parsed.data}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
