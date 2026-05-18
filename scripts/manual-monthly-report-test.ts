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

  const pdfResult = await generateMonthlyReportPdfForAccount(account);
  if (pdfResult.status !== "generated" || !pdfResult.pdfBuffer) {
    throw new Error(pdfResult.errorMessage ?? "PDF generation failed.");
  }

  console.log(`PDF_SAVED=${pdfResult.pdfPath ?? ""}`);
  console.log(`PDF_BYTES=${pdfResult.pdfSizeBytes}`);

  const emailResult = await sendMonthlyReportEmail({
    account,
    pdfBuffer: pdfResult.pdfBuffer,
    reportMonthKey: pdfResult.reportMonthKey,
    reportMonthLabel: pdfResult.reportMonthLabel,
  });

  console.log(`EMAIL_SUCCESS=${emailResult.success}`);
  console.log(`EMAIL_RECIPIENT=${emailResult.recipientEmail ?? ""}`);
  console.log(`EMAIL_RESEND_ID=${emailResult.resendEmailId ?? ""}`);
  console.log(`EMAIL_ERROR=${emailResult.errorMessage ?? ""}`);
}

main().catch((error) => {
  console.error("MANUAL_MONTHLY_REPORT_TEST_FAILED", error);
  process.exitCode = 1;
});
