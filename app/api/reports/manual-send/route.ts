export const runtime = "nodejs";
export const maxDuration = 300;

type ManualReportType = "monthly" | "advanced" | "biweekly";

interface CreateCloudflareReportJobRequest {
  sendEmail: boolean;
  forceTestMode: boolean;
  reportType: "overall" | "advanced";
  manualReportType: "monthlyOverall" | "monthlyAdvanced" | "biweeklyOverall";
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
  createdAt?: string;
  reusedActiveJob?: boolean;
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
  const jobQueued = workerResult.success && Boolean(workerResult.jobId);
  const skippedAlreadySent = workerResult.skippedAlreadySent ?? 0;
  const skippedCount = workerResult.skippedTotal ??
    (workerResult.skippedUnchecked ?? 0) +
      (workerResult.skippedMissingEmail ?? 0) +
      skippedAlreadySent;
  const noNewReports = workerResult.success && !jobQueued;
  const message = !workerResult.success
    ? workerResult.error ?? `${config.label} job could not be queued.`
    : jobQueued
      ? `${config.label} job queued. PDFs and emails will be processed by Cloudflare; the completion report will be emailed when the job finishes.`
      : skippedAlreadySent > 0
        ? `No new ${config.label.toLowerCase()} emails were queued. ${skippedAlreadySent} account${skippedAlreadySent === 1 ? " was" : "s were"} already sent for this reporting period.`
        : `No new ${config.label.toLowerCase()} emails were queued because no eligible unsent accounts were found.`;

  return Response.json({
      success: workerResult.success,
      ok: workerResult.success,
      message,
      reportType,
      jobId: workerResult.jobId ?? null,
      status: workerResult.status ?? (noNewReports ? "skipped" : null),
      createdAt: workerResult.createdAt ?? null,
      reusedActiveJob: Boolean(workerResult.reusedActiveJob),
      reportTypeLabel: config.label,
      totalCheckedAccounts: workerResult.total ?? 0,
      sentCount: 0,
      skippedCount,
      failedCount: workerResult.success ? 0 : 1,
      testMode: false,
      dryRun: false,
      deliveryMode: "live",
      actualRecipientBehavior: jobQueued
        ? "Live mode: checked accounts are queued and sent to their Notion recipient email addresses. Ava and the configured notification recipients receive the completion report."
        : "No email job was created. Accounts already delivered for this reporting period remain protected from duplicate sends.",
      confirmationCheckboxProperty: resolveConfirmationCheckboxLabel(reportType),
      checkedCount: workerResult.total ?? 0,
      resolvedAccountCount: workerResult.total ?? 0,
      notionRowsFetched: 0,
      targetSource: "cloudflare",
      warning: workerResult.success ? null : workerResult.error ?? null,
      details: [],
      result: workerResult,
    }, { status: workerResult.success ? (jobQueued ? 202 : 200) : 503 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";
  const reportType = url.searchParams.get("reportType")?.trim() ?? "";
  const workerUrl = readOptionalEnv("MONTHLY_REPORT_WORKER_URL") ?? readOptionalEnv("REPORT_AUTOMATION_WORKER_URL");
  const workerSecret = readOptionalEnv("WORKER_API_SECRET");

  if (!workerUrl || !workerSecret) {
    return Response.json(
      {
        success: false,
        available: false,
        error: "Live bulk sending is unavailable: MONTHLY_REPORT_WORKER_URL and WORKER_API_SECRET must be configured.",
      },
      { status: 503 }
    );
  }

  let endpoint: string;
  if (jobId) {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return Response.json({ success: false, error: "Invalid report job ID." }, { status: 400 });
    }
    endpoint = `${workerUrl.replace(/\/+$/, "")}/report-jobs/${encodeURIComponent(jobId)}`;
  } else {
    if (!isManualReportType(reportType)) {
      return Response.json({ success: false, error: "A valid reportType is required." }, { status: 400 });
    }
    const config = MANUAL_REPORTS[reportType];
    const range = reportType === "biweekly" ? resolveCurrentMonthFirstHalfRange() : resolvePreviousMonthRange();
    const params = new URLSearchParams({
      reportType: config.reportType,
      reportMonthKey: range.reportMonthKey,
    });
    endpoint = `${workerUrl.replace(/\/+$/, "")}/report-jobs/active?${params}`;
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${workerSecret}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    return Response.json(
      { success: false, error: `Unable to read Worker status (HTTP ${response.status}).` },
      { status: response.status || 502 }
    );
  }
  return Response.json({ available: true, ...payload });
}

async function createCloudflareReportJob(
  body: CreateCloudflareReportJobRequest
): Promise<CreateCloudflareReportJobResponse> {
  const workerUrl = readOptionalEnv("MONTHLY_REPORT_WORKER_URL") ?? readOptionalEnv("REPORT_AUTOMATION_WORKER_URL");
  const workerSecret = readOptionalEnv("WORKER_API_SECRET");

  if (!workerUrl || !workerSecret) {
    return {
      success: false,
      status: "configuration_error",
      error: "Live bulk sending is unavailable: MONTHLY_REPORT_WORKER_URL and WORKER_API_SECRET must be configured.",
    };
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
    manualReportType: config.reportType as CreateCloudflareReportJobRequest["manualReportType"],
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
