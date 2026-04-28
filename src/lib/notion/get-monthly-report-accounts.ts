import { getCredentials, normalizeGoogleAccountId, normalizeMetaAccountId } from "@/lib/reporting/env";
import {
  getNotionPropertyBoolean,
  getNotionPropertyText,
  queryNotionDatabasePages,
  type NotionPageProperty,
} from "@/lib/reporting/notion";

export interface MonthlyReportAccount {
  notionPageId: string;
  clientName: string;
  googleAdsAccountId: string | null;
  metaAdsAccountId: string | null;
  clientEmail: string | null;
  picEmail: string | null;
  status: string | null;
  monthlyReportEnabled: boolean;
  platform: string | null;
  reportType: string | null;
  isValid: boolean;
  skipReason: string | null;
}

export interface MonthlyReportAccountReadResult {
  accounts: MonthlyReportAccount[];
  skippedAccounts: MonthlyReportAccount[];
  totalPagesFetched: number;
  totalValidAccounts: number;
  totalSkippedAccounts: number;
}

export async function getMonthlyReportAccounts(): Promise<MonthlyReportAccountReadResult> {
  const credentials = getCredentials();

  console.info("[monthly-report] Notion query started");

  const pages = await queryNotionDatabasePages({
    notionAccessToken: credentials.notionAccessToken,
    notionDatabaseId: credentials.notionDatabaseId,
    pageSize: 100,
  });

  const matchingAccounts = pages
    .map((page) => mapMonthlyReportAccount(page))
    .filter((account): account is MonthlyReportAccount => Boolean(account))
    .filter((account) => account.status?.toLowerCase() === "active" && account.monthlyReportEnabled);

  const accounts = matchingAccounts.filter((account) => account.isValid);
  const skippedAccounts = matchingAccounts.filter((account) => !account.isValid);

  console.info(`[monthly-report] total pages fetched=${pages.length}`);
  console.info(`[monthly-report] total valid accounts=${accounts.length}`);
  console.info(`[monthly-report] total skipped/incomplete accounts=${skippedAccounts.length}`);

  return {
    accounts,
    skippedAccounts,
    totalPagesFetched: pages.length,
    totalValidAccounts: accounts.length,
    totalSkippedAccounts: skippedAccounts.length,
  };
}

function mapMonthlyReportAccount(page: {
  id?: string;
  properties?: Record<string, NotionPageProperty | undefined>;
}): MonthlyReportAccount | null {
  const notionPageId = page.id?.trim();
  if (!notionPageId) {
    return null;
  }

  const properties = page.properties ?? {};
  const status = getPropertyValue(properties, ["status"]);
  const monthlyReportEnabled = getBooleanPropertyValue(properties, [
    "monthly report enabled",
    "monthly report enable",
  ]);
  const googleAdsAccountId = normalizeOptionalAccountId(
    getPropertyValue(properties, [
      "google ads account id",
      "google ads id",
      "google account id",
      "google ads customer id",
      "google ads account",
    ]),
    "google"
  );
  const metaAdsAccountId = normalizeOptionalAccountId(
    getPropertyValue(properties, [
      "meta ads account id",
      "meta ads id",
      "meta account id",
      "facebook ads account id",
      "facebook account id",
      "meta ads account",
    ]),
    "meta"
  );
  const clientName =
    getPropertyValue(properties, ["client name", "name", "client", "account name"]) ??
    googleAdsAccountId ??
    metaAdsAccountId ??
    `Notion ${notionPageId.slice(0, 8)}`;
  const platform = getPropertyValue(properties, ["platform"]);
  const reportType = getPropertyValue(properties, ["platform report type", "platform/report type", "report type"]);
  const isValid = Boolean(googleAdsAccountId || metaAdsAccountId);

  return {
    notionPageId,
    clientName,
    googleAdsAccountId,
    metaAdsAccountId,
    clientEmail: getPropertyValue(properties, ["client email", "email"]),
    picEmail: getPropertyValue(properties, [
      "person in charge email",
      "person-in-charge email",
      "pic email",
    ]),
    status,
    monthlyReportEnabled,
    platform,
    reportType,
    isValid,
    skipReason: isValid ? null : "Missing both Google Ads ID and Meta Ads ID.",
  };
}

function getPropertyValue(
  properties: Record<string, NotionPageProperty | undefined>,
  aliases: string[]
): string | null {
  const normalizedProperties = getNormalizedProperties(properties);

  for (const alias of aliases) {
    const property = normalizedProperties.get(normalizePropertyKey(alias));
    const value = getNotionPropertyText(property);
    if (value) {
      return value;
    }
  }

  return null;
}

function getBooleanPropertyValue(
  properties: Record<string, NotionPageProperty | undefined>,
  aliases: string[]
): boolean {
  const normalizedProperties = getNormalizedProperties(properties);

  for (const alias of aliases) {
    const property = normalizedProperties.get(normalizePropertyKey(alias));
    const value = getNotionPropertyBoolean(property);
    if (value !== null) {
      return value;
    }
  }

  return false;
}

function getNormalizedProperties(
  properties: Record<string, NotionPageProperty | undefined>
): Map<string, NotionPageProperty | undefined> {
  return new Map(
    Object.entries(properties).map(([key, value]) => [normalizePropertyKey(key), value] as const)
  );
}

function normalizePropertyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalAccountId(
  value: string | null,
  platform: "google" | "meta"
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    platform === "google" ? normalizeGoogleAccountId(value) : normalizeMetaAccountId(value);

  return normalized || null;
}
