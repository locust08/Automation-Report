import { jsPDF } from "jspdf";

import { extractNotionDatabaseId } from "@/lib/reporting/notion";
import { getCredentials } from "@/lib/reporting/env";
import { getOverallReport } from "@/lib/reporting/service";
import type { CampaignGroup, OverallReportPayload, SummaryMetric } from "@/lib/reporting/types";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import {
  getMonthlyReportAccounts,
  type MonthlyReportAccount,
} from "@/src/lib/notion/get-monthly-report-accounts";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";

interface NotionDataSourceResponse {
  properties?: Record<string, { type?: string } | undefined>;
  message?: string;
}

type MonthlyReportType = "overall" | "google" | "meta";
type SendStatus = "sent" | "failed" | "skipped";

interface MonthlyReportLog {
  notion_page_id: string;
  client_name: string;
  platform: MonthlyReportType;
  account_id: string | null;
  report_month: string;
  start_date: string;
  end_date: string;
  recipient_email: string | null;
  pic_email: string | null;
  send_status: SendStatus;
  resend_email_id: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface MonthlyReportSummary {
  total_found: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface NotionClientConfig {
  token: string;
  reportLogsDatabaseId: string | null;
}

export async function runMonthlyReportCron(): Promise<MonthlyReportSummary> {
  const startedAt = new Date();
  const notionConfig = getNotionClientConfig();
  const previousMonth = resolvePreviousMonthRange(startedAt);
  const testMode = parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const testRecipient = readOptionalEnv("MONTHLY_REPORT_TEST_RECIPIENT") ?? DEFAULT_TEST_RECIPIENT;

  console.info(
    `[monthly-report] cron started run_at=${startedAt.toISOString()} report_month=${previousMonth.reportMonth} start_date=${previousMonth.startDate} end_date=${previousMonth.endDate} test_mode=${testMode}`
  );

  const accountReadResult = await getMonthlyReportAccounts();
  const eligibleAccounts = accountReadResult.accounts;
  console.info(`[monthly-report] notion accounts found total=${eligibleAccounts.length}`);

  const accountsToProcess = testMode ? eligibleAccounts.slice(0, 1) : eligibleAccounts;
  const summary: MonthlyReportSummary = {
    total_found: eligibleAccounts.length,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: Math.max(eligibleAccounts.length - accountsToProcess.length, 0),
  };

  for (const account of accountsToProcess) {
    summary.processed += 1;
    console.info(
      `[monthly-report] account processing started page_id=${account.notionPageId} client=${account.clientName} platform=${resolveAccountReportType(account)}`
    );

    const createdAt = new Date().toISOString();
    let log: MonthlyReportLog = {
      notion_page_id: account.notionPageId,
      client_name: account.clientName,
      platform: resolveAccountReportType(account),
      account_id: resolvePrimaryAccountId(account),
      report_month: previousMonth.reportMonth,
      start_date: previousMonth.startDate,
      end_date: previousMonth.endDate,
      recipient_email: testMode ? testRecipient : account.clientEmail,
      pic_email: account.picEmail,
      send_status: "failed",
      resend_email_id: null,
      error_message: null,
      created_at: createdAt,
      sent_at: null,
    };

    try {
      const defaultRecipients = resolveRecipients(account, { testMode, testRecipient });
      if (defaultRecipients.length === 0) {
        summary.skipped += 1;
        log = {
          ...log,
          send_status: "skipped",
          recipient_email: null,
          error_message: "No recipient email configured for this account.",
        };
        await persistReportLog(notionConfig, log);
        continue;
      }

      const reportPayload = await buildReportPayload(account, previousMonth.startDate, previousMonth.endDate);
      const pdfBuffer = await generateMonthlyReportPdf({
        account,
        reportPayload,
        reportMonth: previousMonth.reportMonthLabel,
      });
      console.info(
        `[monthly-report] pdf generated page_id=${account.notionPageId} bytes=${pdfBuffer.byteLength}`
      );

      const emailResult = await sendMonthlyReportEmail({
        account,
        pdfBuffer,
        reportMonthLabel: previousMonth.reportMonthLabel,
        reportMonthKey: previousMonth.reportMonth,
      });
      if (!emailResult.success) {
        throw new Error(emailResult.errorMessage ?? "Monthly report email send failed.");
      }

      const sentAt = new Date().toISOString();
      summary.sent += 1;
      log = {
        ...log,
        recipient_email: emailResult.recipientEmail,
        pic_email: emailResult.ccEmail,
        send_status: "sent",
        resend_email_id: emailResult.resendEmailId,
        sent_at: sentAt,
      };
      console.info(
        `[monthly-report] email sent page_id=${account.notionPageId} resend_email_id=${emailResult.resendEmailId ?? "unknown"}`
      );
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown monthly report error.";
      log = {
        ...log,
        send_status: "failed",
        error_message: message,
      };
      console.error(
        `[monthly-report] account failed page_id=${account.notionPageId} client=${account.clientName} error=${message}`
      );
    }

    await persistReportLog(notionConfig, log);
  }

  console.info(
    `[monthly-report] cron completed total_found=${summary.total_found} processed=${summary.processed} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`
  );

  return summary;
}

function getNotionClientConfig(): NotionClientConfig {
  const credentials = getCredentials();
  const token = credentials.notionAccessToken;
  if (!token) {
    throw new Error("Missing required env var NOTION_TOKEN.");
  }
  const reportLogsDatabaseId = resolveOptionalDatabaseId(
    readOptionalEnv("NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID") ??
      readOptionalEnv("NOTION_REPORT_LOGS_DATABASE_ID")
  );

  return {
    token,
    reportLogsDatabaseId,
  };
}

function resolveOptionalDatabaseId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return extractNotionDatabaseId(value) ?? value.trim();
}

function normalizeReportType(value: string | null): MonthlyReportType {
  const normalized = value?.trim().toLowerCase() ?? "";
  const mentionsGoogle = normalized.includes("google");
  const mentionsMeta = normalized.includes("meta");
  if (mentionsGoogle && mentionsMeta) {
    return "overall";
  }
  if (mentionsMeta) {
    return "meta";
  }
  if (mentionsGoogle) {
    return "google";
  }
  return "overall";
}

function resolveAccountReportType(account: MonthlyReportAccount): MonthlyReportType {
  return normalizeReportType(account.reportType ?? account.platform);
}

function formatAccountReportLabel(account: MonthlyReportAccount): string {
  return account.reportType ?? account.platform ?? resolveAccountReportType(account);
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  const reportType = resolveAccountReportType(account);
  if (reportType === "meta") {
    return account.metaAdsAccountId;
  }
  if (reportType === "google") {
    return account.googleAdsAccountId;
  }

  return account.googleAdsAccountId ?? account.metaAdsAccountId;
}

function resolveRecipients(
  account: MonthlyReportAccount,
  input: { testMode: boolean; testRecipient: string }
): string[] {
  if (input.testMode) {
    return [input.testRecipient];
  }

  return Array.from(
    new Set([account.clientEmail, account.picEmail].filter((email): email is string => Boolean(email)))
  );
}

async function buildReportPayload(
  account: MonthlyReportAccount,
  startDate: string,
  endDate: string
): Promise<OverallReportPayload> {
  const reportType = resolveAccountReportType(account);

  return getOverallReport({
    accountId: null,
    googleAccountId: reportType === "meta" ? null : account.googleAdsAccountId,
    metaAccountId: reportType === "google" ? null : account.metaAdsAccountId,
    startDate,
    endDate,
  });
}

async function generateMonthlyReportPdf(input: {
  account: MonthlyReportAccount;
  reportPayload: OverallReportPayload;
  reportMonth: string;
}): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const marginBottom = 44;
  const lineHeight = 16;
  let cursorY = 54;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight <= pageHeight - marginBottom) {
      return;
    }
    pdf.addPage();
    cursorY = 54;
  };

  const writeLine = (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => {
    const fontSize = options?.size ?? 11;
    const indent = options?.indent ?? 0;
    pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const wrapped = pdf.splitTextToSize(text, pageWidth - marginX * 2 - indent);
    const height = wrapped.length * (fontSize + 3);
    ensureSpace(height + 4);
    pdf.text(wrapped, marginX + indent, cursorY);
    cursorY += height + 4;
  };

  writeLine(`${input.account.clientName} Monthly Report`, { bold: true, size: 18 });
  writeLine(`Report type: ${formatAccountReportLabel(input.account)}`, { size: 11 });
  writeLine(`Reporting period: ${input.reportPayload.dateRange.currentLabel}`, { size: 11 });
  writeLine("", { size: 6 });

  writeLine("Summary", { bold: true, size: 14 });
  input.reportPayload.summaries.forEach((section) => {
    writeLine(section.title, { bold: true, size: 12 });
    section.metrics.forEach((metric) => {
      writeLine(formatSummaryMetric(metric), { indent: 14 });
    });
  });

  writeLine("", { size: 6 });
  writeLine("Campaign Breakdown", { bold: true, size: 14 });
  input.reportPayload.campaignGroups.forEach((group) => {
    renderCampaignGroup(pdf, group, {
      writeLine,
      ensureSpace,
      marginX,
      pageWidth,
      pageHeight,
      marginBottom,
      lineHeight,
      cursorYRef: () => cursorY,
      setCursorY: (value) => {
        cursorY = value;
      },
    });
  });

  if (input.reportPayload.warnings.length > 0) {
    writeLine("", { size: 6 });
    writeLine("Warnings", { bold: true, size: 14 });
    input.reportPayload.warnings.forEach((warning) => {
      writeLine(`- ${warning}`, { indent: 14 });
    });
  }

  const pdfBuffer = pdf.output("arraybuffer");
  return Buffer.from(pdfBuffer);
}

function renderCampaignGroup(
  pdf: jsPDF,
  group: CampaignGroup,
  helpers: {
    writeLine: (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => void;
    ensureSpace: (requiredHeight: number) => void;
    marginX: number;
    pageWidth: number;
    pageHeight: number;
    marginBottom: number;
    lineHeight: number;
    cursorYRef: () => number;
    setCursorY: (value: number) => void;
  }
) {
  helpers.writeLine(`${group.campaignType} (${group.platform})`, { bold: true, size: 12 });
  helpers.writeLine(
    `Totals: Spend ${formatCurrency(group.totals.spend)} | Impr. ${formatInteger(group.totals.impressions)} | Clicks ${formatInteger(group.totals.clicks)} | Results ${formatInteger(group.totals.results)}`,
    { indent: 14 }
  );

  group.rows.slice(0, 8).forEach((row) => {
    helpers.writeLine(
      `${row.campaignName}: Spend ${formatCurrency(row.spend)} | Impr. ${formatInteger(row.impressions)} | Clicks ${formatInteger(row.clicks)} | Results ${formatInteger(row.results)}`,
      { indent: 14 }
    );
  });
}

async function persistReportLog(config: NotionClientConfig, log: MonthlyReportLog): Promise<void> {
  if (!config.reportLogsDatabaseId) {
    console.warn(
      `[monthly-report] report log skipped page_id=${log.notion_page_id} reason=NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID missing`
    );
    return;
  }

  try {
    const dataSourceId = await resolveDataSourceId(config.token, config.reportLogsDatabaseId);
    const schema = await notionRequest<NotionDataSourceResponse>(
      config.token,
      `/data_sources/${dataSourceId}`,
      {
        method: "GET",
      }
    );
    const properties = buildLogProperties(log, schema.properties ?? {});

    await notionRequest(config.token, "/pages", {
      method: "POST",
      body: {
        parent: {
          data_source_id: dataSourceId,
        },
        properties,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Notion log persistence error.";
    console.error(
      `[monthly-report] report log failed page_id=${log.notion_page_id} error=${message}`
    );
  }
}

async function resolveDataSourceId(token: string, databaseId: string): Promise<string> {
  const response: { data_sources?: Array<{ id?: string | null }> } = await notionRequest(
    token,
    `/databases/${databaseId}`,
    {
      method: "GET",
    }
  );
  const dataSourceId = response.data_sources?.[0]?.id?.trim();

  if (!dataSourceId) {
    throw new Error(`No Notion data source found for database ${databaseId}.`);
  }

  return dataSourceId;
}

function buildLogProperties(
  log: MonthlyReportLog,
  schema: Record<string, { type?: string } | undefined>
): Record<string, unknown> {
  const values: Record<string, string | null> = {
    notion_page_id: log.notion_page_id,
    client_name: log.client_name,
    platform: log.platform,
    account_id: log.account_id,
    report_month: log.report_month,
    start_date: log.start_date,
    end_date: log.end_date,
    recipient_email: log.recipient_email,
    pic_email: log.pic_email,
    send_status: log.send_status,
    resend_email_id: log.resend_email_id,
    error_message: log.error_message,
    created_at: log.created_at,
    sent_at: log.sent_at,
  };

  return Object.entries(values).reduce<Record<string, unknown>>((acc, [propertyName, value]) => {
    const propertyType = schema[propertyName]?.type;
    if (!propertyType) {
      return acc;
    }

    const built = buildNotionPropertyValue(propertyType, value);
    if (built) {
      acc[propertyName] = built;
    }

    return acc;
  }, {});
}

function buildNotionPropertyValue(propertyType: string, value: string | null): Record<string, unknown> | null {
  switch (propertyType) {
    case "title":
      return {
        title: value
          ? [
              {
                text: {
                  content: value,
                },
              },
            ]
          : [],
      };
    case "rich_text":
      return {
        rich_text: value
          ? [
              {
                text: {
                  content: value,
                },
              },
            ]
          : [],
      };
    case "email":
      return {
        email: value ?? null,
      };
    case "date":
      return value
        ? {
            date: {
              start: value,
            },
          }
        : {
            date: null,
          };
    case "status":
      return value
        ? {
            status: {
              name: value,
            },
          }
        : null;
    case "select":
      return value
        ? {
            select: {
              name: value,
            },
          }
        : null;
    case "url":
      return {
        url: value ?? null,
      };
    case "number":
      return {
        number: value ? Number(value) : null,
      };
    default:
      return null;
  }
}

async function notionRequest<T = Record<string, unknown>>(
  token: string,
  path: string,
  input: { method: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });

  const bodyText = await response.text().catch(() => "");
  const json = safeJsonParse<T & { message?: string }>(bodyText);

  if (!response.ok) {
    throw new Error(
      json?.message ||
        bodyText.trim() ||
        `Notion API request failed for ${path} with status ${response.status}.`
    );
  }

  return (json ?? {}) as T;
}

function resolvePreviousMonthRange(referenceDate: Date): {
  startDate: string;
  endDate: string;
  reportMonth: string;
  reportMonthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    reportMonth: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    reportMonthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatSummaryMetric(metric: SummaryMetric): string {
  return `${metric.label}: ${formatMetricValue(metric)}${formatMetricDelta(metric)}`;
}

function formatMetricValue(metric: SummaryMetric): string {
  const value = metric.value ?? 0;
  if (metric.format === "currency") {
    return formatCurrency(value);
  }
  if (metric.format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  return formatNumber(value);
}

function formatMetricDelta(metric: SummaryMetric): string {
  if (metric.delta === null) {
    return "";
  }
  const sign = metric.delta > 0 ? "+" : "";
  if (metric.format === "currency") {
    return ` (${sign}${formatCurrency(metric.delta)})`;
  }
  if (metric.format === "percent") {
    return ` (${sign}${metric.delta.toFixed(2)} pts)`;
  }
  return ` (${sign}${formatNumber(metric.delta)})`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function safeJsonParse<T>(value: string): T | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
