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
  isAdvancedScheduledReportType,
  normalizeScheduledReportType,
  resolveReportTypeForScheduleDay,
  type ScheduledMonthlyReportType,
} from "@/src/lib/cron/monthly-report-confirmation";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import {
  hasMonthlyReportEmailBeenSent,
  recordMonthlyReportEmailSent,
} from "@/src/lib/notion/monthly-report-email-log";
import { updateMonthlyReportAccountSendStatus } from "@/src/lib/notion/monthly-report-account-status";
import {
  getMonthlyReportAccounts,
  resolveMonthlyReportTargetsFromNotion,
  type MonthlyReportAccount,
} from "@/src/lib/notion/get-monthly-report-accounts";

export interface MonthlyReportAccountSendResult {
  notionPageId: string | null;
  accountId: string | null;
  accountName: string;
  email: string | null;
  status: "sent" | "skipped" | "failed";
  notes: string | null;
}

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
  accountResults: MonthlyReportAccountSendResult[];
}

export async function runMonthlyReportJob(input?: {
  forceTestMode?: boolean;
  forceDryRun?: boolean;
  overrideTargets?: MonthlyReportTargetConfig[];
  scheduleDay?: number;
  reportType?: string;
  scheduledDate?: string;
  dateRange?: ReturnType<typeof resolveMonthlyReportDateRange>;
  updateAccountSendStatus?: boolean;
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
  const scheduledDate = resolveScheduledDate(input?.scheduledDate);
  const dateRange = input?.dateRange ?? resolveMonthlyReportDateRange();

  if (isAdvancedScheduledReportType(reportType) && !isAdvancedReportAutomationEnabled()) {
    const totalDurationMs = Date.now() - startedAt;
    const warning = "Advanced Report automation disabled by ADVANCED_REPORT_ENABLED=false.";
    console.warn(
      `[monthly-report] skipped report_type=${reportType} period=${dateRange.reportMonthKey} scheduled_date=${scheduledDate} reason="${warning}"`
    );
    console.info(
      `[monthly-report] debug summary processed=0 sent=0 skipped=1 failed=0 report_type=${reportType} period=${dateRange.reportMonthKey} scheduled_date=${scheduledDate}`
    );

    return {
      totalAccounts: 0,
      reportType,
      scheduleDay,
      confirmationCheckboxProperty,
      checkedCount: 0,
      processed: 0,
      generated: 0,
      emailed: 0,
      failed: 0,
      skipped: 1,
      skippedMonthlyEmailUnchecked: 0,
      skippedMissingEmail: 0,
      skippedAlreadySent: 0,
      totalDurationMs,
      withinTenMinutes: true,
      warning,
      slowestAccounts: [],
      dryRun,
      testMode,
      pdfResults: [],
      emailResults: [],
      accountResults: [],
    };
  }

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
    const duplicateFilteredTargets = dryRun || testMode
      ? { accounts: emailableTargets, skippedAlreadySent: 0, skippedAccounts: [] }
      : await filterAlreadySentAccounts(emailableTargets, {
          reportType,
          reportMonthKey: dateRange.reportMonthKey,
          scheduledDate,
        });
    const accountsToProcess = (testMode ? duplicateFilteredTargets.accounts.slice(0, 1) : duplicateFilteredTargets.accounts)
      .map((account) => applyScheduledReportType(account, reportType));
    const skippedFromTestMode = Math.max(duplicateFilteredTargets.accounts.length - accountsToProcess.length, 0);
    const skippedMonthlyEmailUnchecked =
      targetResolution.skippedMonthlyEmailUnchecked +
      targetResolution.accounts.filter((account) => !account.monthlyReportEnabled).length;
    const skippedMissingEmail = missingEmailTargets.length;

    console.log(`[monthly-report] scheduler day detected=${scheduleDay}`);
    console.log(`[monthly-report] report type=${reportType}`);
    console.log(`[monthly-report] period=${dateRange.reportMonthKey} scheduled_date=${scheduledDate}`);
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
        `[monthly-report] skipped missing email report_type=${reportType} period=${dateRange.reportMonthKey} scheduled_date=${scheduledDate} page_id=${account.notionPageId} account_id=${resolvePrimaryAccountId(account) ?? "missing"} client=${account.clientName} skipped_reason="missing recipient email"`
      );
    }

    const skippedAccountResults: MonthlyReportAccountSendResult[] = [
      ...missingEmailTargets.map((account) =>
        buildAccountSendResult(account, "skipped", "Missing client email.")
      ),
      ...duplicateFilteredTargets.skippedAccounts.map((account) =>
        buildAccountSendResult(account, "skipped", "Already sent for this report type and month.")
      ),
    ];

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
        if (isAdvancedScheduledReportType(reportType) && pdfResult.account.reportType !== "Advanced") {
          emailFailures += 1;
          console.error(
            `[monthly-report] advanced email blocked account_id=${pdfResult.accountId ?? "missing"} reason=reportType was not advanced`
          );
          emailResults.push({
            accountId: pdfResult.accountId,
            accountName: pdfResult.accountName,
            success: false,
            recipientEmail: null,
            ccEmail: null,
            resendEmailId: null,
            errorMessage: "Advanced email blocked because reportType was not advanced.",
          });
          continue;
        }

        try {
          console.log(
            `[monthly-report] email sending started report_type=${reportType} period=${pdfResult.reportMonthKey} scheduled_date=${scheduledDate} account_id=${pdfResult.accountId ?? "missing"} account_name=${pdfResult.accountName} email_status=started`
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
            console.info(
              `[monthly-report] email sent report_type=${reportType} period=${pdfResult.reportMonthKey} scheduled_date=${scheduledDate} account_id=${pdfResult.accountId ?? "missing"} account_name=${pdfResult.accountName} email_status=sent resend_email_id=${emailResult.resendEmailId ?? "missing"}`
            );
            if (!testMode) {
              await recordMonthlyReportEmailSent({
                account: pdfResult.account,
                reportType,
                reportMonthKey: pdfResult.reportMonthKey,
                scheduledDate,
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
              `[monthly-report] email send failure report_type=${reportType} period=${pdfResult.reportMonthKey} scheduled_date=${scheduledDate} account_id=${pdfResult.accountId ?? "missing"} account_name=${pdfResult.accountName} email_status=failed reason=${emailResult.errorMessage ?? "Unknown email send error."}`
            );
          }
        } catch (error) {
          emailFailures += 1;
          console.error(
            `[monthly-report] email send failure report_type=${reportType} period=${pdfResult.reportMonthKey} scheduled_date=${scheduledDate} account_id=${pdfResult.accountId ?? "missing"} account_name=${pdfResult.accountName} email_status=failed reason=${toErrorMessage(error)}`
          );
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
    const accountResults = buildAccountSendResults({
      skippedAccountResults,
      pdfResults: pdfBatch.results,
      emailResults,
      dryRun,
    });

    if (input?.updateAccountSendStatus) {
      await updateAccountStatuses(accountResults, {
        accounts: [...missingEmailTargets, ...duplicateFilteredTargets.skippedAccounts, ...accountsToProcess],
        reportType,
      });
    }

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
      accountResults,
    };

    console.log(
      `[monthly-report] summary report_type=${result.reportType} schedule_day=${result.scheduleDay} confirmation_checkbox="${result.confirmationCheckboxProperty}" total=${result.totalAccounts} checked=${result.checkedCount} processed=${result.processed} generated=${result.generated} sent=${result.emailed} failed=${result.failed} skipped=${result.skipped} skipped_missing_email=${result.skippedMissingEmail} skipped_unchecked=${result.skippedMonthlyEmailUnchecked} skipped_already_sent=${result.skippedAlreadySent} test_mode=${result.testMode} total_duration_ms=${result.totalDurationMs} within_ten_minutes=${result.withinTenMinutes}`
    );
    console.info(
      `[monthly-report] debug summary processed=${result.processed} sent=${result.emailed} skipped=${result.skipped} failed=${result.failed} report_type=${result.reportType} period=${dateRange.reportMonthKey} scheduled_date=${scheduledDate}`
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
      accountResults: [],
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
    scheduledDate: string;
  }
): Promise<{ accounts: MonthlyReportAccount[]; skippedAlreadySent: number; skippedAccounts: MonthlyReportAccount[] }> {
  const eligibleAccounts: MonthlyReportAccount[] = [];
  const skippedAccounts: MonthlyReportAccount[] = [];
  let skippedAlreadySent = 0;

  for (const account of accounts) {
    const alreadySent = await hasMonthlyReportEmailBeenSent({
      account,
      reportType: input.reportType,
      reportMonthKey: input.reportMonthKey,
      scheduledDate: input.scheduledDate,
    });
    if (alreadySent) {
      skippedAlreadySent += 1;
      skippedAccounts.push(account);
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
    skippedAccounts,
  };
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  return account.googleAdsAccountId ?? account.metaAdsAccountId ?? null;
}

function applyScheduledReportType(
  account: MonthlyReportAccount,
  reportType: ScheduledMonthlyReportType
): MonthlyReportAccount {
  if (!isAdvancedScheduledReportType(reportType)) {
    return account;
  }

  return {
    ...account,
    reportType: "Advanced",
  };
}

function resolveScheduledDate(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function buildAccountSendResults(input: {
  skippedAccountResults: MonthlyReportAccountSendResult[];
  pdfResults: MonthlyReportPdfBatchResult["results"];
  emailResults: MonthlyReportJobResult["emailResults"];
  dryRun: boolean;
}): MonthlyReportAccountSendResult[] {
  const emailResultsByAccountId = new Map(
    input.emailResults.map((result) => [result.accountId ?? result.accountName, result])
  );
  const processedResults = input.pdfResults.map((pdfResult) => {
    const emailResult = emailResultsByAccountId.get(pdfResult.accountId ?? pdfResult.accountName);
    if (pdfResult.status === "skipped") {
      return buildAccountSendResult(pdfResult.account, "skipped", pdfResult.errorMessage);
    }
    if (pdfResult.status === "failed") {
      return buildAccountSendResult(pdfResult.account, "failed", pdfResult.errorMessage);
    }
    if (input.dryRun) {
      return buildAccountSendResult(pdfResult.account, "skipped", "Dry run: email not sent.");
    }
    if (emailResult?.success) {
      return buildAccountSendResult(pdfResult.account, "sent", emailResult.resendEmailId ? `Resend ID: ${emailResult.resendEmailId}` : null);
    }
    return buildAccountSendResult(
      pdfResult.account,
      "failed",
      emailResult?.errorMessage ?? "Email send failed."
    );
  });

  return [...input.skippedAccountResults, ...processedResults];
}

function buildAccountSendResult(
  account: MonthlyReportAccount,
  status: MonthlyReportAccountSendResult["status"],
  notes: string | null
): MonthlyReportAccountSendResult {
  return {
    notionPageId: account.notionPageId || null,
    accountId: resolvePrimaryAccountId(account),
    accountName: account.clientName,
    email: account.clientEmail,
    status,
    notes,
  };
}

async function updateAccountStatuses(
  results: MonthlyReportAccountSendResult[],
  input: {
    accounts: MonthlyReportAccount[];
    reportType: ScheduledMonthlyReportType;
  }
): Promise<void> {
  const accountsByPageId = new Map(input.accounts.map((account) => [account.notionPageId, account]));
  const sentDate = new Date().toISOString().slice(0, 10);

  for (const result of results) {
    if (!result.notionPageId) {
      continue;
    }

    const account = accountsByPageId.get(result.notionPageId);
    if (!account) {
      continue;
    }

    await updateMonthlyReportAccountSendStatus({
      account,
      reportType: input.reportType,
      status:
        result.status === "sent"
          ? "Sent"
          : result.status === "failed"
            ? "Failed"
            : "Skipped",
      sentDate: result.status === "sent" ? sentDate : null,
      errorMessage: result.status === "failed" ? result.notes : null,
    });
  }
}

function isAdvancedReportAutomationEnabled(): boolean {
  const value = process.env.ADVANCED_REPORT_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}
