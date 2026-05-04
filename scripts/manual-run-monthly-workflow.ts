// @ts-nocheck
import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

async function main() {
  process.env.MONTHLY_REPORT_TEST_MODE = "false";
  process.env.MONTHLY_REPORT_APP_BASE_URL = process.env.MONTHLY_REPORT_APP_BASE_URL || "http://127.0.0.1:3000";
  process.env.MONTHLY_REPORT_TARGETS_JSON = JSON.stringify([
    {
      clientName: "Facebook - Eduwis Sdn Bhd",
      metaAccountId: "351176215427588",
      recipientEmail: "ava@locus-t.com.my",
      reportType: "Overall",
      platform: "Meta",
    },
    {
      clientName: "Google - Pekat",
      googleAccountId: "593-981-4778",
      recipientEmail: "ava@locus-t.com.my",
      reportType: "Overall",
      platform: "Google",
    },
  ]);

  const result = await runMonthlyReportJob();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("MANUAL_MONTHLY_WORKFLOW_FAILED", error);
  process.exitCode = 1;
});
