export type AdsManagementPlatform = "meta" | "google" | "tiktok";

export const MANAGEMENT_VIEWS = [
  "campaigns",
  "ad_groups",
  "ads",
  "recommendations",
  "change_requests",
] as const;

export type AdsManagementView = (typeof MANAGEMENT_VIEWS)[number];

export type ManagementAccountSelection = {
  platform: AdsManagementPlatform;
  accountId: string;
  accountName: string;
};

export type ManagementMetricVocabulary = {
  spend: "Spend";
  results: "Results";
  activity: "Clicks" | "Engagements";
  costPerResult: "Cost / result";
};

type AccountResolutionInput = {
  directoryPlatform?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  directInput?: string | null;
};

type CanonicalManagementQueryInput = ManagementAccountSelection & {
  startDate?: string | null;
  endDate?: string | null;
  view?: AdsManagementView | null;
};

type LegacyManagementQuery = Record<string, string | string[] | undefined>;

export type ManagementAccountDirectoryEntry = {
  accountName: string;
  adAccountId: string;
  platform?: string | null;
};

type ManagementDisplayNameInput = {
  platform: AdsManagementPlatform;
  accountId: string;
  canonicalName?: string | null;
  providerName?: string | null;
};

const PLATFORM_LABELS: Record<AdsManagementPlatform, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const LEGACY_VIEW_ALIASES: Record<string, AdsManagementView> = {
  campaigns: "campaigns",
  ad_sets: "ad_groups",
  ad_groups: "ad_groups",
  ads: "ads",
  opportunities: "recommendations",
  recommendations: "recommendations",
  change_requests: "change_requests",
};

export function resolveManagementAccount(input: AccountResolutionInput): ManagementAccountSelection | null {
  if (input.directInput?.trim()) return resolveDirectManagementAccount(input.directInput);

  const rawAccountId = input.accountId?.trim() ?? "";
  const accountId = normalizeAccountId(rawAccountId);
  if (!accountId) return null;

  const platform = normalizePlatform(input.directoryPlatform)
    ?? platformFromAccountName(input.accountName)
    ?? platformFromUnambiguousId(rawAccountId);
  if (!platform) return null;

  return {
    platform,
    accountId,
    accountName: input.accountName?.trim() || defaultAccountName(platform, accountId),
  };
}

function platformFromUnambiguousId(value: string): AdsManagementPlatform | null {
  if (/^act_\d+$/i.test(value)) return "meta";
  if (/^\d{3}-\d{3}-\d{4}$/.test(value)) return "google";
  return null;
}

export function buildCanonicalManagementQuery(input: CanonicalManagementQueryInput): string {
  const params = new URLSearchParams();
  params.set("platform", input.platform);
  params.set("accountId", normalizeAccountId(input.accountId));
  params.set("accountName", input.accountName.trim() || defaultAccountName(input.platform, input.accountId));
  if (isIsoDate(input.startDate)) params.set("startDate", input.startDate);
  if (isIsoDate(input.endDate)) params.set("endDate", input.endDate);
  if (input.view && MANAGEMENT_VIEWS.includes(input.view)) params.set("view", input.view);
  return params.toString();
}

export function translateLegacyManagementQuery(
  platform: AdsManagementPlatform,
  query: LegacyManagementQuery,
): string {
  const providerIdKey = platform === "meta" ? "metaAccountId" : platform === "tiktok" ? "tiktokAccountId" : "googleAccountId";
  const accountId = first(query[providerIdKey]) || first(query.accountId);
  const normalizedId = normalizeAccountId(accountId ?? "");

  if (!normalizedId) {
    const params = new URLSearchParams({ platform });
    return `/manage?${params.toString()}`;
  }

  const legacyView = first(query.view);
  const view = legacyView ? LEGACY_VIEW_ALIASES[legacyView] : undefined;
  const canonical = buildCanonicalManagementQuery({
    platform,
    accountId: normalizedId,
    accountName: first(query.accountName) || defaultAccountName(platform, normalizedId),
    startDate: first(query.startDate),
    endDate: first(query.endDate),
    view,
  });
  return `/manage?${canonical}`;
}

export function getManagementMetricVocabulary(platform: AdsManagementPlatform): ManagementMetricVocabulary {
  return {
    spend: "Spend",
    results: "Results",
    activity: platform === "tiktok" ? "Engagements" : "Clicks",
    costPerResult: "Cost / result",
  };
}

export function managementSelectionKey(selection: ManagementAccountSelection): string {
  return `${selection.platform}:${normalizeAccountId(selection.accountId)}`;
}

export function resolveManagementDisplayName(input: ManagementDisplayNameInput): string {
  const accountId = normalizeAccountId(input.accountId);
  const canonicalName = input.canonicalName?.trim() ?? "";
  const providerName = input.providerName?.trim() ?? "";

  if (canonicalName && !isGenericAccountName(canonicalName, input.platform, accountId)) {
    return canonicalName;
  }
  if (providerName && !isGenericAccountName(providerName, input.platform, accountId)) {
    return providerName;
  }
  return canonicalName || providerName || defaultAccountName(input.platform, accountId);
}

export function mergeManagementRecentAccounts(
  entries: readonly ManagementAccountDirectoryEntry[],
  limit = 10,
): ManagementAccountSelection[] {
  const unique = new Map<string, ManagementAccountSelection>();
  for (const entry of entries) {
    const selection = resolveManagementAccount({
      directoryPlatform: entry.platform,
      accountId: entry.adAccountId,
      accountName: entry.accountName,
    });
    if (!selection) continue;
    const key = managementSelectionKey(selection);
    if (!unique.has(key)) unique.set(key, selection);
  }
  return [...unique.values()].slice(0, limit);
}

export function isAdsManagementPlatform(value: string | null | undefined): value is AdsManagementPlatform {
  return value === "meta" || value === "google" || value === "tiktok";
}

export function isAdsManagementView(value: string | null | undefined): value is AdsManagementView {
  return MANAGEMENT_VIEWS.includes(value as AdsManagementView);
}

function resolveDirectManagementAccount(rawInput: string): ManagementAccountSelection | null {
  const input = rawInput.trim();
  const explicit = /^(meta|m|google|g|tiktok|tt)\s*:\s*(.+)$/i.exec(input);
  if (explicit) {
    const platform = normalizePlatform(explicit[1]);
    const accountId = normalizeAccountId(explicit[2]);
    if (!platform || !accountId) return null;
    return { platform, accountId, accountName: defaultAccountName(platform, accountId) };
  }

  if (/^act_\d+$/i.test(input)) {
    const accountId = normalizeAccountId(input);
    return { platform: "meta", accountId, accountName: defaultAccountName("meta", accountId) };
  }

  if (/^\d{3}-\d{3}-\d{4}$/.test(input)) {
    const accountId = normalizeAccountId(input);
    return { platform: "google", accountId, accountName: defaultAccountName("google", accountId) };
  }

  return null;
}

function normalizePlatform(value: string | null | undefined): AdsManagementPlatform | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "meta" || normalized === "facebook" || normalized === "m") return "meta";
  if (normalized === "google" || normalized === "googleyoutube" || normalized === "google_youtube" || normalized === "g") return "google";
  if (normalized === "tiktok" || normalized === "tt") return "tiktok";
  return null;
}

function platformFromAccountName(value: string | null | undefined): AdsManagementPlatform | null {
  const name = value?.trim() ?? "";
  if (/^facebook\s*-/i.test(name) || /^meta\s*-/i.test(name)) return "meta";
  if (/^google\s*-/i.test(name)) return "google";
  if (/^tiktok\s*-/i.test(name)) return "tiktok";
  return null;
}

function normalizeAccountId(value: string): string {
  return value.trim().replace(/^act_/i, "").replaceAll("-", "").replaceAll(" ", "");
}

function defaultAccountName(platform: AdsManagementPlatform, accountId: string): string {
  return `${PLATFORM_LABELS[platform]} account ${normalizeAccountId(accountId)}`;
}

function isGenericAccountName(name: string, platform: AdsManagementPlatform, accountId: string): boolean {
  const normalized = name.trim().toLowerCase();
  const normalizedId = normalizeAccountId(accountId).toLowerCase();
  return normalized === normalizedId
    || normalized === `account ${normalizedId}`
    || normalized === `${PLATFORM_LABELS[platform].toLowerCase()} account ${normalizedId}`;
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
