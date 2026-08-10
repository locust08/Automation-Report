import puppeteer from "@cloudflare/puppeteer";
import type { BrowserWorker, Page } from "@cloudflare/puppeteer";

interface Env {
  REPORT_JOBS_DB: D1Database;
  REPORT_PDFS: R2Bucket;
  MONTHLY_REPORT_QUEUE: Queue<ReportQueueMessage>;
  REPORT_BROWSER: BrowserWorker;
  BROWSER_LAUNCH_LIMITER: DurableObjectNamespace;
  REPORT_AUTOMATION_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM_MONTHLY_REPORT?: string;
  VERCEL_APP_BASE_URL: string;
  VERCEL_REPORT_TARGETS_ENDPOINT?: string;
  NOTION_TOKEN?: string;
  NOTION_DATABASE_ID?: string;
  NOTION_AD_ACCOUNTS_DATABASE_ID?: string;
  WORKER_API_SECRET?: string;
  MONTHLY_REPORT_TEST_RECIPIENT?: string;
  REPORT_EMAIL_DELIVERY_MODE?: "attachment" | "link";
  REPORT_EMAIL_LOGO_URL?: string;
  REPORT_DOWNLOAD_BASE_URL?: string;
  BROWSER_LAUNCH_SPACING_MS?: string;
  REPORT_COMPLETION_NOTIFICATION_TO?: string;
  REPORT_COMPLETION_NOTIFICATION_CC?: string;
  ADVANCED_REPORT_ENABLED?: string;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  type: "scheduled";
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface MessageBatch<T> {
  messages: Array<Message<T>>;
}

interface Message<T> {
  body: T;
  ack(): void;
  retry(): void;
}

interface Queue<T> {
  send(message: T): Promise<void>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

type DurableObjectId = object;

interface DurableObjectStub {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: unknown;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: R2PutOptions): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentDisposition?: string;
  };
  customMetadata?: Record<string, string>;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: {
    contentType?: string;
    contentDisposition?: string;
  };
  customMetadata?: Record<string, string>;
}

interface ReportTarget {
  notionPageId?: string | null;
  clientName: string;
  googleAccountId?: string | null;
  metaAccountId?: string | null;
  recipientEmail?: string | null;
  ccEmail?: string | null;
  platform?: string | null;
  reportType?: string | null;
  country?: string | null;
  monthlyEmailEnabled?: boolean | null;
}

interface ReportSectionTarget extends ReportTarget {
  sectionLabel: string;
}

interface CreateJobRequest {
  accounts?: ReportTarget[];
  forceTestMode?: boolean;
  sendEmail?: boolean;
  reportType?: string | null;
  manualReportType?: "monthlyOverall" | "monthlyAdvanced" | "biweeklyOverall" | null;
  country?: string | null;
  scheduledDate?: string;
  scheduledTime?: string;
  startDate?: string;
  endDate?: string;
  reportMonthKey?: string;
  reportMonthLabel?: string;
}

interface ReportQueueMessage {
  jobId: string;
  itemId: string;
  target: ReportTarget;
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
  sendEmail: boolean;
  testMode: boolean;
  force?: boolean;
}

interface JobRow {
  id: string;
  status: string;
  report_type: string;
  report_month_key: string;
  report_month_label: string;
  start_date: string;
  end_date: string;
  total_items: number;
  send_email: number;
  test_mode: number;
  failure_alert_sent_at: string | null;
  failure_alert_resend_email_id: string | null;
  completion_notification_sent_at: string | null;
  completion_notification_resend_email_id: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface JobItemRow {
  id: string;
  job_id: string;
  status: string;
  client_name: string;
  platform: string | null;
  report_type: string | null;
  country: string | null;
  idempotency_key: string | null;
  google_account_id: string | null;
  meta_account_id: string | null;
  recipient_email: string | null;
  cc_email: string | null;
  attempts: number;
  r2_key: string | null;
  report_url: string | null;
  resend_email_id: string | null;
  error_message: string | null;
  updated_at: string;
}

const SERVICE_NAME = "ads-dashboard-monthly-report-automation";
const MONTHLY_OVERALL_CRON = "0 4 7 * *";
const BIWEEKLY_OVERALL_CRON = "0 4 15 * *";
const MONTHLY_ADVANCED_CRON = "0 4 10 * *";
const PRODUCTION_CRON = "0 4 7,10,15 * *";
const TEST_RECIPIENT_FALLBACK = "eason@locus-t.com.my";
const NOTION_API_VERSION = "2026-03-11";
const BROWSER_LAUNCH_LIMITER_NAME = "global-browser-launch-limiter";
const DEFAULT_BROWSER_LAUNCH_SPACING_MS = 20000;
const BROWSER_RATE_LIMIT_RETRY_MS = 60000;
const BROWSER_RATE_LIMIT_RETRY_JITTER_MS = 15000;
const BROWSER_SESSION_RETRY_ATTEMPTS = 3;
const BROWSER_SESSION_RETRY_BASE_MS = 20000;
const BROWSER_SESSION_RETRY_JITTER_MS = 10000;
const REPORT_ITEM_FINAL_FAILURE_ATTEMPTS = 6;
const ADVANCED_REPORT_READY_TIMEOUT_MS = 8 * 60 * 1000;
const ADVANCED_REPORT_READY_POLL_MS = 5000;
const EMAIL_SAFE_PDF_SIZE_BYTES = 35 * 1024 * 1024;
const DEFAULT_COMPLETION_NOTIFICATION_TO = ["waiing@locus-t.com.my"];
const DEFAULT_COMPLETION_NOTIFICATION_CC = ["eason@locus-t.com.my", "ava@locus-t.com.my"];
const DEFAULT_FROM_ADDRESS = "LOCUS-T Reports <reports@locus-t.com.my>";
const DEFAULT_EMAIL_LOGO_URL = "https://www.locus-t.com.my/wp-content/uploads/2024/09/LT-Logo-25.svg";

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const scheduledJob = resolveScheduledJob(controller);
    const scheduledTime = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      createReportJob(
        env,
        {
          ...scheduledJob.input,
          scheduledTime,
        },
        {
          source: "scheduled",
          scheduleDay: String(new Date(controller.scheduledTime).getUTCDate()),
          scheduledCron: controller.cron,
          scheduledTime,
          scheduleName: scheduledJob.name,
        }
      ).then((result) => {
        console.info(
          `[monthly-report-automation] scheduled job created schedule=${scheduledJob.name} scheduled_cron=${controller.cron} scheduled_time=${scheduledTime} status=${String(result.status)} job_id=${String(result.jobId ?? "")}`
        );
      })
    );
  },

  async queue(batch: MessageBatch<ReportQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processReportItem(env, message.body);
        message.ack();
      } catch (error) {
        console.error("[monthly-report-automation] queue item failed", formatError(error));
        message.retry();
      }
    }
  },
};

export default worker;

export class BrowserLaunchLimiter {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(): Promise<Response> {
    const now = Date.now();
    const launchSpacingMs = resolveBrowserLaunchSpacingMs(this.env);
    const storedNext = (await this.state.storage.get<number>("nextAvailableLaunchAt")) ?? 0;
    const nextAvailableLaunchAt =
      storedNext > now + 60000 ? now : storedNext;
    const reservedLaunchAt = Math.max(now, nextAvailableLaunchAt);
    const waitMs = Math.max(0, reservedLaunchAt - now);

    await this.state.storage.put(
      "nextAvailableLaunchAt",
      reservedLaunchAt + launchSpacingMs
    );

    return new Response(
      JSON.stringify({
        success: true,
        waitMs,
        launchSpacingMs,
        reservedLaunchAt,
        nextAvailableLaunchAt: reservedLaunchAt + launchSpacingMs,
      }),
      {
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      ok: true,
      service: SERVICE_NAME,
      schedules: {
        production: PRODUCTION_CRON,
        monthlyOverall: "day 7",
        monthlyAdvanced: "day 10",
        biweeklyOverall: "day 15",
      },
      cronExpressions: {
        monthlyOverall: MONTHLY_OVERALL_CRON,
        monthlyAdvanced: MONTHLY_ADVANCED_CRON,
        biweeklyOverall: BIWEEKLY_OVERALL_CRON,
      },
      timezone: "UTC",
      malaysiaTime: "12:00 on days 7, 10, and 15",
    });
  }

  if (request.method === "POST" && url.pathname === "/report-jobs") {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const body = (await safeReadJson(request)) as CreateJobRequest | null;
    const result = await createReportJob(env, body ?? {}, { source: "api" });
    return jsonResponse(result, 202);
  }

  if (request.method === "GET" && url.pathname === "/report-jobs/active") {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const reportType = url.searchParams.get("reportType")?.trim() ?? "";
    const reportMonthKey = url.searchParams.get("reportMonthKey")?.trim() ?? "";
    if (!isScheduledReportType(reportType) || !/^\d{4}-\d{2}$/.test(reportMonthKey)) {
      return jsonResponse({ success: false, error: "A valid reportType and reportMonthKey are required." }, 400);
    }

    const job = await findActiveReportJob(env, reportType, reportMonthKey);
    return jsonResponse({ success: true, job });
  }

  const jobMatch = url.pathname.match(/^\/report-jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const jobId = decodeURIComponent(jobMatch[1]);
    return jsonResponse(await getReportJob(env, jobId));
  }

  const retryMatch = url.pathname.match(/^\/report-jobs\/([^/]+)\/retry-failed$/);
  if (request.method === "POST" && retryMatch) {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const jobId = decodeURIComponent(retryMatch[1]);
    return jsonResponse(await retryFailedItems(env, jobId), 202);
  }

  const downloadMatch = url.pathname.match(/^\/report-jobs\/([^/]+)\/items\/([^/]+)\/download$/);
  if (request.method === "GET" && downloadMatch) {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    return downloadReportPdf(env, decodeURIComponent(downloadMatch[1]), decodeURIComponent(downloadMatch[2]));
  }

  return jsonResponse({ success: false, error: "Not found" }, 404);
}

async function createReportJob(
  env: Env,
  input: CreateJobRequest,
  metadata: Record<string, string>
): Promise<Record<string, unknown>> {
  const testMode = Boolean(input.forceTestMode);
  const sendEmail = input.sendEmail !== false;
  const scheduledDate = resolveScheduledDate(input.scheduledDate ?? input.scheduledTime);
  const jobReportType = resolveJobReportType(input, scheduledDate);
  const requestedRange = resolveDateRange(input);
  const activeJob = await findActiveReportJob(env, jobReportType, requestedRange.reportMonthKey);
  if (activeJob) {
    return {
      success: true,
      status: activeJob.status,
      jobId: activeJob.id,
      total: activeJob.total_items,
      reportMonthKey: activeJob.report_month_key,
      reportMonthLabel: activeJob.report_month_label,
      createdAt: activeJob.created_at,
      reusedActiveJob: true,
      metadata,
    };
  }
  if (normalizeReportType(input.reportType) === "advanced" && !isAdvancedReportAutomationEnabled(env)) {
    console.warn(
      `[monthly-report-automation] skipped report_type=advanced scheduled_date=${scheduledDate} reason="ADVANCED_REPORT_ENABLED=false"`
    );
    console.info("[monthly-report-automation] debug summary processed=0 sent=0 skipped=1 failed=0 report_type=advanced");
    return {
      success: true,
      status: "skipped",
      total: 0,
      skippedTotal: 1,
      skippedReason: "ADVANCED_REPORT_ENABLED=false",
      message: "Advanced Report automation is disabled.",
      metadata,
    };
  }
  const resolved = await resolveTargets(env, input, testMode);
  const expandedTargets = expandAdvancedTargets(resolved.targets);
  const monthlyEmailTargets = expandedTargets.filter((target) => target.monthlyEmailEnabled === true);
  const skippedUnchecked = expandedTargets.length - monthlyEmailTargets.length;
  const recipientTargets = monthlyEmailTargets.filter((target) => {
    if (!sendEmail || testMode) {
      return true;
    }
    return Boolean(resolveRecipientEmail(env, target, testMode));
  });
  const skippedMissingEmail = monthlyEmailTargets.length - recipientTargets.length;
  if (sendEmail && !testMode) {
    for (const target of monthlyEmailTargets) {
      if (!resolveRecipientEmail(env, target, testMode)) {
        console.warn(
          `[monthly-report-automation] skipped missing email report_type=${normalizeReportType(target.reportType)} period=${resolved.reportMonthKey} scheduled_date=${scheduledDate} account_id=${resolveTargetAccountId(target)} client=${target.clientName} skipped_reason="missing recipient email"`
        );
      }
    }
  }
  const duplicateResult = sendEmail
    ? await filterAlreadySentTargets(env, recipientTargets, {
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        reportMonthKey: resolved.reportMonthKey,
        scheduledDate,
      })
    : { targets: recipientTargets, skippedAlreadySent: 0 };
  const targets = duplicateResult.targets;
  const skippedTotal = skippedUnchecked + skippedMissingEmail + duplicateResult.skippedAlreadySent;
  const jobMetadata = {
    ...metadata,
    skippedUnchecked: String(skippedUnchecked),
    skippedMissingEmail: String(skippedMissingEmail),
    skippedAlreadySent: String(duplicateResult.skippedAlreadySent),
    skippedTotal: String(skippedTotal),
  };

  console.info(
    `[monthly-report-automation] target gate report_type=${normalizeReportType(input.reportType)} report_month=${resolved.reportMonthKey} scheduled_date=${scheduledDate} total_resolved=${expandedTargets.length} monthly_email_approved=${monthlyEmailTargets.length} skipped_unchecked=${skippedUnchecked} skipped_missing_email=${skippedMissingEmail} skipped_already_sent=${duplicateResult.skippedAlreadySent}`
  );

  if (targets.length === 0) {
    console.info(
      `[monthly-report-automation] debug summary processed=0 sent=0 skipped=${skippedTotal} failed=0 report_type=${normalizeReportType(input.reportType)} period=${resolved.reportMonthKey} scheduled_date=${scheduledDate}`
    );
    return {
      success: true,
      status: "empty",
      total: 0,
      skippedUnchecked,
      skippedMissingEmail,
      skippedAlreadySent: duplicateResult.skippedAlreadySent,
      message: "No report targets queued after monthly email, recipient, and duplicate-send gates.",
      metadata: jobMetadata,
    };
  }

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const jobStatus = targets.length > 0 ? "queued" : "empty";

  try {
    await env.REPORT_JOBS_DB.prepare(
    `INSERT INTO report_jobs (
      id, status, report_type, report_month_key, report_month_label, start_date, end_date,
      total_items, send_email, test_mode, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      jobId,
      jobStatus,
      jobReportType,
      resolved.reportMonthKey,
      resolved.reportMonthLabel,
      resolved.startDate,
      resolved.endDate,
      targets.length,
      sendEmail ? 1 : 0,
      testMode ? 1 : 0,
      JSON.stringify(jobMetadata),
      now,
      now
    )
    .run();
  } catch (error) {
    const concurrentJob = await findActiveReportJob(env, jobReportType, resolved.reportMonthKey);
    if (!concurrentJob) {
      throw error;
    }
    return {
      success: true,
      status: concurrentJob.status,
      jobId: concurrentJob.id,
      total: concurrentJob.total_items,
      reportMonthKey: concurrentJob.report_month_key,
      reportMonthLabel: concurrentJob.report_month_label,
      createdAt: concurrentJob.created_at,
      reusedActiveJob: true,
      metadata,
    };
  }

  for (const target of targets) {
    const itemId = crypto.randomUUID();
    await env.REPORT_JOBS_DB.prepare(
      `INSERT INTO report_job_items (
        id, job_id, status, client_name, platform, report_type, country, google_account_id, meta_account_id,
        idempotency_key, recipient_email, cc_email, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        jobId,
        "queued",
        target.clientName,
        target.platform ?? inferPlatform(target),
        normalizeReportType(target.reportType),
        normalizeAdvancedCountry(target.country),
        normalizeOptional(target.googleAccountId),
        normalizeOptional(target.metaAccountId),
        buildReportIdempotencyKey(target, {
          reportMonthKey: resolved.reportMonthKey,
          scheduledDate,
        }),
        resolveRecipientEmail(env, target, testMode),
        testMode ? null : normalizeOptional(target.ccEmail),
        0,
        now,
        now
      )
      .run();

    await env.MONTHLY_REPORT_QUEUE.send({
      jobId,
      itemId,
      target: {
        ...target,
        recipientEmail: resolveRecipientEmail(env, target, testMode),
        ccEmail: testMode ? null : normalizeOptional(target.ccEmail),
      },
      startDate: resolved.startDate,
      endDate: resolved.endDate,
      reportMonthKey: resolved.reportMonthKey,
      reportMonthLabel: resolved.reportMonthLabel,
      sendEmail,
      testMode,
    });
  }

  console.info(
    `[monthly-report-automation] debug summary processed=0 sent=0 skipped=${skippedTotal} failed=0 report_type=${normalizeReportType(input.reportType)} period=${resolved.reportMonthKey} scheduled_date=${scheduledDate} queued=${targets.length}`
  );

  return {
    success: true,
    jobId,
    status: jobStatus,
    total: targets.length,
    skippedUnchecked,
    skippedMissingEmail,
    skippedAlreadySent: duplicateResult.skippedAlreadySent,
    reportMonthKey: resolved.reportMonthKey,
    reportMonthLabel: resolved.reportMonthLabel,
    createdAt: now,
    reusedActiveJob: false,
    metadata: jobMetadata,
  };
}

async function filterAlreadySentTargets(
  env: Env,
  targets: ReportTarget[],
  range: {
    startDate: string;
    endDate: string;
    reportMonthKey: string;
    scheduledDate: string;
  }
): Promise<{ targets: ReportTarget[]; skippedAlreadySent: number }> {
  const queuedTargets: ReportTarget[] = [];
  let skippedAlreadySent = 0;

  for (const target of targets) {
    const reportType = normalizeReportType(target.reportType);
    const googleAccountId = normalizeOptional(target.googleAccountId) ?? "";
    const metaAccountId = normalizeOptional(target.metaAccountId) ?? "";
    const idempotencyKey = buildReportIdempotencyKey(target, {
      reportMonthKey: range.reportMonthKey,
      scheduledDate: range.scheduledDate,
    });
    const existing = await env.REPORT_JOBS_DB.prepare(
      `SELECT i.id
       FROM report_job_items i
       INNER JOIN report_jobs j ON j.id = i.job_id
       WHERE i.idempotency_key = ?
         AND j.report_month_key = ?
         AND j.start_date = ?
         AND j.end_date = ?
         AND i.status = 'completed'
       LIMIT 1`
    )
      .bind(idempotencyKey, range.reportMonthKey, range.startDate, range.endDate)
      .first<{ id: string }>();

    if (existing) {
      skippedAlreadySent += 1;
      console.info(
        `[monthly-report-automation] skipped already sent idempotency_key=${idempotencyKey} report_month=${range.reportMonthKey} report_type=${reportType} google_account_id=${googleAccountId || "(none)"} meta_account_id=${metaAccountId || "(none)"}`
      );
      continue;
    }

    queuedTargets.push(target);
  }

  return {
    targets: queuedTargets,
    skippedAlreadySent,
  };
}

async function processReportItem(env: Env, message: ReportQueueMessage): Promise<void> {
  const now = new Date().toISOString();
  const reportType = normalizeReportType(message.target.reportType);
  const accountId = resolveTargetAccountId(message.target);
  const existing = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_job_items WHERE id = ? AND job_id = ?")
    .bind(message.itemId, message.jobId)
    .first<JobItemRow>();

  if (!existing) {
    throw new Error(`Missing report job item ${message.itemId}.`);
  }

  if (existing.status === "completed" && !message.force) {
    return;
  }

  await env.REPORT_JOBS_DB.prepare(
    `UPDATE report_job_items
     SET status = ?, attempts = attempts + 1, error_message = NULL, updated_at = ?
     WHERE id = ? AND job_id = ?`
  )
    .bind("processing", now, message.itemId, message.jobId)
    .run();
  await refreshJobStatus(env, message.jobId);

  let pdfStatus = "not_started";
  let emailStatus = message.sendEmail ? "not_started" : "skipped";
  try {
    console.info(
      `[monthly-report-automation] pdf start report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} pdf_status=started`
    );
    pdfStatus = "started";
    const pdf = await renderPdfForReportMessage(env, message);
    pdfStatus = "generated";
    console.info(
      `[monthly-report-automation] pdf generated report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} pdf_status=generated size_bytes=${pdf.byteLength}`
    );
    const r2Key = buildR2Key(message);
    const filename = buildPdfFilename(
      message.target.clientName,
      message.reportMonthLabel,
      normalizeReportType(message.target.reportType)
    );

    await env.REPORT_PDFS.put(r2Key, pdf, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${filename}"`,
      },
      customMetadata: {
        jobId: message.jobId,
        itemId: message.itemId,
        clientName: message.target.clientName,
        reportType: normalizeReportType(message.target.reportType),
        reportMonthKey: message.reportMonthKey,
      },
    });

    let resendEmailId: string | null = null;
    if (message.sendEmail) {
      console.info(
        `[monthly-report-automation] email start report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} email_status=started`
      );
      emailStatus = "started";
      const emailResult = await sendReportEmail(env, {
        target: message.target,
        reportMonthLabel: message.reportMonthLabel,
        reportType: normalizeReportType(message.target.reportType),
        pdf,
        r2Key,
        filename,
      });
      resendEmailId = emailResult.resendEmailId;
      emailStatus = "sent";
      console.info(
        `[monthly-report-automation] email sent report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} email_status=sent resend_email_id=${resendEmailId ?? "missing"}`
      );
    } else {
      emailStatus = "skipped";
      console.info(
        `[monthly-report-automation] email skipped report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} email_status=skipped skipped_reason="sendEmail=false"`
      );
    }

    await env.REPORT_JOBS_DB.prepare(
      `UPDATE report_job_items
       SET status = ?, r2_key = ?, report_url = ?, resend_email_id = ?, error_message = NULL, updated_at = ?
       WHERE id = ? AND job_id = ?`
    )
      .bind("completed", r2Key, buildReportUrl(env, message), resendEmailId, new Date().toISOString(), message.itemId, message.jobId)
      .run();
    await refreshJobStatus(env, message.jobId);
    await maybeSendJobCompletionNotification(env, message.jobId);
  } catch (error) {
    const errorMessage = formatError(error);
    const attemptCount = existing.attempts + 1;
    const finalFailure = attemptCount >= REPORT_ITEM_FINAL_FAILURE_ATTEMPTS;
    await env.REPORT_JOBS_DB.prepare(
      `UPDATE report_job_items
       SET status = ?, error_message = ?, updated_at = ?
       WHERE id = ? AND job_id = ?`
    )
      .bind(finalFailure ? "failed" : "retrying", errorMessage, new Date().toISOString(), message.itemId, message.jobId)
      .run();
    await refreshJobStatus(env, message.jobId);
    console.error(
      `[monthly-report-automation] item failure report_type=${reportType} period=${message.reportMonthKey} account_id=${accountId} client=${message.target.clientName} pdf_status=${pdfStatus === "generated" ? "generated" : "failed"} email_status=${emailStatus === "sent" ? "sent" : emailStatus === "skipped" ? "skipped" : "failed"} attempt=${attemptCount} final_failure=${finalFailure} error=${errorMessage}`
    );
    if (finalFailure) {
      await maybeSendJobCompletionNotification(env, message.jobId);
    }
    throw error;
  }
}

async function getReportJob(env: Env, jobId: string): Promise<Record<string, unknown>> {
  const job = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_jobs WHERE id = ?").bind(jobId).first<JobRow>();

  if (!job) {
    return {
      success: false,
      error: "Report job not found.",
    };
  }

  const itemsResult = await env.REPORT_JOBS_DB.prepare(
    `SELECT id, job_id, status, client_name, platform, report_type, country, google_account_id, meta_account_id,
      idempotency_key, recipient_email, cc_email, attempts, r2_key, report_url, resend_email_id, error_message, updated_at
     FROM report_job_items
     WHERE job_id = ?
     ORDER BY created_at ASC`
  )
    .bind(jobId)
    .all<JobItemRow>();
  const items = itemsResult.results ?? [];

  return {
    success: true,
    job,
    summary: summarizeItems(items),
    items,
  };
}

async function retryFailedItems(env: Env, jobId: string): Promise<Record<string, unknown>> {
  const job = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_jobs WHERE id = ?").bind(jobId).first<JobRow>();

  if (!job) {
    return {
      success: false,
      error: "Report job not found.",
    };
  }

  const failedResult = await env.REPORT_JOBS_DB.prepare(
    `SELECT id, client_name, platform, report_type, country, google_account_id, meta_account_id, idempotency_key, recipient_email, cc_email
     FROM report_job_items
     WHERE job_id = ? AND status = ?`
  )
    .bind(jobId, "failed")
    .all<JobItemRow>();
  const failed = failedResult.results ?? [];

  for (const item of failed) {
    await env.REPORT_JOBS_DB.prepare(
      "UPDATE report_job_items SET status = ?, error_message = NULL, updated_at = ? WHERE id = ? AND job_id = ?"
    )
      .bind("queued", new Date().toISOString(), item.id, jobId)
      .run();

    await env.MONTHLY_REPORT_QUEUE.send({
      jobId,
      itemId: item.id,
      target: {
        clientName: item.client_name,
        platform: item.platform,
        reportType: item.report_type,
        country: item.country,
        googleAccountId: item.google_account_id,
        metaAccountId: item.meta_account_id,
        recipientEmail: item.recipient_email,
        ccEmail: item.cc_email,
      },
      startDate: job.start_date,
      endDate: job.end_date,
      reportMonthKey: job.report_month_key,
      reportMonthLabel: job.report_month_label,
      sendEmail: Boolean(job.send_email),
      testMode: Boolean(job.test_mode),
      force: true,
    });
  }

  await refreshJobStatus(env, jobId);

  return {
    success: true,
    jobId,
    retried: failed.length,
  };
}

async function downloadReportPdf(env: Env, jobId: string, itemId: string): Promise<Response> {
  const item = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_job_items WHERE id = ? AND job_id = ?")
    .bind(itemId, jobId)
    .first<JobItemRow>();

  if (!item?.r2_key) {
    return jsonResponse({ success: false, error: "PDF is not available for this item." }, 404);
  }

  const object = await env.REPORT_PDFS.get(item.r2_key);
  if (!object) {
    return jsonResponse({ success: false, error: "Stored PDF was not found." }, 404);
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/pdf",
      "content-disposition":
        object.httpMetadata?.contentDisposition ??
          `attachment; filename="${buildPdfFilename(item.client_name, "report", normalizeReportType(item.report_type))}"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
}

async function resolveTargets(
  env: Env,
  input: CreateJobRequest,
  testMode: boolean
): Promise<{
  targets: ReportTarget[];
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
}> {
  if (Array.isArray(input.accounts) && input.accounts.length > 0) {
    const range = resolveDateRange(input);
    const payload = await resolveTargetsFromVercel(env, {
      forceTestMode: testMode,
      overrideTargets: input.accounts,
      reportType: input.manualReportType ?? input.reportType,
      manual: Boolean(input.manualReportType),
    }).catch((error) => {
      console.error("[monthly-report-automation] Vercel target enrichment failed", formatError(error));
      return { targets: input.accounts ?? [] };
    });
    const enrichedTargets = await enrichTargetsFromNotion(env, payload.targets ?? input.accounts, input.reportType);

    return {
      ...range,
      targets: normalizeTargets(enrichedTargets, input),
    };
  }

  const payload = await resolveTargetsFromVercel(env, {
    forceTestMode: testMode,
    reportType: input.manualReportType ?? input.reportType,
    manual: Boolean(input.manualReportType),
  });
  const inputRange = resolveDateRange(input);

  return {
    startDate: input.startDate ?? payload.startDate ?? inputRange.startDate,
    endDate: input.endDate ?? payload.endDate ?? inputRange.endDate,
    reportMonthKey: input.reportMonthKey ?? payload.reportMonthKey ?? inputRange.reportMonthKey,
    reportMonthLabel: input.reportMonthLabel ?? payload.reportMonthLabel ?? inputRange.reportMonthLabel,
    targets: normalizeTargets(payload.targets ?? [], input),
  };
}

async function resolveTargetsFromVercel(
  env: Env,
  body: {
    forceTestMode: boolean;
    overrideTargets?: ReportTarget[];
    reportType?: string | null;
    manual?: boolean;
  }
): Promise<{
  startDate?: string;
  endDate?: string;
  reportMonthKey?: string;
  reportMonthLabel?: string;
  targets?: ReportTarget[];
}> {
  const configuredEndpoint = env.VERCEL_REPORT_TARGETS_ENDPOINT?.trim();
  const endpoint = body.manual
    ? `${trimTrailingSlash(env.VERCEL_APP_BASE_URL)}/api/report-pdf/manual-targets`
    : configuredEndpoint || `${trimTrailingSlash(env.VERCEL_APP_BASE_URL)}/api/report-pdf/targets`;
  const requestBody = {
    forceTestMode: body.forceTestMode,
    ...(body.overrideTargets ? { overrideTargets: body.overrideTargets } : {}),
    reportType: body.reportType,
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readRequired(env.REPORT_AUTOMATION_SECRET, "REPORT_AUTOMATION_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        startDate?: string;
        endDate?: string;
        reportMonthKey?: string;
        reportMonthLabel?: string;
        targets?: ReportTarget[];
      }
    | null;

  if (!response.ok || !payload?.success) {
    throw new Error(`Vercel target resolution failed with status ${response.status}.`);
  }

  return payload;
}

async function enrichTargetsFromNotion(
  env: Env,
  targets: ReportTarget[],
  requestedReportType?: string | null
): Promise<ReportTarget[]> {
  const notionToken = env.NOTION_TOKEN?.trim();
  const databaseId = env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || env.NOTION_DATABASE_ID?.trim();

  if (!notionToken || !databaseId || targets.length === 0) {
    return targets;
  }

  try {
    const rows = await fetchNotionAdAccountRows(notionToken, databaseId);
    const rowsByGoogleId = new Map(rows.filter((row) => row.googleAccountId).map((row) => [row.googleAccountId as string, row]));
    const rowsByMetaId = new Map(rows.filter((row) => row.metaAccountId).map((row) => [row.metaAccountId as string, row]));
    const clientNameCache = new Map<string, Promise<string | null>>();

    return Promise.all(
      targets.map(async (target) => {
        const googleAccountIds = splitAccountIds(target.googleAccountId)
          .map((accountId) => normalizeGoogleAccountId(accountId))
          .filter((accountId): accountId is string => Boolean(accountId));
        const metaAccountIds = splitAccountIds(target.metaAccountId)
          .map((accountId) => normalizeMetaAccountId(accountId))
          .filter((accountId): accountId is string => Boolean(accountId));
        const matchedRows = [
          ...googleAccountIds.map((accountId) => rowsByGoogleId.get(accountId) ?? null),
          ...metaAccountIds.map((accountId) => rowsByMetaId.get(accountId) ?? null),
        ].filter((row): row is NotionAdAccountRow => Boolean(row));
        const clientName = await resolveNotionClientName(notionToken, matchedRows, clientNameCache);
        const isAdvancedTarget = normalizeReportType(target.reportType ?? requestedReportType) === "advanced";

        return {
          ...target,
          clientName: clientName ?? target.clientName,
          googleAccountId: target.googleAccountId ?? matchedRows.find((row) => row.googleAccountId)?.googleAccountId ?? null,
          metaAccountId: target.metaAccountId ?? matchedRows.find((row) => row.metaAccountId)?.metaAccountId ?? null,
          recipientEmail: isAdvancedTarget
            ? matchedRows.find((row) => row.clientEmail)?.clientEmail ?? null
            : target.recipientEmail ?? matchedRows.find((row) => row.clientEmail)?.clientEmail ?? null,
          ccEmail: isAdvancedTarget
            ? matchedRows.find((row) => row.ccEmail)?.ccEmail ?? null
            : target.ccEmail ?? matchedRows.find((row) => row.ccEmail)?.ccEmail ?? null,
          monthlyEmailEnabled:
            resolveNotionMonthlyEmailEnabled(matchedRows, target.reportType ?? requestedReportType) ??
            target.monthlyEmailEnabled === true,
        };
      })
    );
  } catch (error) {
    console.error("[monthly-report-automation] Notion target enrichment failed", formatError(error));
    return targets;
  }
}

interface NotionAdAccountRow {
  googleAccountId: string | null;
  metaAccountId: string | null;
  accountName: string | null;
  clientEmail: string | null;
  ccEmail: string | null;
  monthlyEmailEnabled: boolean;
  advancedReportEnabled: boolean;
  clientRelationPageIds: string[];
}

async function fetchNotionAdAccountRows(
  notionToken: string,
  databaseId: string
): Promise<NotionAdAccountRow[]> {
  const database = (await notionRequest(notionToken, `/databases/${databaseId}`)) as {
    data_sources?: Array<{ id?: string | null }>;
  };
  const dataSourceId = database.data_sources?.[0]?.id;

  if (!dataSourceId) {
    return [];
  }

  const rows: Array<{ properties?: Record<string, unknown> }> = [];
  let startCursor: string | null = null;

  do {
    const response = (await notionRequest(notionToken, `/data_sources/${dataSourceId}/query`, {
      start_cursor: startCursor ?? undefined,
    })) as {
      results?: Array<{ properties?: Record<string, unknown> }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    rows.push(...(response.results ?? []));
    startCursor = response.has_more ? response.next_cursor ?? null : null;
  } while (startCursor);

  return rows.map((row) => mapNotionAdAccountRow(row.properties ?? {}));
}

function mapNotionAdAccountRow(properties: Record<string, unknown>): NotionAdAccountRow {
  const platform = getNotionText(properties, ["Platform"])?.toLowerCase() ?? "";
  const rawId = getNotionText(properties, [
    "ID",
    "Account ID",
    "Google Ads Account ID",
    "Google Ads ID",
    "Meta Ads Account ID",
    "Meta Ads ID",
  ]);
  const googleAccountId =
    platform.includes("google") || !platform ? normalizeGoogleAccountId(rawId) : null;
  const metaAccountId = platform.includes("meta") || !platform ? normalizeMetaAccountId(rawId) : null;

  return {
    googleAccountId,
    metaAccountId,
    accountName: getNotionText(properties, ["Account Name", "Name", "Client Name"]),
    clientEmail: getNotionText(properties, [
      "Recipient Email",
      "Monthly Report Recipient",
      "Monthly Report Email",
      "Client Email",
      "Email",
    ]),
    ccEmail: getNotionText(properties, [
      "Person in Charge Email",
      "Person-In-Charge Email",
      "PIC Email",
    ]),
    monthlyEmailEnabled: getNotionCheckbox(properties, ["Monthly email"]),
    advancedReportEnabled: getNotionCheckbox(properties, ["Advanced Report"]),
    clientRelationPageIds: getNotionRelationIds(properties, ["Client"]),
  };
}

function resolveNotionMonthlyEmailEnabled(
  rows: NotionAdAccountRow[],
  reportType: string | null | undefined
): boolean | null {
  if (rows.length === 0) {
    return null;
  }

  if (normalizeReportType(reportType) === "advanced") {
    return rows.some((row) => row.advancedReportEnabled);
  }

  return rows.some((row) => row.monthlyEmailEnabled);
}

async function resolveNotionClientName(
  notionToken: string,
  rows: NotionAdAccountRow[],
  cache: Map<string, Promise<string | null>>
): Promise<string | null> {
  const relationPageIds = Array.from(new Set(rows.flatMap((row) => row.clientRelationPageIds)));

  if (relationPageIds.length > 0) {
    const names = (
      await Promise.all(
        relationPageIds.map((pageId) => {
          let pending = cache.get(pageId);
          if (!pending) {
            pending = fetchNotionClientPageName(notionToken, pageId);
            cache.set(pageId, pending);
          }
          return pending;
        })
      )
    ).filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return Array.from(new Set(names)).join(" / ");
    }
  }

  const accountNames = rows.map((row) => row.accountName).filter((name): name is string => Boolean(name));
  return accountNames.length > 0 ? Array.from(new Set(accountNames)).join(" / ") : null;
}

async function fetchNotionClientPageName(notionToken: string, pageId: string): Promise<string | null> {
  const page = (await notionRequest(notionToken, `/pages/${pageId}`)) as {
    properties?: Record<string, unknown>;
  };

  return page.properties
    ? getNotionText(page.properties, ["Client Name", "Name", "Client", "Account Name"])
    : null;
}

async function notionRequest(
  notionToken: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Notion request failed status=${response.status}.`);
  }

  return response.json();
}

function getNotionText(properties: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const property = findNotionProperty(properties, alias);
    const value = readNotionPropertyText(property);
    if (value) {
      return value;
    }
  }

  return null;
}

function getNotionCheckbox(properties: Record<string, unknown>, aliases: string[]): boolean {
  for (const alias of aliases) {
    const property = findNotionProperty(properties, alias);
    if (!property || typeof property.type !== "string") {
      continue;
    }
    if (property.type === "checkbox") {
      return property.checkbox === true;
    }
    if (property.type === "formula") {
      const formula = property.formula as { type?: string; boolean?: boolean | null } | undefined;
      if (formula?.type === "boolean") {
        return formula.boolean === true;
      }
    }
  }

  return false;
}

function getNotionRelationIds(properties: Record<string, unknown>, aliases: string[]): string[] {
  for (const alias of aliases) {
    const property = findNotionProperty(properties, alias);
    if (!property || typeof property !== "object" || !("type" in property) || property.type !== "relation") {
      continue;
    }

    const relation = (property as { relation?: Array<{ id?: string | null }> }).relation;
    const ids = (relation ?? []).map((item) => item.id?.trim()).filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      return ids;
    }
  }

  return [];
}

function findNotionProperty(properties: Record<string, unknown>, alias: string): Record<string, unknown> | null {
  const normalizedAlias = normalizePropertyName(alias);
  const match = Object.entries(properties).find(([key]) => normalizePropertyName(key) === normalizedAlias)?.[1];
  return match && typeof match === "object" ? (match as Record<string, unknown>) : null;
}

function readNotionPropertyText(property: Record<string, unknown> | null): string | null {
  if (!property || typeof property.type !== "string") {
    return null;
  }

  if (property.type === "title") {
    return joinNotionRichText(property.title);
  }

  if (property.type === "rich_text") {
    return joinNotionRichText(property.rich_text);
  }

  if (property.type === "select" || property.type === "status") {
    const field = property[property.type];
    return field && typeof field === "object" && "name" in field ? normalizeOptional(String(field.name ?? "")) : null;
  }

  if (property.type === "formula") {
    const formula = property.formula as { string?: string | null; number?: number | null; boolean?: boolean | null } | undefined;
    return normalizeOptional(formula?.string ?? (formula?.number === undefined || formula?.number === null ? null : String(formula.number)) ?? (formula?.boolean === undefined || formula?.boolean === null ? null : String(formula.boolean)));
  }

  if (property.type === "number") {
    return property.number === undefined || property.number === null ? null : String(property.number);
  }

  if (property.type === "email" || property.type === "url" || property.type === "phone_number") {
    return normalizeOptional(String(property[property.type] ?? ""));
  }

  return null;
}

function joinNotionRichText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return normalizeOptional(value.map((item) => (item && typeof item === "object" && "plain_text" in item ? item.plain_text : "")).join(""));
}

function normalizeGoogleAccountId(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length === 10 ? normalized : null;
}

function normalizeMetaAccountId(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized || null;
}

function normalizePropertyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDateRange(input: CreateJobRequest): {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
} {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: input.startDate ?? start.toISOString().slice(0, 10),
    endDate: input.endDate ?? end.toISOString().slice(0, 10),
    reportMonthKey:
      input.reportMonthKey ?? `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    reportMonthLabel:
      input.reportMonthLabel ??
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start),
  };
}

function resolveScheduledJob(controller: ScheduledController): {
  name: string;
  input: CreateJobRequest;
} {
  const scheduledAt = new Date(controller.scheduledTime);

  if (scheduledAt.getUTCDate() === 15) {
    return {
      name: "biweekly-overall",
      input: {
        sendEmail: true,
        forceTestMode: false,
        reportType: "overall",
        ...resolveCurrentMonthFirstHalfRange(scheduledAt),
      },
    };
  }

  if (scheduledAt.getUTCDate() === 10) {
    return {
      name: "monthly-advanced",
      input: {
        sendEmail: true,
        forceTestMode: false,
        reportType: "advanced",
        ...resolvePreviousMonthRange(scheduledAt),
      },
    };
  }

  return {
    name: "monthly-overall",
    input: {
      sendEmail: true,
      forceTestMode: false,
      reportType: "overall",
      ...resolvePreviousMonthRange(scheduledAt),
    },
  };
}

function resolvePreviousMonthRange(referenceDate: Date): {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return formatDateRange(start, end);
}

function resolveCurrentMonthFirstHalfRange(referenceDate: Date): {
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
    ...formatDateRange(start, end),
    reportMonthLabel: `${new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start)} 1-14`,
  };
}

function formatDateRange(start: Date, end: Date): {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
} {
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

async function renderWithBrowserRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= BROWSER_SESSION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableBrowserError(error) || attempt >= BROWSER_SESSION_RETRY_ATTEMPTS) {
        throw error;
      }

      const delayMs = resolveBrowserRetryDelayMs(error, attempt);
      console.warn(
        `[monthly-report-automation] browser session failed attempt=${attempt} retrying_after_ms=${delayMs} error=${formatError(error)}`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function waitForBrowserLaunchSlot(env: Env): Promise<void> {
  const id = env.BROWSER_LAUNCH_LIMITER.idFromName(BROWSER_LAUNCH_LIMITER_NAME);
  const limiter = env.BROWSER_LAUNCH_LIMITER.get(id);
  const response = await limiter.fetch("https://browser-launch-limiter/reserve", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Browser launch limiter failed with status ${response.status}.`);
  }

  const payload = (await response.json().catch(() => null)) as { waitMs?: number } | null;
  const waitMs = payload?.waitMs ?? 0;

  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function isBrowserRateLimitError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return message.includes("429") || message.includes("rate limit");
}

function isRetryableBrowserError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return (
    isBrowserRateLimitError(error) ||
    message.includes("target page, context or browser has been closed") ||
    message.includes("target closed") ||
    message.includes("browser has been closed") ||
    message.includes("chromium crashed") ||
    message.includes("session evicted") ||
    message.includes("connection error") ||
    message.includes("websocket") ||
    message.includes("unable to create new browser")
  );
}

function resolveBrowserRetryDelayMs(error: unknown, attempt: number): number {
  if (isBrowserRateLimitError(error)) {
    return BROWSER_RATE_LIMIT_RETRY_MS + Math.floor(Math.random() * BROWSER_RATE_LIMIT_RETRY_JITTER_MS);
  }

  return (
    BROWSER_SESSION_RETRY_BASE_MS * attempt +
    Math.floor(Math.random() * BROWSER_SESSION_RETRY_JITTER_MS)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveBrowserLaunchSpacingMs(env: Env): number {
  const configured = Number(env.BROWSER_LAUNCH_SPACING_MS);
  if (Number.isFinite(configured) && configured >= 1100) {
    return configured;
  }

  return DEFAULT_BROWSER_LAUNCH_SPACING_MS;
}

async function renderPdfWithBrowserRun(env: Env, reportUrl: string): Promise<ArrayBuffer> {
  await waitForBrowserLaunchSlot(env);
  const browser = await puppeteer.launch(env.REPORT_BROWSER);
  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType("screen");
    await page.goto(reportUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0 !important;
          background: #f3f4f6 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        [data-report-capture-root='true'] {
          width: 1440px !important;
          max-width: none !important;
        }
        [data-report-export-exclude='true'],
        [data-report-download-overlay='true'] {
          display: none !important;
        }
      `,
    });
    await waitForOverallReportReady(page, 60000);
    const pageSize = await page.$eval("[data-report-capture-root='true']", (element) => {
      const target = element as HTMLElement;
      const rect = target.getBoundingClientRect();
      return {
        width: Math.ceil(Math.max(rect.width, target.scrollWidth)),
        height: Math.ceil(Math.max(rect.height, target.scrollHeight)),
      };
    });
    await page.addStyleTag({
      content: `
        @page {
          size: ${pageSize.width}px ${pageSize.height}px;
          margin: 0;
        }
      `,
    });
    const pdf = await page.pdf({
      width: `${pageSize.width}px`,
      height: `${pageSize.height}px`,
      printBackground: true,
      scale: 1,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    return toArrayBuffer(pdf);
  } finally {
    await page?.close().catch((error: unknown) => {
      console.warn(`[monthly-report-automation] browser page close failed ${formatError(error)}`);
    });
    await browser.close().catch((error: unknown) => {
      console.warn(`[monthly-report-automation] browser close failed ${formatError(error)}`);
    });
  }
}

async function renderAdvancedPdfWithBrowserRun(env: Env, reportUrl: string): Promise<ArrayBuffer> {
  await ensureAdvancedReportReady(reportUrl);
  await waitForBrowserLaunchSlot(env);
  const browser = await puppeteer.launch(env.REPORT_BROWSER);
  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType("screen");
    await page.goto(reportUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0 !important;
          background: #f3f4f6 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        [data-report-capture-root='true'] {
          width: 1440px !important;
          max-width: none !important;
        }
        [data-report-export-exclude='true'],
        [data-report-download-overlay='true'] {
          display: none !important;
        }
        [data-advanced-export-only='true'] {
          display: block !important;
        }
        textarea {
          border: 0 !important;
          background: #f7f7f7 !important;
          resize: none !important;
        }
      `,
    });
    await waitForAdvancedReportReady(page, 60000);
    await scrollAdvancedReportForMedia(page);
    await waitForPageImages(page, 30000);
    await downsampleLargeImagesForPdf(page);
    const pageSize = await page.$eval("[data-report-capture-root='true']", (element) => {
      const target = element as HTMLElement;
      const rect = target.getBoundingClientRect();
      return {
        width: Math.ceil(Math.max(rect.width, target.scrollWidth)),
        height: Math.ceil(Math.max(rect.height, target.scrollHeight)),
      };
    });
    await page.addStyleTag({
      content: `
        @page {
          size: ${pageSize.width}px ${pageSize.height}px;
          margin: 0;
        }
      `,
    });
    const pdf = await page.pdf({
      width: `${pageSize.width}px`,
      height: `${pageSize.height}px`,
      printBackground: true,
      scale: 1,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    if (pdf.byteLength <= EMAIL_SAFE_PDF_SIZE_BYTES) {
      return toArrayBuffer(pdf);
    }

    await replaceImagesWithPdfPlaceholders(page);
    await page.evaluate(() => document.fonts.ready);
    const lightweightPdf = await page.pdf({
      width: `${pageSize.width}px`,
      height: `${pageSize.height}px`,
      printBackground: true,
      scale: 1,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    return toArrayBuffer(lightweightPdf);
  } finally {
    await page?.close().catch((error: unknown) => {
      console.warn(`[monthly-report-automation] browser page close failed ${formatError(error)}`);
    });
    await browser.close().catch((error: unknown) => {
      console.warn(`[monthly-report-automation] browser close failed ${formatError(error)}`);
    });
  }
}

async function replaceImagesWithPdfPlaceholders(page: Page): Promise<void> {
  await page.evaluate(() => {
    const placeholderSvg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
        <rect width="900" height="900" fill="#f7f7f7"/>
        <rect x="24" y="24" width="852" height="852" rx="28" fill="#ffffff" stroke="#dddddd" stroke-width="4"/>
        <text x="450" y="410" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#555555">Creative image</text>
        <text x="450" y="470" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#777777">omitted in email PDF</text>
        <text x="450" y="525" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#999999">Metrics and analysis remain below</text>
      </svg>
    `);
    const placeholder = `data:image/svg+xml;charset=utf-8,${placeholderSvg}`;

    for (const image of Array.from(document.images)) {
      const src = image.currentSrc || image.src || "";
      if (!/^https?:\/\//i.test(src)) {
        continue;
      }
      image.src = placeholder;
      image.removeAttribute("srcset");
      image.setAttribute("decoding", "sync");
      image.style.objectFit = "contain";
      image.style.background = "#f7f7f7";
    }
  });
}

async function ensureAdvancedReportReady(reportUrl: string): Promise<void> {
  const apiUrl = buildAdvancedReportApiUrl(reportUrl);
  const apiUrlParts = new URL(apiUrl);
  const accountId = apiUrlParts.searchParams.get("accountId") ?? "missing";
  const period = `${apiUrlParts.searchParams.get("startDate") ?? "missing"}_${apiUrlParts.searchParams.get("endDate") ?? "missing"}`;
  const startedAt = Date.now();
  let generationStarted = false;
  let lastStatus = "unknown";
  let lastMessage: string | null = null;

  while (Date.now() - startedAt < ADVANCED_REPORT_READY_TIMEOUT_MS) {
    const ready = await readAdvancedReportReadyState(apiUrl);
    lastStatus = ready.status;
    lastMessage = ready.message;

    if (ready.status === "ready") {
      console.info(
        `[monthly-report-automation] advanced ready report_type=advanced account_id=${accountId} period=${period} ai_status=ready`
      );
      return;
    }

    if ((ready.status === "missing" || ready.status === "error") && !generationStarted) {
      console.info(
        `[monthly-report-automation] advanced generation requested report_type=advanced account_id=${accountId} period=${period} ai_status=queued previous_status=${ready.status} message=${ready.message ?? "none"}`
      );
      await startAdvancedReportGeneration(apiUrl);
      generationStarted = true;
    }

    await sleep(ADVANCED_REPORT_READY_POLL_MS);
  }

  throw new Error(
    `Advanced report was not ready after ${Math.round(ADVANCED_REPORT_READY_TIMEOUT_MS / 1000)}s. Last status=${lastStatus}${lastMessage ? ` message=${lastMessage}` : ""}`
  );
}

function buildAdvancedReportApiUrl(reportUrl: string): string {
  const url = new URL(reportUrl);
  const apiUrl = new URL("/api/reporting/advanced", url.origin);
  const accountId = url.searchParams.get("accountId");
  const country = url.searchParams.get("country");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  if (accountId) {
    apiUrl.searchParams.set("accountId", accountId);
  }
  if (country) {
    apiUrl.searchParams.set("country", country);
  }
  if (startDate) {
    apiUrl.searchParams.set("startDate", startDate);
  }
  if (endDate) {
    apiUrl.searchParams.set("endDate", endDate);
  }
  apiUrl.searchParams.set("reportMode", "advanced");
  apiUrl.searchParams.set("reportType", "advanced");

  return apiUrl.toString();
}

async function readAdvancedReportReadyState(apiUrl: string): Promise<{ status: string; message: string | null }> {
  const response = await fetch(apiUrl, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as {
    status?: string;
    message?: string;
  } | null;

  return {
    status: payload?.status ?? (response.ok ? "unknown" : "error"),
    message: payload?.message ?? (response.ok ? null : `Advanced report API returned ${response.status}`),
  };
}

async function startAdvancedReportGeneration(apiUrl: string): Promise<void> {
  const url = new URL(apiUrl);
  const body = {
    accountId: url.searchParams.get("accountId"),
    country: url.searchParams.get("country") ?? "MY",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    reportMode: "advanced",
    reportType: "advanced",
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Advanced report generation start failed with status ${response.status}.`);
  }
}

async function renderPdfForReportMessage(env: Env, message: ReportQueueMessage): Promise<ArrayBuffer> {
  return renderWithBrowserRetry(async () => {
    if (normalizeReportType(message.target.reportType) === "advanced") {
      return renderAdvancedPdfWithBrowserRun(env, buildReportUrl(env, message));
    }

    return renderPdfWithBrowserRun(env, buildReportUrl(env, message));
  });
}

async function waitForOverallReportReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForSelector("[data-report-capture-root='true'][data-report-ready='true']", {
    visible: true,
    timeout: timeoutMs,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const root = document.querySelector<HTMLElement>(
        "[data-report-capture-root='true'][data-report-ready='true']"
      );
      return Boolean(root && root.scrollHeight > 0 && root.scrollWidth > 0);
    },
    { timeout: timeoutMs }
  );
}

async function scrollAdvancedReportForMedia(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const delay = (durationMs: number) => new Promise((resolve) => window.setTimeout(resolve, durationMs));
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportHeight = Math.max(window.innerHeight, 800);
    for (let y = 0; y <= height; y += viewportHeight) {
      window.scrollTo(0, y);
      await delay(80);
    }
    window.scrollTo(0, 0);
  });
}

async function waitForPageImages(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    () =>
      Array.from(document.images).every(
        (image) => image.complete && image.naturalWidth > 0
      ),
    {
      timeout: timeoutMs,
    }
  ).catch(() => undefined);
}

async function downsampleLargeImagesForPdf(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const maxEdge = 900;
    const quality = 0.68;
    const images = Array.from(document.images);

    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })
      )
    );

    for (const image of images) {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || Math.max(width, height) <= maxEdge) {
        continue;
      }

      const scale = maxEdge / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }

      try {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/jpeg", quality);
        image.removeAttribute("srcset");
        image.setAttribute("decoding", "sync");
      } catch {
        // Cross-origin images without canvas access are left untouched.
      }
    }
  });
}

async function waitForAdvancedReportReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForSelector("[data-report-capture-root='true']", {
    visible: true,
    timeout: timeoutMs,
  });
  await page.waitForSelector("[data-advanced-report-content='true'][data-report-type='advanced']", {
    visible: true,
    timeout: timeoutMs,
  });
  await page.waitForSelector("[data-advanced-report-ready='true']", {
    visible: true,
    timeout: timeoutMs,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
      return Boolean(root && root.scrollHeight > 0 && root.scrollWidth > 0);
    },
    { timeout: timeoutMs }
  );
}

async function sendReportEmail(
  env: Env,
  input: {
    target: ReportTarget;
    reportMonthLabel: string;
    reportType: "overall" | "advanced";
    pdf: ArrayBuffer;
    r2Key: string;
    filename: string;
  }
): Promise<{ resendEmailId: string | null }> {
  const recipientEmails = parseEmailList(input.target.recipientEmail);
  if (recipientEmails.length === 0) {
    throw new Error(`Missing recipient email for ${input.target.clientName}.`);
  }
  const ccEmails = parseEmailList(input.target.ccEmail);

  const deliveryMode = env.REPORT_EMAIL_DELIVERY_MODE ?? "attachment";
  const attachments: Array<Record<string, string>> = [];
  const fromAddress = env.RESEND_FROM_MONTHLY_REPORT?.trim() || DEFAULT_FROM_ADDRESS;

  const body: Record<string, unknown> = {
    from: fromAddress,
    to: recipientEmails,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject: buildReportEmailSubject(input.reportType, input.target.clientName, input.reportMonthLabel),
    html: buildEmailHtml({
      clientName: input.target.clientName,
      reportMonthLabel: input.reportMonthLabel,
      downloadUrl: deliveryMode === "link" ? buildDownloadUrl(env, input.r2Key) : null,
      logoUrl: buildEmailLogoUrl(env),
    }),
  };

  if (deliveryMode === "attachment") {
    attachments.push({
      filename: input.filename,
      content: arrayBufferToBase64(input.pdf),
    });
  }

  if (attachments.length > 0) {
    body.attachments = attachments;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readRequired(env.RESEND_API_KEY, "RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(
      formatResendDeliveryError(
        payload?.error?.message ?? `Resend email failed with status ${response.status}.`,
        fromAddress
      )
    );
  }

  return {
    resendEmailId: payload?.id ?? null,
  };
}

async function sendCompletionNotificationEmail(
  env: Env,
  input: {
    job: JobRow;
    items: JobItemRow[];
    failedItems: JobItemRow[];
  }
): Promise<{ resendEmailId: string | null }> {
  const recipients = parseEmailList(env.REPORT_COMPLETION_NOTIFICATION_TO, DEFAULT_COMPLETION_NOTIFICATION_TO);
  if (recipients.length === 0) {
    throw new Error("Missing completion notification recipients.");
  }

  const cc = parseEmailList(env.REPORT_COMPLETION_NOTIFICATION_CC, DEFAULT_COMPLETION_NOTIFICATION_CC);
  const subjectPrefix = input.job.test_mode ? "[TEST] " : "";
  const completedCount = input.items.filter((item) => item.status === "completed").length;
  const failedCount = input.failedItems.length;
  const statusLabel = failedCount > 0 ? `${failedCount} failed` : "all completed";
  const fromAddress = env.RESEND_FROM_MONTHLY_REPORT?.trim() || DEFAULT_FROM_ADDRESS;
  const body: Record<string, unknown> = {
    from: fromAddress,
    to: recipients,
    cc: cc.length > 0 ? cc : undefined,
    subject: `${subjectPrefix}[Report Automation] Finished - ${input.job.report_month_label} - ${completedCount}/${input.items.length} completed, ${statusLabel}`,
    html: buildCompletionNotificationEmailHtml({
      job: input.job,
      items: input.items,
      failedItems: input.failedItems,
      logoUrl: buildEmailLogoUrl(env),
    }),
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readRequired(env.RESEND_API_KEY, "RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(
      formatResendDeliveryError(
        payload?.error?.message ?? `Resend completion notification failed with status ${response.status}.`,
        fromAddress
      )
    );
  }

  return {
    resendEmailId: payload?.id ?? null,
  };
}

async function refreshJobStatus(env: Env, jobId: string): Promise<void> {
  const result = await env.REPORT_JOBS_DB.prepare("SELECT status FROM report_job_items WHERE job_id = ?")
    .bind(jobId)
    .all<{ status: string }>();
  const statuses = (result.results ?? []).map((row) => row.status);
  const hasFailure = statuses.some((status) => status === "failed");
  const isTerminal = statuses.length > 0 && statuses.every((status) => status === "completed" || status === "failed");
  const nextStatus = statuses.length > 0 && statuses.every((status) => status === "completed")
    ? "completed"
    : isTerminal && hasFailure
      ? "completed_with_failures"
      : statuses.some((status) => status === "processing" || status === "retrying")
        ? "processing"
        : "queued";

  await env.REPORT_JOBS_DB.prepare("UPDATE report_jobs SET status = ?, updated_at = ? WHERE id = ?")
    .bind(nextStatus, new Date().toISOString(), jobId)
    .run();
}

async function maybeSendJobCompletionNotification(env: Env, jobId: string): Promise<void> {
  const job = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_jobs WHERE id = ?")
    .bind(jobId)
    .first<JobRow>();

  if (!job || job.completion_notification_sent_at || !isTerminalJobStatus(job.status)) {
    return;
  }

  const itemsResult = await env.REPORT_JOBS_DB.prepare(
    `SELECT id, job_id, status, client_name, platform, report_type, country, google_account_id, meta_account_id,
      idempotency_key, recipient_email, cc_email, attempts, r2_key, report_url, resend_email_id, error_message, updated_at
     FROM report_job_items
     WHERE job_id = ?
     ORDER BY created_at ASC`
  )
    .bind(jobId)
    .all<JobItemRow>();
  const items = itemsResult.results ?? [];
  const failedItems = items.filter((item) => item.status === "failed");
  const isTerminal = items.length > 0 && items.every((item) => item.status === "completed" || item.status === "failed");

  if (!isTerminal) {
    return;
  }

  const notificationSentAt = new Date().toISOString();
  const claim = await env.REPORT_JOBS_DB.prepare(
    "UPDATE report_jobs SET completion_notification_sent_at = ?, updated_at = ? WHERE id = ? AND completion_notification_sent_at IS NULL"
  )
    .bind(notificationSentAt, notificationSentAt, jobId)
    .run();

  if (!hasD1Changes(claim)) {
    return;
  }

  try {
    const result = await sendCompletionNotificationEmail(env, {
      job: {
        ...job,
        completion_notification_sent_at: notificationSentAt,
      },
      items,
      failedItems,
    });

    await env.REPORT_JOBS_DB.prepare(
      "UPDATE report_jobs SET completion_notification_resend_email_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(result.resendEmailId, new Date().toISOString(), jobId)
      .run();
  } catch (error) {
    await env.REPORT_JOBS_DB.prepare(
      "UPDATE report_jobs SET completion_notification_sent_at = NULL, updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), jobId)
      .run();
    console.error("[monthly-report-automation] completion notification email failed", formatError(error));
  }
}

function isTerminalJobStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "completed_with_failures";
}

function buildReportUrl(
  env: Env,
  message: ReportQueueMessage,
  target: ReportTarget = message.target
): string {
  const reportType = normalizeReportType(target.reportType ?? message.target.reportType);
  const url = new URL(reportType === "advanced" ? "/advanced" : "/overall", trimTrailingSlash(env.VERCEL_APP_BASE_URL));
  url.searchParams.set("startDate", message.startDate);
  url.searchParams.set("endDate", message.endDate);
  url.searchParams.set("screenshot", "1");
  url.searchParams.set("exportToken", env.REPORT_AUTOMATION_SECRET);

  const googleAccountId = normalizeOptional(target.googleAccountId);
  const metaAccountId = normalizeOptional(target.metaAccountId);
  const platform = target.platform?.trim().toLowerCase() ?? "";
  const shouldUseMetaOnly = platform === "meta";
  const shouldUseGoogleOnly = platform === "google";

  if (reportType === "advanced") {
    url.searchParams.set("reportMode", "advanced");
    url.searchParams.set("reportType", "advanced");
    const accountId = googleAccountId ?? metaAccountId;
    if (accountId) {
      url.searchParams.set("accountId", accountId);
    }
    url.searchParams.set("country", normalizeAdvancedCountry(target.country ?? message.target.country));
    return url.toString();
  }

  if (googleAccountId && !shouldUseMetaOnly) {
    url.searchParams.set("googleAccountId", googleAccountId);
    if (shouldUseGoogleOnly || !metaAccountId) {
      url.searchParams.set("platform", "google");
    }
  }

  if (metaAccountId && !shouldUseGoogleOnly) {
    url.searchParams.set("metaAccountId", metaAccountId);
    if (shouldUseMetaOnly || !googleAccountId) {
      url.searchParams.set("platform", "meta");
    }
  }

  return url.toString();
}

function buildR2Key(message: ReportQueueMessage): string {
  const sections = buildReportSections(message.target);
  const reportType = normalizeReportType(message.target.reportType);
  const platform = sections.length > 1 ? "combined" : inferPlatform(message.target).toLowerCase();
  const accountId =
    sections
    .map((section) => normalizeOptional(section.googleAccountId) ?? normalizeOptional(section.metaAccountId))
    .filter((id): id is string => Boolean(id))
      .join("-") || "unknown";
  return `reports/${message.reportMonthKey}/${reportType}/${platform}/${accountId.replace(/[^a-z0-9-]+/gi, "")}/${message.jobId}/${message.itemId}/${reportType}.pdf`;
}

function buildDownloadUrl(env: Env, r2Key: string): string | null {
  const baseUrl = env.REPORT_DOWNLOAD_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("key", r2Key);
  return url.toString();
}

function buildReportSections(target: ReportTarget): ReportSectionTarget[] {
  const metaAccountIds = splitAccountIds(target.metaAccountId);
  const googleAccountIds = splitAccountIds(target.googleAccountId);
  const sections: ReportSectionTarget[] = [];

  metaAccountIds.forEach((accountId) => {
    sections.push({
      ...target,
      googleAccountId: null,
      metaAccountId: accountId,
      platform: "Meta",
      sectionLabel: `${target.clientName} - Meta ${accountId}`,
    });
  });

  googleAccountIds.forEach((accountId) => {
    sections.push({
      ...target,
      googleAccountId: accountId,
      metaAccountId: null,
      platform: "Google",
      sectionLabel: `${target.clientName} - Google ${accountId}`,
    });
  });

  if (sections.length > 0) {
    return sections;
  }

  return [
    {
      ...target,
      sectionLabel: target.clientName,
    },
  ];
}

function splitAccountIds(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeTargets(targets: ReportTarget[], defaults: Pick<CreateJobRequest, "reportType" | "country"> = {}): ReportTarget[] {
  return targets
    .map((target) => ({
      ...target,
      clientName: target.clientName?.trim(),
      googleAccountId: normalizeOptional(target.googleAccountId),
      metaAccountId: normalizeOptional(target.metaAccountId),
      recipientEmail: normalizeOptional(target.recipientEmail),
      ccEmail: normalizeOptional(target.ccEmail),
      reportType: normalizeReportType(target.reportType ?? defaults.reportType),
      country: normalizeAdvancedCountry(target.country ?? defaults.country),
      platform: target.platform?.trim() || inferPlatform(target),
    }))
    .filter((target) => Boolean(target.clientName && (target.googleAccountId || target.metaAccountId)));
}

function expandAdvancedTargets(targets: ReportTarget[]): ReportTarget[] {
  return targets.flatMap((target) => {
    if (normalizeReportType(target.reportType) !== "advanced") {
      return [target];
    }

    const googleAccountIds = splitAccountIds(target.googleAccountId);
    const metaAccountIds = splitAccountIds(target.metaAccountId);
    const splitTargets: ReportTarget[] = [
      ...metaAccountIds.map((accountId) => ({
        ...target,
        googleAccountId: null,
        metaAccountId: accountId,
        platform: "Meta",
      })),
      ...googleAccountIds.map((accountId) => ({
        ...target,
        googleAccountId: accountId,
        metaAccountId: null,
        platform: "Google",
      })),
    ];

    return splitTargets.length > 0 ? splitTargets : [target];
  });
}

function resolveRecipientEmail(env: Env, target: ReportTarget, testMode: boolean): string | null {
  if (testMode) {
    return env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() || TEST_RECIPIENT_FALLBACK;
  }

  return normalizeOptional(target.recipientEmail);
}

function resolveTargetAccountId(target: ReportTarget): string {
  return normalizeOptional(target.googleAccountId) ?? normalizeOptional(target.metaAccountId) ?? "missing";
}

function buildReportIdempotencyKey(
  target: ReportTarget,
  input: {
    reportMonthKey: string;
    scheduledDate: string;
  }
): string {
  const reportType = normalizeReportType(target.reportType);
  const accountId =
    normalizeOptional(target.googleAccountId) ??
    normalizeOptional(target.metaAccountId) ??
    "unknown";

  return [
    accountId,
    reportType,
    input.reportMonthKey,
    input.scheduledDate,
  ].join(":");
}

function inferPlatform(target: ReportTarget): string {
  return target.metaAccountId && !target.googleAccountId ? "Meta" : "Google";
}

function normalizeReportType(value: string | null | undefined): "overall" | "advanced" {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.includes("advance") ? "advanced" : "overall";
}

function isScheduledReportType(value: string): value is "monthlyOverall" | "monthlyAdvanced" | "biweeklyOverall" {
  return value === "monthlyOverall" || value === "monthlyAdvanced" || value === "biweeklyOverall";
}

function resolveJobReportType(
  input: CreateJobRequest,
  scheduledDate: string
): "monthlyOverall" | "monthlyAdvanced" | "biweeklyOverall" {
  if (input.manualReportType && isScheduledReportType(input.manualReportType)) {
    return input.manualReportType;
  }
  if (normalizeReportType(input.reportType) === "advanced") {
    return "monthlyAdvanced";
  }
  return new Date(`${scheduledDate}T00:00:00.000Z`).getUTCDate() === 15
    ? "biweeklyOverall"
    : "monthlyOverall";
}

async function findActiveReportJob(
  env: Env,
  reportType: string,
  reportMonthKey: string
): Promise<JobRow | null> {
  return env.REPORT_JOBS_DB.prepare(
    `SELECT * FROM report_jobs
     WHERE report_type = ? AND report_month_key = ? AND status IN ('queued', 'processing')
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(reportType, reportMonthKey)
    .first<JobRow>();
}

function isAdvancedReportAutomationEnabled(env: Env): boolean {
  const value = env.ADVANCED_REPORT_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}

function normalizeAdvancedCountry(value: string | null | undefined): string {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : "MY";
}

function resolveScheduledDate(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function summarizeItems(items: JobItemRow[]): Record<string, number> {
  return items.reduce<Record<string, number>>(
    (summary, item) => {
      summary[item.status] = (summary[item.status] ?? 0) + 1;
      return summary;
    },
    { total: items.length }
  );
}

function parseEmailList(value: string | null | undefined, fallback: string[] = []): string[] {
  const source = value?.trim() ? value : fallback.join(",");
  return Array.from(
    new Set(
      source
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function buildEmailLogoUrl(env: Env): string {
  const configured = normalizeOptional(env.REPORT_EMAIL_LOGO_URL);
  if (configured) {
    return configured;
  }

  return DEFAULT_EMAIL_LOGO_URL;
}

function formatResendDeliveryError(message: string, fromAddress: string): string {
  const senderDomain = extractEmailDomain(fromAddress);
  if (!/domain is not verified|verify a domain|verified domain/i.test(message)) {
    return message;
  }

  return `${message} Sender "${fromAddress}" resolves to domain "${senderDomain ?? "unknown"}". Set RESEND_FROM_MONTHLY_REPORT to a Resend-verified sender domain, or add and verify this domain in Resend before running live sends.`;
}

function extractEmailDomain(value: string): string | null {
  const match = value.match(/<[^@\s<>]+@([^>\s]+)>|[^@\s<>]+@([^>\s]+)/);
  return (match?.[1] ?? match?.[2] ?? null)?.toLowerCase() ?? null;
}

function buildEmailHtml(input: {
  clientName: string;
  reportMonthLabel: string;
  downloadUrl: string | null;
  logoUrl: string;
}): string {
  const downloadText = input.downloadUrl
    ? `
      <tr>
        <td style="padding:0 32px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:16px 18px;">
                <div style="font-size:13px;line-height:1.5;color:#7f1d1d;">Download link</div>
                <a href="${escapeHtml(input.downloadUrl)}" style="display:inline-block;margin-top:4px;color:#b40012;font-weight:700;text-decoration:none;">Open stored PDF report</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:28px 0;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:0 12px;">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;border-collapse:separate;border-spacing:0;">
              <tr>
                <td align="center" style="padding:26px 32px 18px;background:#ffffff;">
                  <img src="${escapeHtml(input.logoUrl)}" width="180" alt="LOCUS-T" style="display:block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
              <tr>
                <td style="background:#b40012;background-image:linear-gradient(135deg,#8f0010 0%,#d7192a 100%);padding:30px 32px;color:#ffffff;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">Monthly Performance Report</div>
                  <div style="font-size:28px;line-height:1.2;font-weight:800;margin-top:8px;">${escapeHtml(input.clientName)}</div>
                  <div style="display:inline-block;margin-top:14px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:7px 12px;font-size:14px;font-weight:700;">${escapeHtml(input.reportMonthLabel)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px 10px;">
                  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">Dear Valued Client,</p>
                  <p style="margin:0;font-size:16px;line-height:1.65;color:#374151;">Please find your Digital Ads Campaign Performance Report for this month attached in the PDF below.</p>
                </td>
              </tr>
              ${downloadText}
              <tr>
                <td style="padding:0 32px 30px;">
                  <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">Best regards,<br/><strong>LOCUS-T</strong></p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                  This report was generated automatically from the LOCUS-T reporting dashboard.<br/>
                  You received this email because LOCUS-T scheduled it to be sent to you regularly.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function buildCompletionNotificationEmailHtml(input: {
  job: JobRow;
  items: JobItemRow[];
  failedItems: JobItemRow[];
  logoUrl: string;
}): string {
  const completedCount = input.items.filter((item) => item.status === "completed").length;
  const failedCount = input.failedItems.length;
  const skippedCount = resolveSkippedCount(input.job, input.items);
  const summaryCards = [
    { label: "Total", value: input.items.length },
    { label: "Completed", value: completedCount },
    { label: "Failed", value: failedCount },
    ...(skippedCount > 0 ? [{ label: "Skipped", value: skippedCount }] : []),
  ];
  const summaryCardWidth = `${(100 / summaryCards.length).toFixed(3)}%`;
  const accountRows = input.items
    .map((item) => {
      const accountId = formatAccountIdForEmail(item);
      return `
        <tr>
          <td style="padding:12px 14px;border-top:1px solid #e5e7eb;color:#111827;font-size:13px;line-height:1.45;">${escapeHtml(item.client_name)}</td>
          <td style="padding:12px 14px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(accountId)}</td>
          <td style="padding:12px 14px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${buildAccountStatusBadge(item, Boolean(input.job.test_mode))}</td>
        </tr>
      `;
    })
    .join("");
  const failedRows = input.failedItems
    .map((item) => {
      const accountId = formatAccountIdForEmail(item);
      return `
        <tr>
          <td style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#111827;font-size:13px;line-height:1.45;">${escapeHtml(item.client_name)}</td>
          <td style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(item.platform ?? "-")}</td>
          <td style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(accountId)}</td>
          <td style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(item.recipient_email ?? "-")}</td>
          <td align="center" style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#b91c1c;font-size:13px;line-height:1.45;font-weight:700;"><span style="display:inline-block;background:#fee2e2;border-radius:999px;padding:5px 9px;">Failed</span></td>
          <td align="center" style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45;">${item.attempts}</td>
          <td style="padding:12px 10px;border-top:1px solid #e5e7eb;color:#991b1b;font-size:13px;line-height:1.45;">${escapeHtml(truncateForEmail(item.error_message ?? "Unknown error.", 240))}</td>
        </tr>
      `;
    })
    .join("");
  const summaryText = failedCount > 0
    ? "The monthly report automation has finished. Some reports failed after the retry limit and need review."
    : "All monthly report emails were generated and sent successfully.";
  const failureTable = failedCount > 0
    ? `
              <tr>
                <td style="padding:0 32px 30px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th align="left" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Client</th>
                        <th align="left" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Platform</th>
                        <th align="left" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Account</th>
                        <th align="left" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Recipient</th>
                        <th align="center" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Status</th>
                        <th align="center" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Attempts</th>
                        <th align="left" style="background:#f9fafb;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Final Error</th>
                      </tr>
                    </thead>
                    <tbody>${failedRows}</tbody>
                  </table>
                </td>
              </tr>`
    : "";

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:28px 0;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:0 12px;">
            <table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:760px;max-width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;border-collapse:separate;border-spacing:0;">
              <tr>
                <td align="center" style="padding:26px 32px 18px;background:#ffffff;">
                  <img src="${escapeHtml(input.logoUrl)}" width="180" alt="LOCUS-T" style="display:block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
              <tr>
                <td style="background:#b40012;background-image:linear-gradient(135deg,#8f0010 0%,#d7192a 100%);padding:28px 32px;color:#ffffff;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">Monthly Report Automation Summary</div>
                  <div style="font-size:26px;line-height:1.2;font-weight:800;margin-top:8px;">Report sending finished</div>
                  <div style="display:inline-block;margin-top:14px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:7px 12px;font-size:14px;font-weight:700;">${escapeHtml(input.job.report_month_label)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 32px 10px;">
                  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">Dear Team,</p>
                  <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">${escapeHtml(summaryText)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;">
                    <tr>
                      ${summaryCards
                        .map((card, index) =>
                          buildAlertStatCell(card.label, card.value, summaryCardWidth, index === summaryCards.length - 1)
                        )
                        .join("")}
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 32px 22px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                    ${buildAlertDetailRow("Job ID", input.job.id)}
                    ${buildAlertDetailRow("Status", input.job.status)}
                    ${buildAlertDetailRow("Report Month", input.job.report_month_label)}
                    ${buildAlertDetailRow("Date Range", `${input.job.start_date} to ${input.job.end_date}`)}
                    ${buildAlertDetailRow("Test Mode", input.job.test_mode ? "Yes" : "No")}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 30px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e5e7eb;">
                    <tr>
                      <td style="padding:22px 0 12px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                          <tr>
                            <td align="left" style="padding:0 12px 0 0;">
                              <div style="font-size:18px;line-height:1.3;font-weight:800;color:#111827;">Account Details</div>
                            </td>
                            <td align="right" style="padding:0 0 0 12px;">
                              <a href="#account-list" style="display:inline-block;border:1px solid #d7192a;border-radius:999px;padding:9px 14px;color:#b40012;background:#ffffff;font-size:12px;line-height:1;font-weight:800;text-decoration:none;">See account names</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0;">
                        <a id="account-list" name="account-list" style="display:block;text-decoration:none;line-height:0;font-size:0;">&nbsp;</a>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
                          <thead>
                            <tr>
                              <th align="left" style="background:#f9fafb;color:#374151;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Account Name</th>
                              <th align="left" style="background:#f9fafb;color:#374151;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Account ID</th>
                              <th align="left" style="background:#f9fafb;color:#374151;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Status</th>
                            </tr>
                          </thead>
                          <tbody>${accountRows}</tbody>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${failureTable}
              <tr>
                <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                  This internal notification was generated automatically from the LOCUS-T reporting dashboard.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function buildAlertStatCell(label: string, value: number, width: string, isLast = false): string {
  return `
    <td style="width:${width};padding:0 ${isLast ? "0" : "6px"} 0 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;">
        <tr>
          <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;">
            <div style="font-size:12px;color:#6b7280;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>
            <div style="font-size:26px;line-height:1.2;font-weight:800;color:#111827;margin-top:6px;">${value}</div>
          </td>
        </tr>
      </table>
    </td>
  `;
}

function buildAlertDetailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 14px;color:#6b7280;font-size:13px;font-weight:700;border-top:1px solid #e5e7eb;width:150px;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px;color:#111827;font-size:13px;border-top:1px solid #e5e7eb;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function resolveSkippedCount(job: JobRow, items: JobItemRow[]): number {
  const metadata = parseJobMetadata(job.metadata_json);
  const metadataSkipped = readMetadataNumber(metadata, "skippedTotal");
  if (metadataSkipped !== null) {
    return metadataSkipped;
  }

  return items.filter((item) => isSkippedStatus(item.status)).length;
}

function parseJobMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readMetadataNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  const value = metadata?.[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatAccountIdForEmail(item: JobItemRow): string {
  const googleAccountId = normalizeOptional(item.google_account_id);
  const metaAccountId = normalizeOptional(item.meta_account_id);

  if (googleAccountId && metaAccountId && googleAccountId === metaAccountId) {
    return googleAccountId;
  }

  if (googleAccountId && metaAccountId) {
    return `Google: ${googleAccountId}, Meta: ${metaAccountId}`;
  }

  return googleAccountId ?? metaAccountId ?? "-";
}

function buildAccountStatusBadge(item: JobItemRow, testMode: boolean): string {
  const badge = getAccountStatusBadge(item.status, testMode);
  return `<span style="display:inline-block;background:${badge.background};border:1px solid ${badge.border};border-radius:999px;padding:5px 10px;color:${badge.color};font-size:12px;line-height:1;font-weight:800;">${escapeHtml(badge.label)}</span>`;
}

function getAccountStatusBadge(
  status: string,
  testMode: boolean
): { label: string; background: string; border: string; color: string } {
  const normalized = status.trim().toLowerCase();

  if (normalized === "test_sent" || (testMode && normalized === "completed")) {
    return {
      label: "Test Sent",
      background: "#dbeafe",
      border: "#bfdbfe",
      color: "#1d4ed8",
    };
  }

  if (normalized === "completed") {
    return {
      label: "Completed",
      background: "#dcfce7",
      border: "#bbf7d0",
      color: "#15803d",
    };
  }

  if (normalized === "failed") {
    return {
      label: "Failed",
      background: "#fee2e2",
      border: "#fecaca",
      color: "#b91c1c",
    };
  }

  if (isSkippedStatus(normalized)) {
    return {
      label: "Skipped",
      background: "#fef3c7",
      border: "#fde68a",
      color: "#b45309",
    };
  }

  return {
    label: toTitleCaseStatus(status),
    background: "#f3f4f6",
    border: "#e5e7eb",
    color: "#4b5563",
  };
}

function isSkippedStatus(status: string): boolean {
  return status.trim().toLowerCase().includes("skip");
}

function toTitleCaseStatus(status: string): string {
  const normalized = status.trim().replace(/[_-]+/g, " ");
  if (!normalized) {
    return "Pending";
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateForEmail(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function buildReportEmailSubject(
  reportType: "overall" | "advanced",
  clientName: string,
  reportMonthLabel: string
): string {
  const label = reportType === "advanced" ? "Monthly Advanced Report" : "Monthly Ads Report";
  return `${label} - ${clientName} - ${reportMonthLabel}`;
}

function buildPdfFilename(
  clientName: string,
  reportMonthLabel: string,
  reportType: "overall" | "advanced" = "overall"
): string {
  const label = reportType === "advanced" ? "Advanced Report" : "Monthly Report";
  return `${label}-${sanitizeFilenameSegment(clientName)}-${sanitizeFilenameSegment(reportMonthLabel)}.pdf`;
}

function sanitizeFilenameSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "report";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return toBase64(new Uint8Array(buffer));
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  let binary = "";
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.WORKER_API_SECRET?.trim() || env.REPORT_AUTOMATION_SECRET?.trim();
  if (!expected) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function safeReadJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }
    return request.json();
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function hasD1Changes(result: D1Result): boolean {
  const meta = result.meta;
  return Boolean(
    meta &&
      typeof meta === "object" &&
      "changes" in meta &&
      typeof meta.changes === "number" &&
      meta.changes > 0
  );
}

function readRequired(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required Worker binding ${name}.`);
  }
  return trimmed;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
