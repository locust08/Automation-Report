import {
  runMonthlyReportPreSchedulerTest,
  type MonthlyReportPreSchedulerMode,
} from "@/src/lib/cron/monthly-report-pre-scheduler-test";

const REQUIRED_TEST_RECIPIENT = "amirulshahrul1775@gmail.com";

async function main() {
  redirectOperationalLogsToStderr();

  const mode = parseMode(process.argv[2]);
  const limit = parseLimit(process.argv.slice(3));

  if (mode === "email") {
    process.env.MONTHLY_REPORT_TEST_MODE = process.env.MONTHLY_REPORT_TEST_MODE || "true";
    process.env.MONTHLY_REPORT_TEST_RECIPIENT =
      process.env.MONTHLY_REPORT_TEST_RECIPIENT || REQUIRED_TEST_RECIPIENT;
  }

  const summary = await runMonthlyReportPreSchedulerTest({
    mode,
    limit,
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.success ? 0 : 1;
}

function parseMode(value: string | undefined): MonthlyReportPreSchedulerMode {
  if (value === "notion" || value === "pdf" || value === "email") {
    return value;
  }

  throw new Error(
    "Missing or invalid mode. Use one of: notion, pdf, email."
  );
}

function parseLimit(args: string[]): number | undefined {
  const equalsArg = args.find((arg) => arg.startsWith("--limit="));
  const splitArgIndex = args.findIndex((arg) => arg === "--limit");
  const raw =
    equalsArg?.slice("--limit=".length) ??
    (splitArgIndex >= 0 ? args[splitArgIndex + 1] : undefined);

  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --limit value: ${raw}.`);
  }

  return parsed;
}

function redirectOperationalLogsToStderr() {
  const write =
    (level: "log" | "info" | "warn" | "error") =>
    (...args: unknown[]) => {
      const rendered = args.map(renderLogValue).join(" ");
      process.stderr.write(`[${level}] ${rendered}\n`);
    };

  console.log = write("log");
  console.info = write("info");
  console.warn = write("warn");
  console.error = write("error");
}

function renderLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown pre-scheduler test failure.";
  process.stderr.write(`[error] ${message}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        success: false,
        databaseName: "DB | AD Account",
        dryRun: process.env.MONTHLY_REPORT_DRY_RUN === "true",
        testMode: process.env.MONTHLY_REPORT_TEST_MODE === "true",
        testRecipient: REQUIRED_TEST_RECIPIENT,
        totalAccountsFromNotion: 0,
        eligibleAccountsWithEmail: 0,
        skippedNoEmail: 0,
        skippedMissingAccountId: 0,
        processed: 0,
        generated: 0,
        emailed: 0,
        failed: 1,
        totalDurationMs: 0,
        withinTenMinutes: true,
        allEmailsSentToTestRecipient: false,
        results: [],
        skippedAccounts: [],
        failedAccounts: [
          {
            notionPageId: "",
            accountId: null,
            accountName: "",
            reason: message,
          },
        ],
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
