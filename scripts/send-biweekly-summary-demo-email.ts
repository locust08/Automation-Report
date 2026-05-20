import { resolveMonthlyReportDateRange } from "@/src/lib/cron/monthly-report-date";
import { getMonthlyReportAccounts } from "@/src/lib/notion/get-monthly-report-accounts";

const AVA_EMAIL = "ava@locus-t.com.my";
const DEFAULT_FROM_ADDRESS = "LOCUS-T Reports <reports@locus-t.com.my>";
const DEFAULT_LOGO_URL = "https://www.locus-t.com.my/wp-content/uploads/2024/09/LT-Logo-25.svg";

interface DemoJobRow {
  id: string;
  status: string;
  report_month_label: string;
  start_date: string;
  end_date: string;
  test_mode: number;
  metadata_json: string | null;
}

interface DemoJobItemRow {
  id: string;
  status: string;
  client_name: string;
  platform: string | null;
  google_account_id: string | null;
  meta_account_id: string | null;
  attempts: number;
}

async function main() {
  const notionResult = await getMonthlyReportAccounts({
    reportType: "biweeklyOverall",
    scheduleDay: 15,
  });

  if (notionResult.errorMessage) {
    throw new Error(notionResult.errorMessage);
  }

  const accounts = notionResult.accounts.filter((account) => account.monthlyReportEnabled);
  const dateRange = resolveMonthlyReportDateRange();
  const job: DemoJobRow = {
    id: `biweekly-summary-demo-${dateRange.reportMonthKey}-${Date.now()}`,
    status: "completed",
    report_month_label: dateRange.reportMonthLabel,
    start_date: dateRange.startDate,
    end_date: dateRange.endDate,
    test_mode: 1,
    metadata_json: JSON.stringify({
      source: "biweekly-summary-demo",
      confirmationCheckboxProperty: notionResult.confirmationCheckboxProperty ?? "Bi-Weekly",
      skippedTotal: "0",
    }),
  };
  const items: DemoJobItemRow[] = accounts.map((account, index) => ({
    id: account.notionPageId || `demo-account-${index + 1}`,
    status: "completed",
    client_name: account.clientName,
    platform: account.platform,
    google_account_id: account.googleAdsAccountId,
    meta_account_id: account.metaAdsAccountId,
    attempts: 1,
  }));

  if (items.length === 0) {
    throw new Error("No active Notion accounts were found with the Bi-Weekly checkbox ticked.");
  }

  const subject = `[TEST] [Report Automation] Finished - ${dateRange.reportMonthLabel} - ${items.length}/${items.length} completed, all completed`;
  const html = buildCompletionSummaryEmailHtml({
    job,
    items,
    logoUrl: readOptionalEnv("REPORT_EMAIL_LOGO_URL") ?? DEFAULT_LOGO_URL,
  });

  const resendEmailId = await sendResendEmail({
    from: readOptionalEnv("RESEND_FROM_MONTHLY_REPORT") ?? DEFAULT_FROM_ADDRESS,
    to: [AVA_EMAIL],
    subject,
    html,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        sentTo: AVA_EMAIL,
        resendEmailId,
        confirmationCheckboxProperty: notionResult.confirmationCheckboxProperty,
        totalNotionRows: notionResult.total,
        biWeeklyAccounts: items.length,
        subject,
        accounts: items.map((item) => ({
          accountName: item.client_name,
          accountId: formatAccountIdForEmail(item),
          status: "Test Sent",
        })),
      },
      null,
      2
    )
  );
}

async function sendResendEmail(input: {
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readRequiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Resend email failed with status ${response.status}.`);
  }

  return payload?.id ?? null;
}

function buildCompletionSummaryEmailHtml(input: {
  job: DemoJobRow;
  items: DemoJobItemRow[];
  logoUrl: string;
}): string {
  const completedCount = input.items.filter((item) => item.status === "completed").length;
  const failedCount = input.items.filter((item) => item.status === "failed").length;
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
                  <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">This is a summary-only Bi-Weekly demo. No PDFs were generated and no client emails were sent.</p>
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

function resolveSkippedCount(job: DemoJobRow, items: DemoJobItemRow[]): number {
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

function formatAccountIdForEmail(item: DemoJobItemRow): string {
  const googleAccountId = normalizeOptional(item.google_account_id);
  const metaAccountId = normalizeOptional(item.meta_account_id);
  const platform = `${item.platform ?? ""} ${item.client_name}`.toLowerCase();

  if (googleAccountId && metaAccountId && googleAccountId === metaAccountId) {
    return googleAccountId;
  }

  if (platform.includes("meta") || platform.includes("facebook")) {
    return metaAccountId ?? googleAccountId ?? "-";
  }

  if (platform.includes("google")) {
    return googleAccountId ?? metaAccountId ?? "-";
  }

  if (googleAccountId && metaAccountId) {
    return `Google: ${googleAccountId}, Meta: ${metaAccountId}`;
  }

  return googleAccountId ?? metaAccountId ?? "-";
}

function buildAccountStatusBadge(item: DemoJobItemRow, testMode: boolean): string {
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

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required env var ${name}.`);
  }
  return value;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

main().catch((error) => {
  console.error("BIWEEKLY_SUMMARY_DEMO_EMAIL_FAILED", error);
  process.exitCode = 1;
});
