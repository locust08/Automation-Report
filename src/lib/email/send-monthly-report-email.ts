import { Resend } from "resend";

import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";
const DEFAULT_FROM_ADDRESS = "Locus-T <no-reply@locus-t.com.my>";

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
    const response = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      cc: ccEmail ? [ccEmail] : undefined,
      subject,
      html: buildEmailHtml({
        recipientEmail,
        clientName: input.account.clientName,
        reportMonthLabel: input.reportMonthLabel,
        includePicNote: Boolean(input.account.picEmail),
      }),
      attachments: [
        {
          filename: buildAttachmentFilename(input.account.clientName, input.reportMonthLabel),
          content: input.pdfBuffer.toString("base64"),
        },
      ],
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
  recipientEmail: string;
  clientName: string;
  reportMonthLabel: string;
  includePicNote: boolean;
}): string {
  const greeting = resolveGreeting(input.recipientEmail);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7; font-size: 15px;">
      <p>${escapeHtml(greeting)}</p>
      <p>Please find attached the <strong>Overall Monthly Report</strong> for <strong>${escapeHtml(input.clientName)}</strong>.</p>
      <p>This report covers <strong>${escapeHtml(input.reportMonthLabel)}</strong> and has been exported directly from the reporting system as a PDF generated from the report screenshot for your review.</p>
      <p>${input.includePicNote ? "The relevant person in charge has been copied for visibility and follow-up if needed." : "Please let us know if you would like any clarification or a follow-up review session."}</p>
      <p>Thank you.</p>
      <p>Best regards,<br/>Locus-T</p>
    </div>
  `.trim();
}

function resolveGreeting(recipientEmail: string): string {
  const localPart = recipientEmail.split("@")[0]?.trim() ?? "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();

  if (!cleaned) {
    return "Dear Team,";
  }

  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);

  return words.length > 0 ? `Dear ${words.join(" ")},` : "Dear Team,";
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
