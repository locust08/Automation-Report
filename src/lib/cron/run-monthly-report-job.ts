import { captureOverallReportPdf } from "@/src/lib/cron/capture-overall-report-pdf";
import {
  buildMonthlyReportTargets,
  getMonthlyReportTargets,
  parseBooleanEnv,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";

const TEST_RECIPIENT = "ava@locus-t.com.my";

export async function runMonthlyReportJob(input?: {
  forceTestMode?: boolean;
  overrideTargets?: MonthlyReportTargetConfig[];
}) {
  console.log("Monthly job started");

  try {
    const testMode = input?.forceTestMode ?? parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
    const result =
      input?.overrideTargets && input.overrideTargets.length > 0
        ? buildMonthlyReportTargets(input.overrideTargets, testMode)
        : getMonthlyReportTargets({ testModeOverride: testMode });
    const accountsToProcess = testMode ? result.slice(0, 1) : result;
    const skippedFromTestMode = Math.max(result.length - accountsToProcess.length, 0);

    console.log(`Monthly report configured targets=${result.length}`);
    console.log(`Monthly report test mode enabled=${testMode}`);

    const summary = {
      total: result.length,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: skippedFromTestMode,
    };

    for (const account of accountsToProcess) {
      summary.processed += 1;
      console.log(`Monthly report account start client=${account.clientName} page_id=${account.notionPageId}`);

      let pdfBuffer: Buffer;
      let reportMonthKey: string;
      let reportMonthLabel: string;

      try {
        console.log(`Monthly report capturing Overall page for ${account.clientName}`);
        const capture = await captureOverallReportPdf({
          clientName: account.clientName,
          googleAccountId: account.googleAdsAccountId,
          metaAccountId: account.metaAdsAccountId,
        });
        pdfBuffer = capture.pdfBuffer;
        reportMonthKey = capture.reportMonthKey;
        reportMonthLabel = capture.reportMonthLabel;
        console.log(`Monthly report PDF success for ${account.clientName} pdf=${capture.pdfPath}`);
      } catch (error) {
        summary.failed += 1;
        console.error(`Monthly report PDF failed for ${account.clientName}`, error);
        console.log(`Monthly report account result client=${account.clientName} status=failed stage=pdf`);
        continue;
      }

      try {
        const emailTarget = testMode ? TEST_RECIPIENT : account.clientEmail ?? "(missing recipient)";
        console.log(`Monthly report email sending started for ${account.clientName} to ${emailTarget}`);

        const emailResult = await sendMonthlyReportEmail({
          account,
          pdfBuffer,
          reportMonthKey,
          reportMonthLabel,
        });

        if (emailResult.success) {
          summary.sent += 1;
          console.log(
            `Monthly report email sent for ${account.clientName} resend_id=${emailResult.resendEmailId ?? "unknown"}`
          );
          console.log(`Monthly report account result client=${account.clientName} status=sent`);
        } else {
          summary.failed += 1;
          console.error(
            `Monthly report email failed for ${account.clientName}: ${emailResult.errorMessage ?? "Unknown email error."}`
          );
          console.log(`Monthly report account result client=${account.clientName} status=failed stage=email`);
        }
      } catch (error) {
        summary.failed += 1;
        console.error(`Monthly report email failed for ${account.clientName}`, error);
        console.log(`Monthly report account result client=${account.clientName} status=failed stage=email`);
      }
    }

    console.log(
      `Monthly report summary total=${summary.total} processed=${summary.processed} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`
    );

    return summary;
  } catch (error) {
    console.error("Monthly job target resolution failed", error);

    return {
      total: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }
}
