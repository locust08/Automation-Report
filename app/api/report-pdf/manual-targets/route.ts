import { POST as resolveScheduledTargets } from "@/app/api/report-pdf/targets/route";

const MANUAL_REPORT_DAYS = {
  monthlyOverall: 7,
  monthlyAdvanced: 10,
  biweeklyOverall: 15,
} as const;

type ManualReportType = keyof typeof MANUAL_REPORT_DAYS;

export async function POST(request: Request): Promise<Response> {
  const body = await safeReadJson(request);
  const reportType = typeof body?.reportType === "string" ? body.reportType.trim() : "";

  if (!isManualReportType(reportType)) {
    return Response.json(
      {
        success: false,
        error: "Invalid reportType. Use monthlyOverall, monthlyAdvanced, or biweeklyOverall.",
      },
      { status: 400 }
    );
  }

  return resolveScheduledTargets(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        ...body,
        reportType,
        scheduleDay: MANUAL_REPORT_DAYS[reportType],
      }),
    })
  );
}

function isManualReportType(value: string): value is ManualReportType {
  return value in MANUAL_REPORT_DAYS;
}

async function safeReadJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
