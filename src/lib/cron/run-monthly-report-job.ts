import {
  generateMonthlyReportPdfBatch,
  isMonthlyReportDryRun,
  type MonthlyReportPdfBatchResult,
} from "@/src/lib/cron/generate-monthly-report-pdf";
import { resolveMonthlyReportDateRange } from "@/src/lib/cron/monthly-report-date";
import {
  parseBooleanEnv,
  parseTargetList,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import {
  getReportConfirmationCheckboxProperty,
  normalizeScheduledReportType,
  resolveReportTypeForScheduleDay,
  type ScheduledMonthlyReportType,
} from "@/src/lib/cron/monthly-report-confirmation";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import {
  hasMonthlyReportEmailBeenSent,
  recordMonthlyReportEmailSent,
} from "@/src/lib/notion/monthly-report-email-log";
import {
  getMonthlyReportAccounts,
  resolveMonthlyReportTargetsFromNotion,
  type MonthlyReportAccount,
} from "@/src/lib/notion/get-monthly-report-accounts";

export interface MonthlyReportJobResult {
  totalAccounts: number;
  reportType: ScheduledMonthlyReportType;
  scheduleDay: number;
  confirmationCheckboxProperty: string;
  checkedCount: number;
  processed: number;
  generated: number;
  emailed: number;
  failed: number;
  skipped: number;
  skippedMonthlyEmailUnchecked: number;
  skippedMissingEmail: number;
  skippedAlreadySent: number;
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
  scheduleDay?: number;
  reportType?: string;
  dateRange?: ReturnType<typeof resolveMonthlyReportDateRange>;
}): Promise<MonthlyReportJobResult> {
  const startedAt = Date.now();
  console.log("Monthly job started");

  const testMode = input?.forceTestMode ?? parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const dryRun = input?.forceDryRun ?? isMonthlyReportDryRun();
  const scheduleDay = input?.scheduleDay ?? new Date().getUTCDate();
  const reportType = input?.reportType
    ? normalizeScheduledReportType(input.reportType, scheduleDay)
    : resolveReportTypeForScheduleDay(scheduleDay);
  const confirmationCheckboxProperty = getReportConfirmationCheckboxProperty(reportType);

  try {
    const targetResolution = await resolveTargets({
      testMode,
      reportType,
      scheduleDay,
      overrideTargets: input?.overrideTargets,
    });
    const checkedTargets = targetResolution.accounts.filter((account) => account.monthlyReportEnabled);
    const missingEmailTargets = checkedTargets.filter((account) => !account.clientEmail?.trim());
    const emailableTargets = checkedTargets.filter((account) => account.clientEmail?.trim());
    const dateRange = input?.dateRange ?? resolveMonthlyReportDateRange();
    const duplicateFilteredTargets = dryRun || testMode
      ? { accounts: emailableTargets, skippedAlreadySent: 0 }
      : await filterAlreadySentAccounts(emailableTargets, {
          reportType,
          reportMonthKey: dateRange.reportMonthKey,
        });
    const accountsToProcess = testMode ? duplicateFilteredTargets.accounts.slice(0, 1) : duplicateFilteredTargets.accounts;
    const skippedFromTestMode = Math.max(duplicateFilteredTargets.accounts.length - accountsToProcess.length, 0);
    const skippedMonthlyEmailUnchecked =
      targetResolution.skippedMonthlyEmailUnchecked +
      targetResolution.accounts.filter((account) => !account.monthlyReportEnabled).length;
    const skippedMissingEmail = missingEmailTargets.length;

    console.log(`[monthly-report] scheduler day detected=${scheduleDay}`);
    console.log(`[monthly-report] report type=${reportType}`);
    console.log(`[monthly-report] confirmation checkbox property="${confirmationCheckboxProperty}"`);
    console.log(`[monthly-report] notion rows fetched=${targetResolution.totalNotionRows}`);
    console.log(`[monthly-report] rows approved by checkbox=${checkedTargets.length}`);
    console.log(`[monthly-report] rows skipped by checkbox=${skippedMonthlyEmailUnchecked}`);
    console.log(`[monthly-report] missing email skipped=${skippedMissingEmail}`);
    console.log(`[monthly-report] already sent skipped=${duplicateFilteredTargets.skippedAlreadySent}`);
    console.log(`Monthly report configured targets=${targetResolution.accounts.length}`);
    console.log(`Monthly report test mode enabled=${testMode}`);
    if (testMode) {
      console.log("[monthly-report] test mode active; processing at most one checked account and using the configured test recipient");
    }
    console.log(`Monthly report dry run enabled=${dryRun}`);

    for (const account of missingEmailTargets) {
      console.warn(
        `[monthly-report] skipped missing email page_id=${account.notionPageId} account_id=${resolvePrimaryAccountId(account) ?? "missing"} client=${account.clientName}`
      );
    }

    const pdfBatch = await generateMonthlyReportPdfBatch({
      accounts: accountsToProcess,
      dateRange,
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
            forceTestMode: testMode,
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
            if (!testMode) {
              await recordMonthlyReportEmailSent({
                account: pdfResult.account,
                reportType,
                reportMonthKey: pdfResult.reportMonthKey,
                recipientEmail: emailResult.recipientEmail,
                ccEmail: emailResult.ccEmail,
                resendEmailId: emailResult.resendEmailId,
              }).catch((error: unknown) => {
                console.error(`[monthly-report] sent log failed account_id=${pdfResult.accountId ?? "missing"} error=${toErrorMessage(error)}`);
              });
            }
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
    const skipped =
      pdfBatch.skipped +
      skippedFromTestMode +
      skippedMonthlyEmailUnchecked +
      skippedMissingEmail +
      duplicateFilteredTargets.skippedAlreadySent;
    const failed = pdfBatch.failed + emailFailures;
    const result: MonthlyReportJobResult = {
      totalAccounts: targetResolution.accounts.length,
      reportType,
      scheduleDay,
      confirmationCheckboxProperty,
      checkedCount: checkedTargets.length,
      processed: pdfBatch.processed,
      generated: pdfBatch.generated,
      emailed,
      failed,
      skipped,
      skippedMonthlyEmailUnchecked,
      skippedMissingEmail,
      skippedAlreadySent: duplicateFilteredTargets.skippedAlreadySent,
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
      `[monthly-report] summary report_type=${result.reportType} schedule_day=${result.scheduleDay} confirmation_checkbox="${result.confirmationCheckboxProperty}" total=${result.totalAccounts} checked=${result.checkedCount} processed=${result.processed} generated=${result.generated} sent=${result.emailed} failed=${result.failed} skipped=${result.skipped} skipped_missing_email=${result.skippedMissingEmail} skipped_unchecked=${result.skippedMonthlyEmailUnchecked} skipped_already_sent=${result.skippedAlreadySent} test_mode=${result.testMode} total_duration_ms=${result.totalDurationMs} within_ten_minutes=${result.withinTenMinutes}`
    );

    return result;
  } catch (error) {
    console.error("Monthly job target resolution failed", error);

    return {
      totalAccounts: 0,
      reportType,
      scheduleDay,
      confirmationCheckboxProperty,
      checkedCount: 0,
      processed: 0,
      generated: 0,
      emailed: 0,
      failed: 1,
      skipped: 0,
      skippedMonthlyEmailUnchecked: 0,
      skippedMissingEmail: 0,
      skippedAlreadySent: 0,
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
  reportType: ScheduledMonthlyReportType;
  scheduleDay: number;
  overrideTargets?: MonthlyReportTargetConfig[];
}): Promise<{
  accounts: MonthlyReportAccount[];
  totalNotionRows: number;
  skippedMonthlyEmailUnchecked: number;
}> {
  const rawConfiguredTargets =
    input.overrideTargets && input.overrideTargets.length > 0
      ? input.overrideTargets
      : parseTargetList(
          input.testMode
            ? process.env.MONTHLY_REPORT_TEST_TARGETS_JSON
            : process.env.MONTHLY_REPORT_TARGETS_JSON
        );
  const configuredTargets =
    rawConfiguredTargets.length > 0
      ? await resolveMonthlyReportTargetsFromNotion(rawConfiguredTargets, {
          reportType: input.reportType,
          scheduleDay: input.scheduleDay,
        })
      : [];

  if (configuredTargets.length > 0) {
    return {
      accounts: configuredTargets,
      totalNotionRows: 0,
      skippedMonthlyEmailUnchecked: 0,
    };
  }

  const notionAccounts = await getMonthlyReportAccounts({
    reportType: input.reportType,
    scheduleDay: input.scheduleDay,
  });
  if (notionAccounts.errorMessage) {
    throw new Error(notionAccounts.errorMessage);
  }
  return {
    accounts: notionAccounts.accounts.filter((account) => Boolean(account.googleAdsAccountId || account.metaAdsAccountId)),
    totalNotionRows: notionAccounts.total,
    skippedMonthlyEmailUnchecked: notionAccounts.monthlyEmailSkippedCount,
  };
}

async function filterAlreadySentAccounts(
  accounts: MonthlyReportAccount[],
  input: {
    reportType: string;
    reportMonthKey: string;
  }
): Promise<{ accounts: MonthlyReportAccount[]; skippedAlreadySent: number }> {
  const eligibleAccounts: MonthlyReportAccount[] = [];
  let skippedAlreadySent = 0;

  for (const account of accounts) {
    const alreadySent = await hasMonthlyReportEmailBeenSent({
      account,
      reportType: input.reportType,
      reportMonthKey: input.reportMonthKey,
    });
    if (alreadySent) {
      skippedAlreadySent += 1;
      console.info(
        `[monthly-report] skipped already sent report_type=${input.reportType} report_month=${input.reportMonthKey} page_id=${account.notionPageId} account_id=${resolvePrimaryAccountId(account) ?? "missing"} client=${account.clientName}`
      );
      continue;
    }

    eligibleAccounts.push(account);
  }

  return {
    accounts: eligibleAccounts,
    skippedAlreadySent,
  };
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  return account.googleAdsAccountId ?? account.metaAdsAccountId ?? null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
