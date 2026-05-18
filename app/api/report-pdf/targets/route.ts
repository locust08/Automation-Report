import { NextResponse } from "next/server";

import {
  parseBooleanEnv,
  parseTargetList,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { resolveMonthlyReportDateRange } from "@/src/lib/cron/monthly-report-date";
import {
  getReportConfirmationCheckboxProperty,
  normalizeScheduledReportType,
} from "@/src/lib/cron/monthly-report-confirmation";
import {
  getMonthlyReportAccounts,
  resolveMonthlyReportTargetsFromNotion,
} from "@/src/lib/notion/get-monthly-report-accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TargetRequestBody {
  forceTestMode?: boolean | string;
  overrideTargets?: MonthlyReportTargetConfig[];
  overrideTargetsJson?: string;
  scheduleDay?: number;
  reportType?: string | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await safeReadJson(request)) as TargetRequestBody | null;
  const scheduleDay = typeof body?.scheduleDay === "number" ? body.scheduleDay : new Date().getUTCDate();
  const reportType = normalizeScheduledReportType(body?.reportType, scheduleDay);
  const confirmationCheckboxProperty = getReportConfirmationCheckboxProperty(reportType);

  try {
    const forceTestMode =
      typeof body?.forceTestMode === "boolean"
        ? body.forceTestMode
        : parseBooleanEnv(typeof body?.forceTestMode === "string" ? body.forceTestMode : undefined);
    const overrideTargets =
      Array.isArray(body?.overrideTargets)
        ? body.overrideTargets
        : parseTargetList(typeof body?.overrideTargetsJson === "string" ? body.overrideTargetsJson : undefined);
    const dateRange = resolveMonthlyReportDateRange();
    const resolvedTargets = await resolveReportTargets({
      overrideTargets,
      forceTestMode,
      reportType,
      scheduleDay,
    });
    const checkedTargets = resolvedTargets.filter((target) => target.monthlyReportEnabled);
    const skippedUnchecked = resolvedTargets.length - checkedTargets.length;
    const targetsMissingEmail = checkedTargets.filter((target) => !target.clientEmail?.trim());
    const approvedTargets = checkedTargets.filter((target) => target.clientEmail?.trim());

    for (const target of targetsMissingEmail) {
      console.warn(
        `[monthly-report-targets] skipped missing email page_id=${target.notionPageId} client=${target.clientName}`
      );
    }

    const targets = approvedTargets
      .filter((target) => target.isValid)
      .map((target) => {
        const accountIds = resolveTargetAccountIds(target);

        return {
          notionPageId: target.notionPageId,
          clientName: target.clientName,
          googleAccountId: accountIds.googleAccountId,
          metaAccountId: accountIds.metaAccountId,
          recipientEmail: forceTestMode
            ? process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() || "amirulshahrul1775@gmail.com"
            : target.clientEmail,
          ccEmail: forceTestMode ? null : target.picEmail,
          platform: target.platform,
          reportType: target.reportType,
          monthlyEmailEnabled: true,
        };
      });

    return NextResponse.json({
      success: true,
      ...dateRange,
      reportType,
      scheduleDay,
      confirmationCheckboxProperty,
      testMode: forceTestMode,
      totalResolved: resolvedTargets.length,
      checkedCount: checkedTargets.length,
      skippedUnchecked,
      skippedMissingEmail: targetsMissingEmail.length,
      targets,
    });
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(
      `[monthly-report-targets] failed closed report_type=${reportType} confirmation_checkbox="${confirmationCheckboxProperty}" error=${message}`
    );

    return NextResponse.json(
      {
        success: false,
        error: message,
        reportType,
        scheduleDay,
        confirmationCheckboxProperty,
        targets: [],
      },
      { status: 500 }
    );
  }
}

async function resolveReportTargets(input: {
  overrideTargets: MonthlyReportTargetConfig[];
  forceTestMode: boolean;
  reportType: string;
  scheduleDay: number;
}) {
  if (input.overrideTargets.length > 0) {
    return resolveMonthlyReportTargetsFromNotion(input.overrideTargets, {
      reportType: input.reportType,
      scheduleDay: input.scheduleDay,
    });
  }

  const configuredTargetConfigs = parseTargetList(
    input.forceTestMode
      ? process.env.MONTHLY_REPORT_TEST_TARGETS_JSON
      : process.env.MONTHLY_REPORT_TARGETS_JSON
  );
  if (configuredTargetConfigs.length > 0) {
    return resolveMonthlyReportTargetsFromNotion(configuredTargetConfigs, {
      reportType: input.reportType,
      scheduleDay: input.scheduleDay,
    });
  }

  const notionResult = await getMonthlyReportAccounts({
    reportType: input.reportType,
    scheduleDay: input.scheduleDay,
  });
  if (notionResult.errorMessage) {
    throw new Error(notionResult.errorMessage);
  }
  console.info(
    `[monthly-report-targets] notion rows fetched=${notionResult.total} confirmation_checkbox="${notionResult.confirmationCheckboxProperty}" checkbox_approved=${notionResult.monthlyEmailApprovedCount} checkbox_unchecked_skipped=${notionResult.monthlyEmailSkippedCount}`
  );
  return notionResult.accounts.filter((account) => Boolean(account.googleAdsAccountId || account.metaAdsAccountId));
}

function isAuthorized(request: Request): boolean {
  const expectedSecret =
    process.env.REPORT_AUTOMATION_SECRET?.trim() || process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${expectedSecret}`;
}

async function safeReadJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    return await request.json();
  } catch {
    return null;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown target resolution failure.";
}

function resolveTargetAccountIds(target: {
  platform: string | null;
  googleAdsAccountId: string | null;
  metaAdsAccountId: string | null;
}): {
  googleAccountId: string | null;
  metaAccountId: string | null;
} {
  const platform = target.platform?.trim().toLowerCase() ?? "";

  if (platform.includes("meta") || platform.includes("facebook")) {
    return {
      googleAccountId: null,
      metaAccountId: target.metaAdsAccountId,
    };
  }

  if (platform.includes("google")) {
    return {
      googleAccountId: target.googleAdsAccountId,
      metaAccountId: null,
    };
  }

  return {
    googleAccountId: target.googleAdsAccountId,
    metaAccountId: target.metaAdsAccountId,
  };
}
