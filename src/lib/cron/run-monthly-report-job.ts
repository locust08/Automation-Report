import {
  generateMonthlyReportPdfBatch,
  isMonthlyReportDryRun,
  type MonthlyReportPdfBatchResult,
} from "@/src/lib/cron/generate-monthly-report-pdf";
import {
  getMonthlyReportTargets,
  parseBooleanEnv,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import {
  getMonthlyReportAccounts,
  resolveMonthlyReportTargetsFromNotion,
  type MonthlyReportAccount,
} from "@/src/lib/notion/get-monthly-report-accounts";

export interface MonthlyReportJobResult {
  totalAccounts: number;
  processed: number;
  generated: number;
  emailed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  withinTenMinutes: boolean;
  warning: string | null;
  slowestAccounts: MonthlyReportPdfBatchResult["slowestAccounts"];
  dryRun: boolean;
  testMode: boolean;
  pdfResults: Array<{
    accountId: string | null;
    accountName: string;
    status: "generated" | "failed" | "skipped";
    durationMs: number;
    pdfSizeBytes: number;
    pdfPath: string | null;
    errorMessage: string | null;
  }>;
  emailResults: Array<{
    accountId: string | null;
    accountName: string;
    success: boolean;
    recipientEmail: string | null;
    ccEmail: string | null;
    resendEmailId: string | null;
    errorMessage: string | null;
  }>;
}

export async function runMonthlyReportJob(input?: {
  forceTestMode?: boolean;
  forceDryRun?: boolean;
  overrideTargets?: MonthlyReportTargetConfig[];
}): Promise<MonthlyReportJobResult> {
  const startedAt = Date.now();
  console.log("Monthly job started");

  const testMode = input?.forceTestMode ?? parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const dryRun = input?.forceDryRun ?? isMonthlyReportDryRun();

  try {
    const resolvedTargets = await resolveTargets({
      testMode,
      overrideTargets: input?.overrideTargets,
    });
    const accountsToProcess = testMode ? resolvedTargets.slice(0, 1) : resolvedTargets;
    const skippedFromTestMode = Math.max(resolvedTargets.length - accountsToProcess.length, 0);

    console.log(`Monthly report configured targets=${resolvedTargets.length}`);
    console.log(`Monthly report test mode enabled=${testMode}`);
    console.log(`Monthly report dry run enabled=${dryRun}`);

    const pdfBatch = await generateMonthlyReportPdfBatch({
      accounts: accountsToProcess,
    });
    const emailResults: MonthlyReportJobResult["emailResults"] = [];
    let emailed = 0;
    let emailFailures = 0;

    if (dryRun) {
      console.log("[monthly-report] dry run enabled; email send skipped");
    } else {
      for (const pdfResult of pdfBatch.results) {
        if (pdfResult.status !== "generated" || !pdfResult.pdfBuffer) {
          continue;
        }

        try {
          console.log(
            `[monthly-report] email sending started account_id=${pdfResult.accountId ?? "missing"} account_name=${pdfResult.accountName}`
          );
          const emailResult = await sendMonthlyReportEmail({
            account: pdfResult.account,
            pdfBuffer: pdfResult.pdfBuffer,
            reportMonthKey: pdfResult.reportMonthKey,
            reportMonthLabel: pdfResult.reportMonthLabel,
          });

          emailResults.push({
            accountId: pdfResult.accountId,
            accountName: pdfResult.accountName,
            success: emailResult.success,
            recipientEmail: emailResult.recipientEmail,
            ccEmail: emailResult.ccEmail,
            resendEmailId: emailResult.resendEmailId,
            errorMessage: emailResult.errorMessage,
          });

          if (emailResult.success) {
            emailed += 1;
          } else {
            emailFailures += 1;
            console.error(
              `[monthly-report] email send failure account_id=${pdfResult.accountId ?? "missing"} reason=${emailResult.errorMessage ?? "Unknown email send error."}`
            );
          }
        } catch (error) {
          emailFailures += 1;
          emailResults.push({
            accountId: pdfResult.accountId,
            accountName: pdfResult.accountName,
            success: false,
            recipientEmail: null,
            ccEmail: null,
            resendEmailId: null,
            errorMessage: `Email send failure: ${toErrorMessage(error)}`,
          });
        }
      }
    }

    const totalDurationMs = Date.now() - startedAt;
    const skipped = pdfBatch.skipped + skippedFromTestMode;
    const failed = pdfBatch.failed + emailFailures;
    const result: MonthlyReportJobResult = {
      totalAccounts: resolvedTargets.length,
      processed: pdfBatch.processed,
      generated: pdfBatch.generated,
      emailed,
      failed,
      skipped,
      totalDurationMs,
      withinTenMinutes: totalDurationMs <= 10 * 60 * 1000,
      warning:
        totalDurationMs <= 10 * 60 * 1000
          ? pdfBatch.warning
          : `Monthly report job exceeded the 10 minute target (${totalDurationMs}ms).`,
      slowestAccounts: pdfBatch.slowestAccounts,
      dryRun,
      testMode,
      pdfResults: pdfBatch.results.map((pdfResult) => ({
        accountId: pdfResult.accountId,
        accountName: pdfResult.accountName,
        status: pdfResult.status,
        durationMs: pdfResult.durationMs,
        pdfSizeBytes: pdfResult.pdfSizeBytes,
        pdfPath: pdfResult.pdfPath,
        errorMessage: pdfResult.errorMessage,
      })),
      emailResults,
    };

    console.log(
      `[monthly-report] summary total=${result.totalAccounts} processed=${result.processed} generated=${result.generated} emailed=${result.emailed} failed=${result.failed} skipped=${result.skipped} total_duration_ms=${result.totalDurationMs} within_ten_minutes=${result.withinTenMinutes}`
    );

    return result;
  } catch (error) {
    console.error("Monthly job target resolution failed", error);

    return {
      totalAccounts: 0,
      processed: 0,
      generated: 0,
      emailed: 0,
      failed: 1,
      skipped: 0,
      totalDurationMs: Date.now() - startedAt,
      withinTenMinutes: true,
      warning: `Monthly job target resolution failed: ${toErrorMessage(error)}`,
      slowestAccounts: [],
      dryRun,
      testMode,
      pdfResults: [],
      emailResults: [],
    };
  }
}

async function resolveTargets(input: {
  testMode: boolean;
  overrideTargets?: MonthlyReportTargetConfig[];
}): Promise<MonthlyReportAccount[]> {
  const configuredTargets =
    input.overrideTargets && input.overrideTargets.length > 0
      ? await resolveMonthlyReportTargetsFromNotion(input.overrideTargets)
      : getMonthlyReportTargets({ testModeOverride: input.testMode });

  if (configuredTargets.length > 0) {
    return configuredTargets;
  }

  const notionAccounts = await getMonthlyReportAccounts();
  return notionAccounts.accounts.filter((account) => Boolean(account.googleAdsAccountId || account.metaAdsAccountId));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
