import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateMonthlyReportPdfForAccount } from "@/src/lib/cron/generate-monthly-report-pdf";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

async function main() {
  process.env.MONTHLY_REPORT_TEST_MODE = "true";

  const account: MonthlyReportAccount = {
    notionPageId: "manual-google-183-160-3281",
    clientName: "Overall Report 183-160-3281",
    googleAdsAccountId: "183-160-3281",
    metaAdsAccountId: null,
    clientEmail: "ava@locus-t.com.my",
    picEmail: null,
    status: "Active",
    monthlyReportEnabled: true,
    platform: "Google",
    reportType: "Overall",
    isValid: true,
    skipReason: null,
  };

  const pdfBuffer = await generateMonthlyReportPdfForAccount(account);
  const reportMonthKey = resolvePreviousMonthKey(new Date());
  const reportMonthLabel = resolvePreviousMonthLabel(new Date());
  const outputDir = path.join(process.cwd(), "artifacts", "monthly-report-tests");
  const outputPath = path.join(outputDir, `overall-report-183-160-3281-${reportMonthKey}.pdf`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, pdfBuffer);

  console.log(`PDF_SAVED=${outputPath}`);
  console.log(`PDF_BYTES=${pdfBuffer.byteLength}`);

  const emailResult = await sendMonthlyReportEmail({
    account,
    pdfBuffer,
    reportMonthKey,
    reportMonthLabel,
  });

  console.log(`EMAIL_SUCCESS=${emailResult.success}`);
  console.log(`EMAIL_RECIPIENT=${emailResult.recipientEmail ?? ""}`);
  console.log(`EMAIL_RESEND_ID=${emailResult.resendEmailId ?? ""}`);
  console.log(`EMAIL_ERROR=${emailResult.errorMessage ?? ""}`);
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
  console.error("MANUAL_MONTHLY_REPORT_TEST_FAILED", error);
  process.exitCode = 1;
});
