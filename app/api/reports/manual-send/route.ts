import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_MONTHLY_REPORT_TEST_RECIPIENT = "amirulshahrul1775@gmail.com";

type ManualReportType = "monthly" | "advanced" | "biweekly";
type DeliveryMode = "test" | "live" | "dryRun";

interface CreateCloudflareReportJobRequest {
  sendEmail: boolean;
  forceTestMode: boolean;
  reportType: "overall" | "advanced";
  scheduledDate: string;
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
}

interface CreateCloudflareReportJobResponse {
  success: boolean;
  status?: string;
  jobId?: string;
  total?: number;
  skippedTotal?: number;
  skippedUnchecked?: number;
  skippedMissingEmail?: number;
  skippedAlreadySent?: number;
  error?: string;
  message?: string;
}

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
  const workerRequest = buildWorkerManualSendRequest(config, reportType);
  const workerResult = await createCloudflareReportJob(workerRequest);

  if (workerResult) {
    return Response.json({
      success: workerResult.success,
      ok: workerResult.success,
      message: workerResult.success
        ? `${config.label} job queued. PDFs and emails will be processed by Cloudflare; the completion report will be emailed when the job finishes.`
        : workerResult.error ?? `${config.label} job could not be queued.`,
      reportType,
      reportTypeLabel: config.label,
      totalCheckedAccounts: workerResult.total ?? 0,
      sentCount: 0,
      skippedCount: workerResult.skippedTotal ?? workerResult.skippedUnchecked ?? 0,
      failedCount: workerResult.success ? 0 : 1,
      testMode: false,
      dryRun: false,
      deliveryMode: "live" satisfies DeliveryMode,
      actualRecipientBehavior:
        "Live mode: checked accounts are queued and sent to their Notion recipient email addresses. Ava and the configured notification recipients receive the completion report.",
      confirmationCheckboxProperty: resolveConfirmationCheckboxLabel(reportType),
      checkedCount: workerResult.total ?? 0,
      resolvedAccountCount: workerResult.total ?? 0,
      notionRowsFetched: 0,
      targetSource: "cloudflare",
      warning: workerResult.success ? null : workerResult.error ?? null,
      details: [],
      result: workerResult,
    }, { status: workerResult.success ? 202 : 502 });
  }

  const forceTestMode = process.env.NODE_ENV !== "production";
  const result = await runMonthlyReportJob({
    scheduleDay: config.scheduleDay,
    reportType: config.reportType,
    scheduledDate: resolveCanonicalScheduledDate(config.scheduleDay),
    dateRange: reportType === "biweekly" ? resolveCurrentMonthFirstHalfRange() : undefined,
    forceTestMode,
    updateAccountSendStatus: true,
  });
  const deliveryMode = resolveDeliveryMode(result);
  const message = buildManualSendMessage(config.label, result, deliveryMode);

  return Response.json({
    success: result.failed === 0,
    ok: result.failed === 0,
    message,
    reportType,
    reportTypeLabel: config.label,
    totalCheckedAccounts: result.checkedCount,
    sentCount: result.emailed,
    skippedCount: result.skipped,
    failedCount: result.failed,
    testMode: result.testMode,
    dryRun: result.dryRun,
    deliveryMode,
    actualRecipientBehavior: buildActualRecipientBehavior(result, deliveryMode),
    confirmationCheckboxProperty: result.confirmationCheckboxProperty,
    checkedCount: result.checkedCount,
    resolvedAccountCount: result.resolvedAccountCount,
    notionRowsFetched: result.notionRowsFetched,
    targetSource: result.targetSource,
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

async function createCloudflareReportJob(
  body: CreateCloudflareReportJobRequest
): Promise<CreateCloudflareReportJobResponse | null> {
  const workerUrl = readOptionalEnv("MONTHLY_REPORT_WORKER_URL") ?? readOptionalEnv("REPORT_AUTOMATION_WORKER_URL");
  const workerSecret = readOptionalEnv("WORKER_API_SECRET");

  if (!workerUrl || !workerSecret) {
    return null;
  }

  const response = await fetch(`${workerUrl.replace(/\/+$/, "")}/report-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as CreateCloudflareReportJobResponse | null;

  if (!response.ok || !payload) {
    return {
      success: false,
      status: "error",
      error: payload?.error ?? `Cloudflare report job failed with HTTP ${response.status}.`,
    };
  }

  return payload;
}

function buildWorkerManualSendRequest(
  config: (typeof MANUAL_REPORTS)[ManualReportType],
  manualReportType: ManualReportType
): CreateCloudflareReportJobRequest {
  const range =
    manualReportType === "biweekly"
      ? resolveCurrentMonthFirstHalfRange()
      : resolvePreviousMonthRange();

  return {
    sendEmail: true,
    forceTestMode: false,
    reportType: manualReportType === "advanced" ? "advanced" : "overall",
    scheduledDate: resolveCanonicalScheduledDate(config.scheduleDay),
    ...range,
  };
}

function resolvePreviousMonthRange(referenceDate = new Date()): {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    reportMonthKey: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    reportMonthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}

function resolveConfirmationCheckboxLabel(reportType: ManualReportType): string {
  if (reportType === "advanced") {
    return "Advanced Report";
  }
  if (reportType === "biweekly") {
    return "Bi-weekly";
  }
  return "Monthly email";
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function resolveDeliveryMode(result: Awaited<ReturnType<typeof runMonthlyReportJob>>): DeliveryMode {
  if (result.dryRun) {
    return "dryRun";
  }
  return result.testMode ? "test" : "live";
}

function buildManualSendMessage(
  label: string,
  result: Awaited<ReturnType<typeof runMonthlyReportJob>>,
  deliveryMode: DeliveryMode
): string {
  if (result.failed > 0) {
    if (result.processed === 0 && result.warning) {
      return `${label} failed before sending: ${result.warning}`;
    }
    return deliveryMode === "test"
      ? `Test send failed for ${result.failed} account(s).`
      : `${label} finished with ${result.failed} failed account(s).`;
  }

  if (result.checkedCount === 0) {
    return `No checked accounts found for ${label}.`;
  }

  if (deliveryMode === "dryRun") {
    return `${label} dry run finished.`;
  }

  if (deliveryMode === "test") {
    return "Test send finished.";
  }

  return `${label} sending finished.`;
}

function buildActualRecipientBehavior(
  result: Awaited<ReturnType<typeof runMonthlyReportJob>>,
  deliveryMode: DeliveryMode
): string {
  if (deliveryMode === "dryRun") {
    return "Dry run only: PDFs may be generated, but no emails are sent.";
  }

  if (deliveryMode === "test") {
    const testRecipient =
      result.emailResults.find((item) => item.recipientEmail)?.recipientEmail ??
      (process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() ||
        DEFAULT_MONTHLY_REPORT_TEST_RECIPIENT);
    return `Test mode: only the first checked account is processed and email is sent to ${testRecipient}.`;
  }

  return "Live mode: checked accounts are sent to their Notion recipient email addresses.";
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
