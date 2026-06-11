import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

export const runtime = "nodejs";
export const maxDuration = 900;

type ManualReportType = "monthly" | "advanced" | "biweekly";

const MANUAL_REPORTS: Record<
  ManualReportType,
  {
    label: string;
    reportType: string;
    scheduleDay: number;
  }
> = {
  monthly: {
    label: "Monthly Report",
    reportType: "monthlyOverall",
    scheduleDay: 7,
  },
  advanced: {
    label: "Advanced Report",
    reportType: "monthlyAdvanced",
    scheduleDay: 10,
  },
  biweekly: {
    label: "Bi-weekly Report",
    reportType: "biweeklyOverall",
    scheduleDay: 15,
  },
};

export async function POST(request: Request) {
  const body = (await safeReadJson(request)) as { reportType?: unknown } | null;
  const reportType = typeof body?.reportType === "string" ? body.reportType.trim() : "";

  if (!isManualReportType(reportType)) {
    return Response.json(
      {
        success: false,
        error: "Invalid reportType. Use monthly, advanced, or biweekly.",
      },
      { status: 400 }
    );
  }

  const config = MANUAL_REPORTS[reportType];
  const result = await runMonthlyReportJob({
    scheduleDay: config.scheduleDay,
    reportType: config.reportType,
    scheduledDate: resolveCanonicalScheduledDate(config.scheduleDay),
    dateRange: reportType === "biweekly" ? resolveCurrentMonthFirstHalfRange() : undefined,
    updateAccountSendStatus: true,
  });
  const message =
    result.checkedCount === 0
      ? `No checked accounts found for ${config.label}.`
      : result.failed > 0
        ? `${config.label} finished with ${result.failed} failed account(s).`
        : `${config.label} sending finished.`;

  return Response.json({
    success: true,
    ok: result.failed === 0,
    message,
    reportType,
    reportTypeLabel: config.label,
    totalCheckedAccounts: result.checkedCount,
    sentCount: result.emailed,
    skippedCount: result.skipped,
    failedCount: result.failed,
    warning: result.warning,
    details: result.accountResults.map((item) => ({
      accountName: item.accountName,
      email: item.email,
      status: item.status,
      notes: item.notes,
    })),
    result,
  });
}

function isManualReportType(value: string): value is ManualReportType {
  return value === "monthly" || value === "advanced" || value === "biweekly";
}

function resolveCanonicalScheduledDate(scheduleDay: number, referenceDate = new Date()): string {
  return [
    referenceDate.getUTCFullYear(),
    String(referenceDate.getUTCMonth() + 1).padStart(2, "0"),
    String(scheduleDay).padStart(2, "0"),
  ].join("-");
}

function resolveCurrentMonthFirstHalfRange(referenceDate = new Date()): {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month, 14));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    reportMonthKey: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    reportMonthLabel: `${new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start)} 1-14`,
  };
}

async function safeReadJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    return await request.json();
  } catch {
    return null;
  }
}
