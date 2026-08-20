import { NextResponse } from "next/server";

import {
  parseBooleanEnv,
  parseTargetList,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { resolveMonthlyReportDateRange } from "@/src/lib/cron/monthly-report-date";
import {
  getReportConfirmationCheckboxProperty,
  isAdvancedScheduledReportType,
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
    if (isAdvancedScheduledReportType(reportType) && !isAdvancedReportAutomationEnabled()) {
      console.warn(
        `[monthly-report-targets] skipped report_type=${reportType} schedule_day=${scheduleDay} reason="ADVANCED_REPORT_ENABLED=false"`
      );
      return NextResponse.json({
        success: true,
        ...resolveMonthlyReportDateRange(new Date(), reportType),
        reportType,
        scheduleDay,
        confirmationCheckboxProperty,
        testMode: false,
        totalResolved: 0,
        checkedCount: 0,
        skippedUnchecked: 0,
        skippedMissingEmail: 0,
        skippedReason: "ADVANCED_REPORT_ENABLED=false",
        targets: [],
      });
    }

    const forceTestMode =
      typeof body?.forceTestMode === "boolean"
        ? body.forceTestMode
        : parseBooleanEnv(typeof body?.forceTestMode === "string" ? body.forceTestMode : undefined);
    const overrideTargets =
      Array.isArray(body?.overrideTargets)
        ? body.overrideTargets
        : parseTargetList(typeof body?.overrideTargetsJson === "string" ? body.overrideTargetsJson : undefined);
    const dateRange = resolveMonthlyReportDateRange(new Date(), reportType);
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
          tiktokAccountId: accountIds.tiktokAccountId,
          recipientEmail: forceTestMode
            ? process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() || "amirulshahrul1775@gmail.com"
            : target.clientEmail,
          ccEmail: forceTestMode ? null : target.picEmail,
          platform: target.platform,
          reportType: isAdvancedScheduledReportType(reportType) ? "advanced" : target.reportType,
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
  return notionResult.accounts.filter((account) => Boolean(account.googleAdsAccountId || account.metaAdsAccountId || account.tiktokAdsAccountId));
}

function isAuthorized(request: Request): boolean {
  const expectedSecret =
    process.env.WORKER_API_SECRET?.trim() || process.env.CRON_SECRET?.trim();

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

function isAdvancedReportAutomationEnabled(): boolean {
  const value = process.env.ADVANCED_REPORT_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}

function resolveTargetAccountIds(target: {
  platform: string | null;
  googleAdsAccountId: string | null;
  metaAdsAccountId: string | null;
  tiktokAdsAccountId?: string | null;
}): {
  googleAccountId: string | null;
  metaAccountId: string | null;
  tiktokAccountId: string | null;
} {
  const platform = target.platform?.trim().toLowerCase() ?? "";

  if (platform.includes("meta") || platform.includes("facebook")) {
    return {
      googleAccountId: null,
      metaAccountId: target.metaAdsAccountId,
      tiktokAccountId: null,
    };
  }

  if (platform.includes("google")) {
    return {
      googleAccountId: target.googleAdsAccountId,
      metaAccountId: null,
      tiktokAccountId: null,
    };
  }

  if (platform.includes("tiktok")) {
    return {
      googleAccountId: null,
      metaAccountId: null,
      tiktokAccountId: target.tiktokAdsAccountId ?? null,
    };
  }

  return {
    googleAccountId: target.googleAdsAccountId,
    metaAccountId: target.metaAdsAccountId,
    tiktokAccountId: target.tiktokAdsAccountId ?? null,
  };
}
