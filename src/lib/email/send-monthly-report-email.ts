import { Resend } from "resend";

import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";
const DEFAULT_FROM_ADDRESS = "Locus-T <no-reply@locus-t.com.my>";
const DEFAULT_LOGO_PATH = "/locus-t-logo.png";

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
  const recipientEmail = testMode ? testRecipient : input.account.clientEmail;
  const ccEmail = testMode ? null : input.account.picEmail;
  const subject = testMode
    ? `[TEST] Monthly Ads Report - ${input.account.clientName}`
    : `Monthly Ads Report - ${input.account.clientName} - ${input.reportMonthLabel}`;

  console.info(
    `[monthly-report] email send started client=${input.account.clientName} test_mode=${testMode}`
  );
  console.info(`[monthly-report] test mode status enabled=${testMode}`);

  if (!recipientEmail) {
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
      to: [recipientEmail],
      cc: ccEmail ? [ccEmail] : undefined,
      subject,
      html: buildEmailHtml(resolveLogoUrl()),
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

function buildEmailHtml(logoUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7; font-size: 15px;">
      <div style="text-align:center;margin:0 0 22px;"><img src="${escapeHtml(logoUrl)}" width="180" alt="LOCUS-T" style="display:inline-block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" /></div>
      <p>Dear Valued Client,</p>
      <p>Please find your Digital Ads Campaign Performance Report for this month attached in the PDF below.</p>
      <p>Best regards,<br/><strong>LOCUS-T</strong></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px;line-height:1.5;">
        This report was generated automatically from the LOCUS-T reporting dashboard.<br/>
        You received this email because LOCUS-T scheduled it to be sent to you regularly.
      </p>
    </div>
  `.trim();
}

function resolveLogoUrl(): string {
  const configured = readOptionalEnv("REPORT_EMAIL_LOGO_URL");
  if (configured) {
    return configured;
  }

  const baseUrl = readOptionalEnv("MONTHLY_REPORT_APP_BASE_URL") ?? readOptionalEnv("VERCEL_APP_BASE_URL");
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/g, "")}${DEFAULT_LOGO_PATH}`;
  }

  return DEFAULT_LOGO_PATH;
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
