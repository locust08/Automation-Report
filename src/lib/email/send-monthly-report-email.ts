import { Resend } from "resend";

import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";
const DEFAULT_FROM_ADDRESS = "LOCUS-T Reports <reports@locus-t.com.my>";
const DEFAULT_LOGO_URL = "https://www.locus-t.com.my/wp-content/uploads/2024/09/LT-Logo-25.svg";

let resendClient: Resend | null = null;

export interface SendMonthlyReportEmailInput {
  account: MonthlyReportAccount;
  pdfBuffer: Buffer;
  reportMonthKey: string;
  reportMonthLabel: string;
}

export interface SendMonthlyReportEmailResult {
  success: boolean;
  resendEmailId: string | null;
  recipientEmail: string | null;
  ccEmail: string | null;
  errorMessage: string | null;
}

export async function sendMonthlyReportEmail(
  input: SendMonthlyReportEmailInput
): Promise<SendMonthlyReportEmailResult> {
  const resend = getResendClient();
  const testMode = parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const testRecipient = readOptionalEnv("MONTHLY_REPORT_TEST_RECIPIENT") ?? DEFAULT_TEST_RECIPIENT;
  const fromAddress = readOptionalEnv("RESEND_FROM_MONTHLY_REPORT") ?? DEFAULT_FROM_ADDRESS;
  const recipientEmails = parseEmailList(testMode ? testRecipient : input.account.clientEmail);
  const ccEmails = testMode ? [] : parseEmailList(input.account.picEmail);
  const recipientEmail = recipientEmails.join(", ") || null;
  const ccEmail = ccEmails.join(", ") || null;
  const subject = testMode
    ? `[TEST] Monthly Ads Report - ${input.account.clientName}`
    : `Monthly Ads Report - ${input.account.clientName} - ${input.reportMonthLabel}`;

  console.info(
    `[monthly-report] email send started client=${input.account.clientName} test_mode=${testMode}`
  );
  console.info(`[monthly-report] test mode status enabled=${testMode}`);

  if (recipientEmails.length === 0) {
    const errorMessage = "Missing recipient email for monthly report.";
    console.error(`[monthly-report] email failed client=${input.account.clientName} error=${errorMessage}`);
    return {
      success: false,
      resendEmailId: null,
      recipientEmail: null,
      ccEmail,
      errorMessage,
    };
  }

  try {
    const attachments: Array<{ filename: string; content: string }> = [
      {
        filename: buildAttachmentFilename(input.account.clientName, input.reportMonthLabel),
        content: input.pdfBuffer.toString("base64"),
      },
    ];

    const response = await resend.emails.send({
      from: fromAddress,
      to: recipientEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
      html: buildEmailHtml({
        logoUrl: resolveLogoUrl(),
        clientName: input.account.clientName,
        reportMonthLabel: input.reportMonthLabel,
      }),
      attachments,
    });

    if (response.error) {
      throw new Error(response.error.message || "Resend email send failed.");
    }

    console.info(`[monthly-report] email sent client=${input.account.clientName}`);
    return {
      success: true,
      resendEmailId: response.data?.id ?? null,
      recipientEmail,
      ccEmail,
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown email send error.";
    console.error(`[monthly-report] email failed client=${input.account.clientName} error=${errorMessage}`);
    return {
      success: false,
      resendEmailId: null,
      recipientEmail,
      ccEmail,
      errorMessage,
    };
  }
}

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = readRequiredEnv("RESEND_API_KEY");
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function buildAttachmentFilename(clientName: string, reportMonthLabel: string): string {
  return `Monthly Report-${sanitizeFilenameSegment(clientName)}-${sanitizeFilenameSegment(reportMonthLabel)}.pdf`;
}

function buildEmailHtml(input: {
  logoUrl: string;
  clientName: string;
  reportMonthLabel: string;
}): string {
  const clientName = formatClientNameForEmail(input.clientName);
  const reportMonthLabel = input.reportMonthLabel;

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f3f4f6;">
        <tr>
          <td align="center" style="padding:0 12px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
              <tr>
                <td align="center" style="padding:28px 24px 18px;background:#ffffff;">
                  <img src="${escapeHtml(input.logoUrl)}" width="190" alt="LOCUS-T" style="display:block;width:190px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
              <tr>
                <td style="background:#b40012;background-image:linear-gradient(135deg,#8f0010 0%,#b40012 45%,#d7192a 100%);padding:30px 32px 28px;color:#ffffff;">
                  <div style="font-size:12px;line-height:1.3;font-weight:700;letter-spacing:1.2px;color:#ffffff;text-transform:uppercase;margin:0 0 10px;">
                    Monthly Performance Report
                  </div>
                  <h1 style="font-size:29px;line-height:1.12;font-weight:800;color:#ffffff;margin:0 0 16px;letter-spacing:0;">
                    ${escapeHtml(clientName)}
                  </h1>
                  <span style="display:inline-block;border:1px solid rgba(255,255,255,0.45);border-radius:999px;background:rgba(255,255,255,0.12);color:#ffffff;font-size:14px;line-height:1;font-weight:700;padding:9px 13px;">
                    ${escapeHtml(reportMonthLabel)}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 30px 30px;background:#ffffff;color:#1f2937;font-size:15px;line-height:1.55;">
                  <p style="margin:0 0 18px;">Dear Valued Client,</p>
                  <p style="margin:0 0 14px;">Please find your Digital Ads Campaign Performance Report for this month attached in the PDF below.</p>
                  <p style="margin:0;">Best regards,<br/><strong style="font-weight:800;color:#111827;">LOCUS-T</strong></p>
                </td>
              </tr>
              <tr>
                <td style="padding:15px 30px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:1.55;">
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

function formatClientNameForEmail(clientName: string): string {
  return clientName
    .replace(/\s+-\s+(Google Ads|Meta Ads|Google|Meta)$/i, "")
    .trim() || clientName;
}

function resolveLogoUrl(): string {
  const configured = readOptionalEnv("REPORT_EMAIL_LOGO_URL");
  if (configured) {
    return configured;
  }

  return DEFAULT_LOGO_URL;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "client";
}

function sanitizeFilenameSegment(value: string): string {
  const trimmed = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ");
  const normalizedWhitespace = trimmed.replace(/\s+/g, " ").trim();

  return normalizedWhitespace || slugify(value);
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

export function parseEmailList(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
