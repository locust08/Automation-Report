import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_TEST_RECIPIENT = "ava@locus-t.com.my";

export interface MonthlyReportTargetConfig {
  clientName?: string;
  googleAccountId?: string | null;
  metaAccountId?: string | null;
  recipientEmail?: string | null;
  ccEmail?: string | null;
  reportType?: string | null;
  platform?: string | null;
}

export function getMonthlyReportTargets(input?: {
  testModeOverride?: boolean;
  rawTargetsOverride?: MonthlyReportTargetConfig[];
}): MonthlyReportAccount[] {
  const testMode = input?.testModeOverride ?? parseBooleanEnv(process.env.MONTHLY_REPORT_TEST_MODE);
  const envTargets =
    input?.rawTargetsOverride ??
    parseTargetList(
      testMode ? process.env.MONTHLY_REPORT_TEST_TARGETS_JSON : process.env.MONTHLY_REPORT_TARGETS_JSON
    );

  return buildMonthlyReportTargets(envTargets, testMode);
}

export function buildMonthlyReportTargets(
  targetConfigs: MonthlyReportTargetConfig[],
  testMode: boolean
): MonthlyReportAccount[] {
  if (targetConfigs.length > 0) {
    return targetConfigs.map((target, index) => toMonthlyReportAccount(target, index));
  }

  if (testMode) {
    return [
      toMonthlyReportAccount(
        {
          clientName: "Overall Report 183-160-3281",
          googleAccountId: "183-160-3281",
          recipientEmail: DEFAULT_TEST_RECIPIENT,
          reportType: "Overall",
          platform: "Google",
        },
        0
      ),
    ];
  }

  return [];
}

export function parseTargetList(raw: string | undefined): MonthlyReportTargetConfig[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MonthlyReportTargetConfig[]) : [];
  } catch (error) {
    console.error("Monthly report target config parse failed", error);
    return [];
  }
}

function toMonthlyReportAccount(
  target: MonthlyReportTargetConfig,
  index: number
): MonthlyReportAccount {
  const googleAccountId = normalizeId(target.googleAccountId, "google");
  const metaAccountId = normalizeId(target.metaAccountId, "meta");
  const clientName =
    target.clientName?.trim() ||
    googleAccountId ||
    metaAccountId ||
    `Monthly Report Target ${index + 1}`;

  return {
    notionPageId: `monthly-report-target-${index + 1}`,
    clientName,
    googleAdsAccountId: googleAccountId,
    metaAdsAccountId: metaAccountId,
    clientEmail: target.recipientEmail?.trim() || null,
    picEmail: target.ccEmail?.trim() || null,
    status: "Active",
    monthlyReportEnabled: true,
    platform: target.platform?.trim() || (metaAccountId && !googleAccountId ? "Meta" : "Google"),
    reportType: target.reportType?.trim() || "Overall",
    isValid: Boolean(googleAccountId || metaAccountId),
    skipReason: googleAccountId || metaAccountId ? null : "Missing account ID.",
  };
}

function normalizeId(value: string | null | undefined, platform: "google" | "meta"): string | null {
  if (!value?.trim()) {
    return null;
  }

  const cleaned = platform === "google" ? value.replace(/[^\d-]+/g, "") : value.replace(/\D/g, "");
  return cleaned || null;
}

export function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
