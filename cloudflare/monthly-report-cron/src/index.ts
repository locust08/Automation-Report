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
  REPORT_DOWNLOAD_BASE_URL?: string;
  BROWSER_LAUNCH_SPACING_MS?: string;
  REPORT_FAILURE_ALERT_RECIPIENTS?: string;
  REPORT_FAILURE_ALERT_CC?: string;
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
}

interface ReportSectionTarget extends ReportTarget {
  sectionLabel: string;
}

interface CreateJobRequest {
  accounts?: ReportTarget[];
  forceTestMode?: boolean;
  sendEmail?: boolean;
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
  report_month_key: string;
  report_month_label: string;
  start_date: string;
  end_date: string;
  total_items: number;
  send_email: number;
  test_mode: number;
  failure_alert_sent_at: string | null;
  failure_alert_resend_email_id: string | null;
  created_at: string;
  updated_at: string;
}

interface JobItemRow {
  id: string;
  job_id: string;
  status: string;
  client_name: string;
  platform: string | null;
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
const MONTHLY_PRODUCTION_CRON = "0 4 5 * *";
const TEST_RECIPIENT_FALLBACK = "eason@locus-t.com.my";
const NOTION_API_VERSION = "2026-03-11";
const BROWSER_LAUNCH_LIMITER_NAME = "global-browser-launch-limiter";
const DEFAULT_BROWSER_LAUNCH_SPACING_MS = 7000;
const BROWSER_RATE_LIMIT_RETRY_MS = 60000;
const BROWSER_RATE_LIMIT_RETRY_JITTER_MS = 15000;
const REPORT_ITEM_FINAL_FAILURE_ATTEMPTS = 6;
const DEFAULT_FAILURE_ALERT_RECIPIENTS = ["eason@locus-t.com.my", "ava@locus-t.com.my"];
const EMAIL_LOGO_CONTENT_ID = "locus-t-logo";
const EMAIL_LOGO_PNG_BASE64 =
  "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";

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      createReportJob(
        env,
        {
          sendEmail: true,
          forceTestMode: false,
        },
        {
          source: "scheduled",
          scheduledCron: controller.cron,
          scheduledTime: new Date(controller.scheduledTime).toISOString(),
        }
      )
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
      schedule: MONTHLY_PRODUCTION_CRON,
      timezone: "UTC",
      malaysiaTime: "12:00 on day 5",
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
  const resolved = await resolveTargets(env, input, testMode);
  const targets = resolved.targets;

  if (targets.length === 0) {
    return {
      success: false,
      error: "No valid report targets resolved.",
      metadata,
    };
  }

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const jobStatus = targets.length > 0 ? "queued" : "empty";

  await env.REPORT_JOBS_DB.prepare(
    `INSERT INTO report_jobs (
      id, status, report_month_key, report_month_label, start_date, end_date,
      total_items, send_email, test_mode, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      jobId,
      jobStatus,
      resolved.reportMonthKey,
      resolved.reportMonthLabel,
      resolved.startDate,
      resolved.endDate,
      targets.length,
      sendEmail ? 1 : 0,
      testMode ? 1 : 0,
      JSON.stringify(metadata),
      now,
      now
    )
    .run();

  for (const target of targets) {
    const itemId = crypto.randomUUID();
    await env.REPORT_JOBS_DB.prepare(
      `INSERT INTO report_job_items (
        id, job_id, status, client_name, platform, google_account_id, meta_account_id,
        recipient_email, cc_email, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        jobId,
        "queued",
        target.clientName,
        target.platform ?? inferPlatform(target),
        normalizeOptional(target.googleAccountId),
        normalizeOptional(target.metaAccountId),
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

  return {
    success: true,
    jobId,
    status: jobStatus,
    total: targets.length,
    reportMonthKey: resolved.reportMonthKey,
    reportMonthLabel: resolved.reportMonthLabel,
    metadata,
  };
}

async function processReportItem(env: Env, message: ReportQueueMessage): Promise<void> {
  const now = new Date().toISOString();
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

  try {
    const pdf = await renderPdfForReportMessage(env, message);
    const r2Key = buildR2Key(message);
    const filename = buildPdfFilename(message.target.clientName, message.reportMonthLabel);

    await env.REPORT_PDFS.put(r2Key, pdf, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${filename}"`,
      },
      customMetadata: {
        jobId: message.jobId,
        itemId: message.itemId,
        clientName: message.target.clientName,
        reportMonthKey: message.reportMonthKey,
      },
    });

    let resendEmailId: string | null = null;
    if (message.sendEmail) {
      const emailResult = await sendReportEmail(env, {
        target: message.target,
        reportMonthLabel: message.reportMonthLabel,
        pdf,
        r2Key,
        filename,
      });
      resendEmailId = emailResult.resendEmailId;
    }

    await env.REPORT_JOBS_DB.prepare(
      `UPDATE report_job_items
       SET status = ?, r2_key = ?, report_url = ?, resend_email_id = ?, error_message = NULL, updated_at = ?
       WHERE id = ? AND job_id = ?`
    )
      .bind("completed", r2Key, buildReportUrl(env, message), resendEmailId, new Date().toISOString(), message.itemId, message.jobId)
      .run();
    await refreshJobStatus(env, message.jobId);
    await maybeSendJobFailureAlert(env, message.jobId);
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
    if (finalFailure) {
      await maybeSendJobFailureAlert(env, message.jobId);
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
    `SELECT id, job_id, status, client_name, platform, google_account_id, meta_account_id,
      recipient_email, cc_email, attempts, r2_key, report_url, resend_email_id, error_message, updated_at
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
    `SELECT id, client_name, platform, google_account_id, meta_account_id, recipient_email, cc_email
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
        object.httpMetadata?.contentDisposition ?? `attachment; filename="${buildPdfFilename(item.client_name, "report")}"`,
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
    }).catch((error) => {
      console.error("[monthly-report-automation] Vercel target enrichment failed", formatError(error));
      return { targets: input.accounts ?? [] };
    });
    const enrichedTargets = await enrichTargetsFromNotion(env, payload.targets ?? input.accounts);

    return {
      ...range,
      targets: normalizeTargets(enrichedTargets),
    };
  }

  const payload = await resolveTargetsFromVercel(env, {
    forceTestMode: testMode,
  });

  return {
    startDate: payload.startDate ?? resolveDateRange(input).startDate,
    endDate: payload.endDate ?? resolveDateRange(input).endDate,
    reportMonthKey: payload.reportMonthKey ?? resolveDateRange(input).reportMonthKey,
    reportMonthLabel: payload.reportMonthLabel ?? resolveDateRange(input).reportMonthLabel,
    targets: normalizeTargets(payload.targets ?? []),
  };
}

async function resolveTargetsFromVercel(
  env: Env,
  body: {
    forceTestMode: boolean;
    overrideTargets?: ReportTarget[];
  }
): Promise<{
  startDate?: string;
  endDate?: string;
  reportMonthKey?: string;
  reportMonthLabel?: string;
  targets?: ReportTarget[];
}> {
  const endpoint =
    env.VERCEL_REPORT_TARGETS_ENDPOINT?.trim() ||
    `${trimTrailingSlash(env.VERCEL_APP_BASE_URL)}/api/report-pdf/targets`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readRequired(env.REPORT_AUTOMATION_SECRET, "REPORT_AUTOMATION_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

async function enrichTargetsFromNotion(env: Env, targets: ReportTarget[]): Promise<ReportTarget[]> {
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

        return {
          ...target,
          clientName: clientName ?? target.clientName,
          googleAccountId: target.googleAccountId ?? matchedRows.find((row) => row.googleAccountId)?.googleAccountId ?? null,
          metaAccountId: target.metaAccountId ?? matchedRows.find((row) => row.metaAccountId)?.metaAccountId ?? null,
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
    clientRelationPageIds: getNotionRelationIds(properties, ["Client"]),
  };
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

async function renderWithBrowserRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isBrowserRateLimitError(error)) {
      throw error;
    }

    const delayMs = BROWSER_RATE_LIMIT_RETRY_MS + Math.floor(Math.random() * BROWSER_RATE_LIMIT_RETRY_JITTER_MS);
    console.warn(
      `[monthly-report-automation] browser launch rate limited; retrying after ${delayMs}ms`
    );
    await sleep(delayMs);
    return operation();
  }
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

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType("screen");
    await page.goto(reportUrl, {
      waitUntil: "networkidle0",
      timeout: 45000,
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
    await page.waitForSelector("[data-report-capture-root='true']", {
      visible: true,
      timeout: 45000,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
      return Boolean(root && root.scrollHeight > 0 && root.scrollWidth > 0);
    });
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
    await browser.close();
  }
}

async function renderPdfForReportMessage(env: Env, message: ReportQueueMessage): Promise<ArrayBuffer> {
  return renderWithBrowserRateLimitRetry(async () => {
    const sections = buildReportSections(message.target);

    if (sections.length <= 1) {
      return renderPdfWithBrowserRun(env, buildReportUrl(env, message, sections[0] ?? message.target));
    }

    return renderStackedReportSectionsPdf(env, message, sections);
  });
}

async function renderStackedReportSectionsPdf(
  env: Env,
  message: ReportQueueMessage,
  sections: ReportSectionTarget[]
): Promise<ArrayBuffer> {
  await waitForBrowserLaunchSlot(env);
  const browser = await puppeteer.launch(env.REPORT_BROWSER);

  try {
    const captures = [];

    for (const section of sections) {
      const page = await browser.newPage();
      try {
        const reportUrl = buildReportUrl(env, message, section);
        const capture = await captureReportSectionImage(page, reportUrl);
        captures.push({
          ...capture,
          label: section.sectionLabel,
        });
      } finally {
        await page.close();
      }
    }

    const width = Math.max(...captures.map((capture) => capture.width), 1440);
    const sectionGap = 36;
    const totalHeight = captures.reduce(
      (sum, capture) => sum + capture.height + sectionGap,
      sectionGap
    );
    const page = await browser.newPage();
    await page.setViewport({
      width,
      height: Math.min(Math.max(totalHeight, 1200), 6000),
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType("screen");
    await page.setContent(buildStackedReportHtml(captures, width), {
      waitUntil: "networkidle0",
    });
    await page.addStyleTag({
      content: `
        @page {
          size: ${width}px ${totalHeight}px;
          margin: 0;
        }
      `,
    });
    const pdf = await page.pdf({
      width: `${width}px`,
      height: `${totalHeight}px`,
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
    await browser.close();
  }
}

async function captureReportSectionImage(
  page: Page,
  reportUrl: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  await page.setViewport({
    width: 1440,
    height: 2200,
    deviceScaleFactor: 1,
  });
  await page.emulateMediaType("screen");
  await page.goto(reportUrl, {
    waitUntil: "networkidle0",
    timeout: 45000,
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
  await page.waitForSelector("[data-report-capture-root='true']", {
    visible: true,
    timeout: 45000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
    return Boolean(root && root.scrollHeight > 0 && root.scrollWidth > 0);
  });
  const clip = await page.$eval("[data-report-capture-root='true']", (element) => {
    const target = element as HTMLElement;
    const rect = target.getBoundingClientRect();
    return {
      x: Math.floor(rect.left + window.scrollX),
      y: Math.floor(rect.top + window.scrollY),
      width: Math.ceil(Math.max(rect.width, target.scrollWidth)),
      height: Math.ceil(Math.max(rect.height, target.scrollHeight)),
    };
  });
  const screenshot = await page.screenshot({
    type: "png",
    clip,
    captureBeyondViewport: true,
  });

  return {
    dataUrl: `data:image/png;base64,${toBase64(screenshot)}`,
    width: clip.width,
    height: clip.height,
  };
}

function buildStackedReportHtml(
  captures: Array<{ dataUrl: string; width: number; height: number; label: string }>,
  width: number
): string {
  const body = captures
    .map(
      (capture, index) => `
        <section style="width:${width}px;margin:0 0 36px 0;page-break-inside:avoid;break-inside:avoid;">
          ${
            index > 0
              ? `<div style="height:36px;background:#f3f4f6;border-top:4px solid #ef0000;"></div>`
              : ""
          }
          <img src="${capture.dataUrl}" width="${capture.width}" height="${capture.height}" alt="${escapeHtml(capture.label)}" style="display:block;width:${capture.width}px;height:${capture.height}px;margin:0 auto;" />
        </section>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html,
          body {
            margin: 0;
            padding: 0;
            width: ${width}px;
            background: #f3f4f6;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
}

async function sendReportEmail(
  env: Env,
  input: {
    target: ReportTarget;
    reportMonthLabel: string;
    pdf: ArrayBuffer;
    r2Key: string;
    filename: string;
  }
): Promise<{ resendEmailId: string | null }> {
  const recipientEmail = normalizeOptional(input.target.recipientEmail);
  if (!recipientEmail) {
    throw new Error(`Missing recipient email for ${input.target.clientName}.`);
  }

  const deliveryMode = env.REPORT_EMAIL_DELIVERY_MODE ?? "attachment";
  const attachments: Array<Record<string, string>> = [
    {
      filename: "locus-t-logo.png",
      content: EMAIL_LOGO_PNG_BASE64,
      contentId: EMAIL_LOGO_CONTENT_ID,
    },
  ];

  const body: Record<string, unknown> = {
    from: env.RESEND_FROM_MONTHLY_REPORT?.trim() || "Locus-T <no-reply@locus-t.com.my>",
    to: [recipientEmail],
    cc: normalizeOptional(input.target.ccEmail) ? [input.target.ccEmail] : undefined,
    subject: `Monthly Ads Report - ${input.target.clientName} - ${input.reportMonthLabel}`,
    html: buildEmailHtml({
      clientName: input.target.clientName,
      reportMonthLabel: input.reportMonthLabel,
      downloadUrl: deliveryMode === "link" ? buildDownloadUrl(env, input.r2Key) : null,
      logoContentId: EMAIL_LOGO_CONTENT_ID,
    }),
    attachments,
  };

  if (deliveryMode === "attachment") {
    attachments.push({
      filename: input.filename,
      content: arrayBufferToBase64(input.pdf),
    });
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
    throw new Error(payload?.error?.message ?? `Resend email failed with status ${response.status}.`);
  }

  return {
    resendEmailId: payload?.id ?? null,
  };
}

async function sendFailureAlertEmail(
  env: Env,
  input: {
    job: JobRow;
    items: JobItemRow[];
    failedItems: JobItemRow[];
  }
): Promise<{ resendEmailId: string | null }> {
  const recipients = parseEmailList(env.REPORT_FAILURE_ALERT_RECIPIENTS, DEFAULT_FAILURE_ALERT_RECIPIENTS);
  if (recipients.length === 0) {
    throw new Error("Missing failure alert recipients.");
  }

  const cc = parseEmailList(env.REPORT_FAILURE_ALERT_CC, []);
  const subjectPrefix = input.job.test_mode ? "[TEST] " : "";
  const body: Record<string, unknown> = {
    from: env.RESEND_FROM_MONTHLY_REPORT?.trim() || "Locus-T <no-reply@locus-t.com.my>",
    to: recipients,
    cc: cc.length > 0 ? cc : undefined,
    subject: `${subjectPrefix}[Report Automation Alert] ${input.failedItems.length} report${input.failedItems.length === 1 ? "" : "s"} failed - ${input.job.report_month_label}`,
    html: buildFailureAlertEmailHtml({
      job: input.job,
      items: input.items,
      failedItems: input.failedItems,
      logoContentId: EMAIL_LOGO_CONTENT_ID,
    }),
    attachments: [
      {
        filename: "locus-t-logo.png",
        content: EMAIL_LOGO_PNG_BASE64,
        contentId: EMAIL_LOGO_CONTENT_ID,
      },
    ],
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
    throw new Error(payload?.error?.message ?? `Resend failure alert failed with status ${response.status}.`);
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

async function maybeSendJobFailureAlert(env: Env, jobId: string): Promise<void> {
  const job = await env.REPORT_JOBS_DB.prepare("SELECT * FROM report_jobs WHERE id = ?")
    .bind(jobId)
    .first<JobRow>();

  if (!job || job.failure_alert_sent_at || !isTerminalFailureJobStatus(job.status)) {
    return;
  }

  const itemsResult = await env.REPORT_JOBS_DB.prepare(
    `SELECT id, job_id, status, client_name, platform, google_account_id, meta_account_id,
      recipient_email, cc_email, attempts, r2_key, report_url, resend_email_id, error_message, updated_at
     FROM report_job_items
     WHERE job_id = ?
     ORDER BY created_at ASC`
  )
    .bind(jobId)
    .all<JobItemRow>();
  const items = itemsResult.results ?? [];
  const failedItems = items.filter((item) => item.status === "failed");
  const isTerminal = items.length > 0 && items.every((item) => item.status === "completed" || item.status === "failed");

  if (!isTerminal || failedItems.length === 0) {
    return;
  }

  const alertSentAt = new Date().toISOString();
  const claim = await env.REPORT_JOBS_DB.prepare(
    "UPDATE report_jobs SET failure_alert_sent_at = ?, updated_at = ? WHERE id = ? AND failure_alert_sent_at IS NULL"
  )
    .bind(alertSentAt, alertSentAt, jobId)
    .run();

  if (!hasD1Changes(claim)) {
    return;
  }

  try {
    const result = await sendFailureAlertEmail(env, {
      job: {
        ...job,
        failure_alert_sent_at: alertSentAt,
      },
      items,
      failedItems,
    });

    await env.REPORT_JOBS_DB.prepare(
      "UPDATE report_jobs SET failure_alert_resend_email_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(result.resendEmailId, new Date().toISOString(), jobId)
      .run();
  } catch (error) {
    await env.REPORT_JOBS_DB.prepare(
      "UPDATE report_jobs SET failure_alert_sent_at = NULL, updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), jobId)
      .run();
    console.error("[monthly-report-automation] failure alert email failed", formatError(error));
  }
}

function isTerminalFailureJobStatus(status: string): boolean {
  return status === "failed" || status === "completed_with_failures";
}

function buildReportUrl(
  env: Env,
  message: ReportQueueMessage,
  target: ReportTarget = message.target
): string {
  const url = new URL("/overall", trimTrailingSlash(env.VERCEL_APP_BASE_URL));
  url.searchParams.set("startDate", message.startDate);
  url.searchParams.set("endDate", message.endDate);
  url.searchParams.set("screenshot", "1");
  url.searchParams.set("exportToken", env.REPORT_AUTOMATION_SECRET);

  const googleAccountId = normalizeOptional(target.googleAccountId);
  const metaAccountId = normalizeOptional(target.metaAccountId);

  if (googleAccountId) {
    url.searchParams.set("googleAccountId", googleAccountId);
    url.searchParams.set("platform", "google");
  }

  if (metaAccountId) {
    url.searchParams.set("metaAccountId", metaAccountId);
    if (!googleAccountId) {
      url.searchParams.set("platform", "meta");
    }
  }

  return url.toString();
}

function buildR2Key(message: ReportQueueMessage): string {
  const sections = buildReportSections(message.target);
  const platform = sections.length > 1 ? "split" : inferPlatform(message.target).toLowerCase();
  const accountId =
    sections
    .map((section) => normalizeOptional(section.googleAccountId) ?? normalizeOptional(section.metaAccountId))
    .filter((id): id is string => Boolean(id))
      .join("-") || "unknown";
  return `reports/${message.reportMonthKey}/${platform}/${accountId.replace(/[^a-z0-9-]+/gi, "")}/${message.jobId}/${message.itemId}/overall.pdf`;
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

function normalizeTargets(targets: ReportTarget[]): ReportTarget[] {
  return targets
    .map((target) => ({
      ...target,
      clientName: target.clientName?.trim(),
      googleAccountId: normalizeOptional(target.googleAccountId),
      metaAccountId: normalizeOptional(target.metaAccountId),
      recipientEmail: normalizeOptional(target.recipientEmail),
      ccEmail: normalizeOptional(target.ccEmail),
      platform: target.platform?.trim() || inferPlatform(target),
    }))
    .filter((target) => Boolean(target.clientName && (target.googleAccountId || target.metaAccountId)));
}

function resolveRecipientEmail(env: Env, target: ReportTarget, testMode: boolean): string | null {
  if (testMode) {
    return env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() || TEST_RECIPIENT_FALLBACK;
  }

  return normalizeOptional(target.recipientEmail);
}

function inferPlatform(target: ReportTarget): string {
  return target.metaAccountId && !target.googleAccountId ? "Meta" : "Google";
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

function parseEmailList(value: string | undefined, fallback: string[]): string[] {
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

function buildEmailHtml(input: {
  clientName: string;
  reportMonthLabel: string;
  downloadUrl: string | null;
  logoContentId: string;
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
                  <img src="cid:${escapeHtml(input.logoContentId)}" width="180" alt="LOCUS-T" style="display:block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
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

function buildFailureAlertEmailHtml(input: {
  job: JobRow;
  items: JobItemRow[];
  failedItems: JobItemRow[];
  logoContentId: string;
}): string {
  const completedCount = input.items.filter((item) => item.status === "completed").length;
  const failedCount = input.failedItems.length;
  const failedRows = input.failedItems
    .map((item) => {
      const accountId = item.google_account_id ?? item.meta_account_id ?? "-";
      return `
        <tr>
          <td style="padding:12px 10px;border-top:1px solid #fee2e2;color:#111827;font-size:13px;line-height:1.45;">${escapeHtml(item.client_name)}</td>
          <td style="padding:12px 10px;border-top:1px solid #fee2e2;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(item.platform ?? "-")}</td>
          <td style="padding:12px 10px;border-top:1px solid #fee2e2;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(accountId)}</td>
          <td align="center" style="padding:12px 10px;border-top:1px solid #fee2e2;color:#374151;font-size:13px;line-height:1.45;">${item.attempts}</td>
          <td style="padding:12px 10px;border-top:1px solid #fee2e2;color:#991b1b;font-size:13px;line-height:1.45;">${escapeHtml(truncateForEmail(item.error_message ?? "Unknown error.", 260))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:28px 0;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:0 12px;">
            <table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:760px;max-width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;border-collapse:separate;border-spacing:0;">
              <tr>
                <td align="center" style="padding:26px 32px 18px;background:#ffffff;">
                  <img src="cid:${escapeHtml(input.logoContentId)}" width="180" alt="LOCUS-T" style="display:block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
              <tr>
                <td style="background:#991b1b;background-image:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 32px;color:#ffffff;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">Monthly Report Automation Alert</div>
                  <div style="font-size:26px;line-height:1.2;font-weight:800;margin-top:8px;">${failedCount} report${failedCount === 1 ? "" : "s"} failed after retries</div>
                  <div style="display:inline-block;margin-top:14px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:7px 12px;font-size:14px;font-weight:700;">${escapeHtml(input.job.report_month_label)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 32px 10px;">
                  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">Dear Team,</p>
                  <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">The monthly report automation completed with failures after the retry limit. Please review the failed items below and rerun them after the root cause is resolved.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;">
                    <tr>
                      ${buildAlertStatCell("Total", input.items.length)}
                      ${buildAlertStatCell("Completed", completedCount)}
                      ${buildAlertStatCell("Failed", failedCount)}
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
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #fecaca;border-radius:14px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th align="left" style="background:#fee2e2;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Client</th>
                        <th align="left" style="background:#fee2e2;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Platform</th>
                        <th align="left" style="background:#fee2e2;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Account</th>
                        <th align="center" style="background:#fee2e2;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Attempts</th>
                        <th align="left" style="background:#fee2e2;color:#7f1d1d;padding:11px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Final Error</th>
                      </tr>
                    </thead>
                    <tbody>${failedRows}</tbody>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                  This internal alert was generated automatically from the LOCUS-T reporting dashboard.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function buildAlertStatCell(label: string, value: number): string {
  return `
    <td style="width:33.333%;padding:0 6px 0 0;">
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

function truncateForEmail(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function buildPdfFilename(clientName: string, reportMonthLabel: string): string {
  return `Monthly Report-${sanitizeFilenameSegment(clientName)}-${sanitizeFilenameSegment(reportMonthLabel)}.pdf`;
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
