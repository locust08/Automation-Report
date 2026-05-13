import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

async function main() {
  process.env.MONTHLY_REPORT_DRY_RUN = "true";
  process.env.MONTHLY_REPORT_APP_BASE_URL =
    process.env.MONTHLY_REPORT_APP_BASE_URL || "http://127.0.0.1:3000";

  const result = await runMonthlyReportJob({
    forceDryRun: true,
  });

  console.log(
    JSON.stringify(
      {
        totalAccounts: result.totalAccounts,
        processed: result.processed,
        generated: result.generated,
        emailed: result.emailed,
        failed: result.failed,
        skipped: result.skipped,
        totalDurationMs: result.totalDurationMs,
        withinTenMinutes: result.withinTenMinutes,
        slowestAccounts: result.slowestAccounts,
        pdfResults: result.pdfResults,
      },
      null,
      2
    )
  );

  if (result.failed > 0 || !result.withinTenMinutes) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("MONTHLY_REPORT_PDF_BENCHMARK_FAILED", error);
  process.exitCode = 1;
});
