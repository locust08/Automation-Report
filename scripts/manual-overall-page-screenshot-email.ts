import path from "node:path";

import { generateMonthlyReportPdfForAccount } from "@/src/lib/cron/generate-monthly-report-pdf";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

async function main() {
  process.env.MONTHLY_REPORT_TEST_MODE = process.env.MONTHLY_REPORT_TEST_MODE?.trim() || "false";

  const googleAdsAccountId = process.env.MONTHLY_REPORT_GOOGLE_ACCOUNT_ID?.trim() || "183-160-3281";
  const metaAdsAccountId = process.env.MONTHLY_REPORT_META_ACCOUNT_ID?.trim() || null;
  const clientEmail =
    process.env.MONTHLY_REPORT_PRIMARY_RECIPIENT?.trim() ||
    process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() ||
    "ava@locus-t.com.my";
  const picEmail = process.env.MONTHLY_REPORT_CC_RECIPIENT?.trim() || null;
  const clientName =
    process.env.MONTHLY_REPORT_CLIENT_NAME?.trim() ||
    `Overall Report ${googleAdsAccountId}${metaAdsAccountId ? ` / ${metaAdsAccountId}` : ""}`;

  const account: MonthlyReportAccount = {
    notionPageId: `manual-overall-page-${googleAdsAccountId}${metaAdsAccountId ? `-${metaAdsAccountId}` : ""}`,
    clientName,
    googleAdsAccountId,
    metaAdsAccountId,
    clientEmail,
    picEmail,
    status: "Active",
    monthlyReportEnabled: true,
    platform: metaAdsAccountId ? "Google, Meta" : "Google",
    reportType: "Overall",
    isValid: true,
    skipReason: null,
  };

  const reportMonthKey = resolvePreviousMonthKey(new Date());
  const reportMonthLabel = resolvePreviousMonthLabel(new Date());
  const { startDate, endDate } = resolvePreviousMonthRange(new Date());
  const outputDir = path.join(process.cwd(), "artifacts", "monthly-report-tests");

  const pdfResult = await generateMonthlyReportPdfForAccount(account, {
    dateRange: {
      startDate,
      endDate,
      reportMonthKey,
      reportMonthLabel,
    },
    outputDir,
  });

  if (pdfResult.status !== "generated" || !pdfResult.pdfBuffer) {
    throw new Error(pdfResult.errorMessage ?? "PDF generation failed.");
  }

  console.log(`PDF_SAVED=${pdfResult.pdfPath ?? ""}`);
  console.log(`PDF_BYTES=${pdfResult.pdfSizeBytes}`);

  const emailResult = await sendMonthlyReportEmail({
    account,
    pdfBuffer: pdfResult.pdfBuffer,
    reportMonthKey,
    reportMonthLabel,
  });

  console.log(`EMAIL_SUCCESS=${emailResult.success}`);
  console.log(`EMAIL_RECIPIENT=${emailResult.recipientEmail ?? ""}`);
  console.log(`EMAIL_RESEND_ID=${emailResult.resendEmailId ?? ""}`);
  console.log(`EMAIL_ERROR=${emailResult.errorMessage ?? ""}`);
}

function resolvePreviousMonthRange(referenceDate: Date): {
  startDate: string;
  endDate: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function resolvePreviousMonthKey(referenceDate: Date): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolvePreviousMonthLabel(referenceDate: Date): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}

main().catch((error) => {
  console.error("MANUAL_OVERALL_PAGE_SCREENSHOT_EMAIL_FAILED", error);
  process.exitCode = 1;
});
