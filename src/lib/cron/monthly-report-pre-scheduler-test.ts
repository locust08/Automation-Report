import {
  generateMonthlyReportPdfBatch,
  type MonthlyReportPdfResult,
} from "@/src/lib/cron/generate-monthly-report-pdf";
import { parseBooleanEnv } from "@/src/lib/cron/monthly-report-targets";
import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import {
  getMonthlyReportAccounts,
  type MonthlyReportAccount,
} from "@/src/lib/notion/get-monthly-report-accounts";

const DATABASE_NAME = "DB | AD Account";
const REQUIRED_TEST_RECIPIENT = "amirulshahrul1775@gmail.com";
const TEN_MINUTES_MS = 10 * 60 * 1000;

export type MonthlyReportPreSchedulerMode = "notion" | "pdf" | "email";

export interface MonthlyReportPreSchedulerInput {
  mode: MonthlyReportPreSchedulerMode;
  limit?: number;
}

export interface MonthlyReportPreSchedulerSummary {
  success: boolean;
  databaseName: string;
  dryRun: boolean;
  testMode: boolean;
  testRecipient: string;
  totalAccountsFromNotion: number;
  eligibleAccountsWithEmail: number;
  skippedNoEmail: number;
  skippedMissingAccountId: number;
  processed: number;
  generated: number;
  emailed: number;
  failed: number;
  totalDurationMs: number;
  withinTenMinutes: boolean;
  allEmailsSentToTestRecipient: boolean;
  results: MonthlyReportPreSchedulerResult[];
  skippedAccounts: MonthlyReportSkippedAccount[];
  failedAccounts: MonthlyReportFailedAccount[];
}

export interface MonthlyReportPreSchedulerResult {
  notionPageId: string;
  accountId: string;
  accountName: string;
  intendedRecipientEmail: string;
  actualSendTo: string | null;
  testMode: boolean;
  dryRun: boolean;
  pdfStatus: MonthlyReportPdfResult["status"] | "not_requested";
  pdfDurationMs: number;
  pdfSizeKb: number;
  pdfPath: string | null;
  emailSent: boolean;
  resendEmailId: string | null;
  errorMessage: string | null;
}

export interface MonthlyReportSkippedAccount {
  notionPageId: string;
  accountId: string | null;
  accountName: string;
  intendedRecipientEmail: string | null;
  skipReason: string;
}

export interface MonthlyReportFailedAccount {
  notionPageId: string;
  accountId: string | null;
  accountName: string;
  reason: string;
}

interface EligibleMonthlyReportAccount {
  account: MonthlyReportAccount;
  accountId: string;
  accountName: string;
  intendedRecipientEmail: string;
  notionPageId: string;
}

export async function runMonthlyReportPreSchedulerTest(
  input: MonthlyReportPreSchedulerInput
): Promise<MonthlyReportPreSchedulerSummary> {
  const startedAt = Date.now();
  const dryRun = parseBooleanEnv(process.env.MONTHLY_REPORT_DRY_RUN);
  const testMode = parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const configuredTestRecipient =
    process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() || REQUIRED_TEST_RECIPIENT;
  const notionResult = await getMonthlyReportAccounts();

  if (notionResult.errorMessage) {
    const totalDurationMs = Date.now() - startedAt;

    return {
      success: false,
      databaseName: DATABASE_NAME,
      dryRun,
      testMode,
      testRecipient: REQUIRED_TEST_RECIPIENT,
      totalAccountsFromNotion: notionResult.total,
      eligibleAccountsWithEmail: 0,
      skippedNoEmail: 0,
      skippedMissingAccountId: 0,
      processed: 0,
      generated: 0,
      emailed: 0,
      failed: 1,
      totalDurationMs,
      withinTenMinutes: totalDurationMs <= TEN_MINUTES_MS,
      allEmailsSentToTestRecipient: false,
      results: [],
      skippedAccounts: [],
      failedAccounts: [
        {
          notionPageId: "",
          accountId: null,
          accountName: "",
          reason: notionResult.errorMessage,
        },
      ],
    };
  }

  const { eligibleAccounts, skippedAccounts, skippedNoEmail, skippedMissingAccountId } =
    buildEligibleAccountSet(notionResult.accounts, notionResult.skippedAccounts);
  const limitedAccounts = applyLimit(eligibleAccounts, input.limit);
  const results: MonthlyReportPreSchedulerResult[] = [];
  const failedAccounts: MonthlyReportFailedAccount[] = [];
  let generated = 0;
  let emailed = 0;

  if (input.mode === "notion") {
    for (const item of limitedAccounts) {
      results.push(buildNotionOnlyResult(item, dryRun, testMode));
    }
  } else {
    const pdfBatch = await generateMonthlyReportPdfBatch({
      accounts: limitedAccounts.map((item) => item.account),
    });
    const eligibleByPageId = new Map(
      limitedAccounts.map((item) => [item.notionPageId, item])
    );

    for (const pdfResult of pdfBatch.results) {
      const item = eligibleByPageId.get(pdfResult.account.notionPageId);
      const result = buildPdfResult(item, pdfResult, dryRun, testMode);

      console.info(
        `[monthly-report:test] pdf account_id=${result.accountId}` +
          ` pdfDurationMs=${result.pdfDurationMs}` +
          ` pdfSizeKb=${result.pdfSizeKb}`
      );

      if (pdfResult.status === "generated" && pdfResult.pdfBuffer) {
        generated += 1;
      } else {
        failedAccounts.push({
          notionPageId: result.notionPageId,
          accountId: result.accountId,
          accountName: result.accountName,
          reason: pdfResult.errorMessage ?? "PDF generation failed.",
        });
      }

      if (
        input.mode === "email" &&
        pdfResult.status === "generated" &&
        pdfResult.pdfBuffer
      ) {
        if (dryRun) {
          result.errorMessage = "Dry run enabled; email send skipped.";
        } else if (!testMode) {
          result.errorMessage =
            "Unsafe email send blocked: MONTHLY_REPORT_TEST_MODE must be true for test email command.";
          failedAccounts.push({
            notionPageId: result.notionPageId,
            accountId: result.accountId,
            accountName: result.accountName,
            reason: result.errorMessage,
          });
        } else if (configuredTestRecipient.toLowerCase() !== REQUIRED_TEST_RECIPIENT) {
          result.errorMessage = `Unsafe email send blocked: MONTHLY_REPORT_TEST_RECIPIENT must be ${REQUIRED_TEST_RECIPIENT}.`;
          failedAccounts.push({
            notionPageId: result.notionPageId,
            accountId: result.accountId,
            accountName: result.accountName,
            reason: result.errorMessage,
          });
        } else {
          const emailResult = await sendMonthlyReportEmail({
            account: pdfResult.account,
            pdfBuffer: pdfResult.pdfBuffer,
            reportMonthKey: pdfResult.reportMonthKey,
            reportMonthLabel: pdfResult.reportMonthLabel,
          });

          result.actualSendTo = emailResult.recipientEmail;
          result.emailSent = emailResult.success;
          result.resendEmailId = emailResult.resendEmailId;
          result.errorMessage = emailResult.errorMessage;

          if (emailResult.success) {
            emailed += 1;
          } else {
            failedAccounts.push({
              notionPageId: result.notionPageId,
              accountId: result.accountId,
              accountName: result.accountName,
              reason: emailResult.errorMessage ?? "Email send failed.",
            });
          }
        }
      }

      results.push(result);
    }
  }

  const totalDurationMs = Date.now() - startedAt;
  const failed = failedAccounts.length;
  const allEmailsSentToTestRecipient = results
    .filter((result) => result.emailSent)
    .every((result) => result.actualSendTo?.toLowerCase() === REQUIRED_TEST_RECIPIENT);

  return {
    success: failed === 0,
    databaseName: DATABASE_NAME,
    dryRun,
    testMode,
    testRecipient: REQUIRED_TEST_RECIPIENT,
    totalAccountsFromNotion: notionResult.total,
    eligibleAccountsWithEmail: eligibleAccounts.length,
    skippedNoEmail,
    skippedMissingAccountId,
    processed: limitedAccounts.length,
    generated,
    emailed,
    failed,
    totalDurationMs,
    withinTenMinutes: totalDurationMs <= TEN_MINUTES_MS,
    allEmailsSentToTestRecipient,
    results,
    skippedAccounts,
    failedAccounts,
  };
}

function buildEligibleAccountSet(
  accounts: MonthlyReportAccount[],
  invalidAccountRows: MonthlyReportAccount[]
): {
  eligibleAccounts: EligibleMonthlyReportAccount[];
  skippedAccounts: MonthlyReportSkippedAccount[];
  skippedNoEmail: number;
  skippedMissingAccountId: number;
} {
  const eligibleAccounts: EligibleMonthlyReportAccount[] = [];
  const skippedAccounts: MonthlyReportSkippedAccount[] = [];
  let skippedNoEmail = 0;
  let skippedMissingAccountId = 0;

  for (const account of invalidAccountRows) {
    skippedMissingAccountId += 1;
    skippedAccounts.push(toSkippedAccount(account, account.skipReason ?? "Missing account ID."));
  }

  for (const account of accounts) {
    const accountId = resolvePrimaryAccountId(account);
    const recipientValidation = validateRecipientEmail(account.clientEmail);

    if (!accountId) {
      skippedMissingAccountId += 1;
      skippedAccounts.push(toSkippedAccount(account, "Missing account ID."));
      continue;
    }

    if (!recipientValidation.valid) {
      skippedNoEmail += 1;
      skippedAccounts.push(
        toSkippedAccount(account, recipientValidation.reason ?? "Missing or invalid recipient email.")
      );
      continue;
    }

    eligibleAccounts.push({
      account,
      accountId,
      accountName: account.clientName,
      intendedRecipientEmail: recipientValidation.normalizedEmail,
      notionPageId: account.notionPageId,
    });
  }

  return {
    eligibleAccounts,
    skippedAccounts,
    skippedNoEmail,
    skippedMissingAccountId,
  };
}

function buildNotionOnlyResult(
  item: EligibleMonthlyReportAccount,
  dryRun: boolean,
  testMode: boolean
): MonthlyReportPreSchedulerResult {
  return {
    notionPageId: item.notionPageId,
    accountId: item.accountId,
    accountName: item.accountName,
    intendedRecipientEmail: item.intendedRecipientEmail,
    actualSendTo: null,
    testMode,
    dryRun,
    pdfStatus: "not_requested",
    pdfDurationMs: 0,
    pdfSizeKb: 0,
    pdfPath: null,
    emailSent: false,
    resendEmailId: null,
    errorMessage: null,
  };
}

function buildPdfResult(
  item: EligibleMonthlyReportAccount | undefined,
  pdfResult: MonthlyReportPdfResult,
  dryRun: boolean,
  testMode: boolean
): MonthlyReportPreSchedulerResult {
  const accountId = item?.accountId ?? pdfResult.accountId ?? "missing";
  const accountName = item?.accountName ?? pdfResult.accountName;

  return {
    notionPageId: item?.notionPageId ?? pdfResult.account.notionPageId,
    accountId,
    accountName,
    intendedRecipientEmail: item?.intendedRecipientEmail ?? pdfResult.account.clientEmail ?? "",
    actualSendTo: null,
    testMode,
    dryRun,
    pdfStatus: pdfResult.status,
    pdfDurationMs: pdfResult.durationMs,
    pdfSizeKb: bytesToKb(pdfResult.pdfSizeBytes),
    pdfPath: pdfResult.pdfPath,
    emailSent: false,
    resendEmailId: null,
    errorMessage: pdfResult.errorMessage,
  };
}

function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  if (!limit || limit <= 0) {
    return items;
  }

  return items.slice(0, limit);
}

function validateRecipientEmail(value: string | null): {
  valid: boolean;
  normalizedEmail: string;
  reason: string | null;
} {
  if (!value?.trim()) {
    return {
      valid: false,
      normalizedEmail: "",
      reason: "Missing recipient email.",
    };
  }

  const emails = value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    return {
      valid: false,
      normalizedEmail: "",
      reason: "Missing recipient email.",
    };
  }

  const invalidEmail = emails.find((email) => !isValidEmail(email));
  if (invalidEmail) {
    return {
      valid: false,
      normalizedEmail: value.trim(),
      reason: `Invalid recipient email: ${invalidEmail}.`,
    };
  }

  return {
    valid: true,
    normalizedEmail: Array.from(new Set(emails)).join(", "),
    reason: null,
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toSkippedAccount(
  account: MonthlyReportAccount,
  skipReason: string
): MonthlyReportSkippedAccount {
  return {
    notionPageId: account.notionPageId,
    accountId: resolvePrimaryAccountId(account),
    accountName: account.clientName,
    intendedRecipientEmail: account.clientEmail,
    skipReason,
  };
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  return account.googleAdsAccountId ?? account.metaAdsAccountId ?? null;
}

function bytesToKb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}
