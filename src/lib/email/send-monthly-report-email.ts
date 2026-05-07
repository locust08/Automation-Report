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
