import { Resend } from "resend";

import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";
const DEFAULT_FROM_ADDRESS = "No-Reply <demo@mail.alphaonlineclass.com>";

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
  const subjectPrefix = testMode ? "[TEST] " : "";
  const subject = `${subjectPrefix}Monthly Ads Report - ${input.account.clientName} - ${input.reportMonthLabel}`;

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
        clientName: input.account.clientName,
        reportMonthLabel: input.reportMonthLabel,
        includePicNote: Boolean(input.account.picEmail),
      }),
      attachments: [
        {
          filename: buildAttachmentFilename(input.account.clientName, input.reportMonthKey),
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

function buildAttachmentFilename(clientName: string, reportMonthKey: string): string {
  return `monthly-ads-report-${slugify(clientName)}-${reportMonthKey}.pdf`;
}

function buildEmailHtml(input: {
  clientName: string;
  reportMonthLabel: string;
  includePicNote: boolean;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <p>Dear Team,</p>
      <p>Please find attached the monthly ads report for <strong>${escapeHtml(input.clientName)}</strong>.</p>
      <p>Report month: ${escapeHtml(input.reportMonthLabel)}</p>
      <p>The PDF report is attached for your review.</p>
      <p>${input.includePicNote ? "The person in charge has been copied for follow-up if needed." : "Please let us know if any follow-up is required."}</p>
      <p>Regards,<br/>Alpha Online Class</p>
    </div>
  `.trim();
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "client";
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
