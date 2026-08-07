import {
  fetchGoogleAccountName,
  fetchGoogleContentSuitability,
  type GoogleContentSuitabilityCriterion,
} from "@/lib/reporting/google";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import {
  getContentSuitabilitySnapshot,
  saveContentSuitabilitySnapshot,
} from "@/lib/placement-optimization/content-suitability-repository";
import type {
  ContentSuitabilityItem,
  ContentSuitabilityPayload,
  ContentSuitabilitySection,
} from "@/lib/placement-optimization/types";

const CACHE_TTL_MS = 15 * 60 * 1000;

const SENSITIVE_LABELS = new Set([
  "PROFANITY",
  "SEXUALLY_SUGGESTIVE",
  "SOCIAL_ISSUES",
  "TRAGEDY",
  "JUVENILE",
]);

function titleCase(value: string) {
  return value
    .replace(/^BRAND_SUITABILITY_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function item(criterion: GoogleContentSuitabilityCriterion): ContentSuitabilityItem {
  return {
    id: criterion.resourceName,
    value: titleCase(criterion.value),
    label: criterion.label,
  };
}

function section(
  key: string,
  title: string,
  criteria: GoogleContentSuitabilityCriterion[],
  available: boolean,
  unavailableReason: string | null,
): ContentSuitabilitySection {
  const deduplicated = new Map<string, ContentSuitabilityItem>();
  criteria.forEach((criterion) => {
    const normalized = item(criterion);
    deduplicated.set(`${normalized.value}:${normalized.label ?? ""}`, normalized);
  });
  return {
    key,
    title,
    available,
    unavailableReason,
    items: [...deduplicated.values()].sort((left, right) =>
      left.value.localeCompare(right.value),
    ),
  };
}

function inventoryLabel(value: string | null): ContentSuitabilityPayload["inventoryType"] {
  if (!value) return "Unknown";
  const normalized = value.toUpperCase();
  if (normalized.includes("EXPANDED") || normalized.includes("MAXIMUM")) return "Maximum";
  if (normalized.includes("STANDARD") || normalized.includes("MODERATE")) return "Moderate";
  if (normalized.includes("LIMITED")) return "Limited";
  return "Unknown";
}

export async function getContentSuitability(input: {
  accountId: string;
  refresh?: boolean;
}): Promise<ContentSuitabilityPayload> {
  const customerId = normalizeGoogleAccountId(input.accountId);
  const cached = getContentSuitabilitySnapshot(customerId);
  const cachedAge = cached
    ? Date.now() - new Date(cached.refreshedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (!input.refresh && cached && cachedAge < CACHE_TTL_MS) {
    return { ...cached.payload, source: "cache", stale: false };
  }

  const credentials = getCredentials();
  if (!credentials.googleDeveloperToken) {
    if (cached) {
      return {
        ...cached.payload,
        source: "cache",
        stale: true,
        warnings: [
          ...cached.payload.warnings,
          "Google Ads credentials are unavailable; showing the last cached snapshot.",
        ],
      };
    }
    throw new Error("Google Ads developer token is unavailable.");
  }

  const routing = await resolveGoogleManagerIdsFromNotion({
    googleAccountIds: [customerId],
    notionAccessToken: credentials.notionAccessToken,
    notionDatabaseId: credentials.notionDatabaseId,
    fallbackLoginCustomerId: credentials.googleLoginCustomerId,
  });
  const loginCustomerId =
    routing.loginCustomerIdByAccount[customerId] ??
    credentials.googleLoginCustomerId;

  try {
    const customerName =
      (await fetchGoogleAccountName({
        customerId,
        apiVersion: credentials.googleAdsApiVersion,
        developerToken: credentials.googleDeveloperToken,
        accessToken: credentials.googleAccessToken,
        refreshToken: credentials.googleRefreshToken,
        clientId: credentials.googleClientId,
        clientSecret: credentials.googleClientSecret,
        loginCustomerId,
      })) ?? `Google Ads ${customerId}`;
    const result = await fetchGoogleContentSuitability({
      customerId,
      apiVersion: credentials.googleAdsApiVersion,
      developerToken: credentials.googleDeveloperToken,
      accessToken: credentials.googleAccessToken,
      refreshToken: credentials.googleRefreshToken,
      clientId: credentials.googleClientId,
      clientSecret: credentials.googleClientSecret,
      loginCustomerId,
      accessPath: routing.accessPathByAccount[customerId] ?? null,
      fallbackLoginCustomerId: credentials.googleLoginCustomerId,
    });
    const criteriaAvailable = !result.warnings.some((warning) =>
      warning.startsWith("Some account-level exclusions"),
    );
    const sharedAvailable = !result.warnings.some((warning) =>
      warning.startsWith("Excluded list contents"),
    );
    const labels = result.criteria.filter((criterion) => criterion.type === "CONTENT_LABEL");
    const sensitive = labels.filter((criterion) => SENSITIVE_LABELS.has(criterion.value));
    const themes = labels.filter((criterion) => criterion.value.startsWith("BRAND_SUITABILITY_"));
    const types = labels.filter(
      (criterion) => !SENSITIVE_LABELS.has(criterion.value) && !criterion.value.startsWith("BRAND_SUITABILITY_"),
    );
    const keywordLists = result.criteria.filter((criterion) => criterion.type === "NEGATIVE_KEYWORD_LIST");
    const placementLists = result.criteria.filter((criterion) => criterion.type === "PLACEMENT_LIST");
    const keywords = result.sharedCriteria.filter((criterion) => criterion.type === "KEYWORD");
    const sharedPlacements = result.sharedCriteria.filter((criterion) => criterion.type === "PLACEMENT");
    const payload: ContentSuitabilityPayload = {
      account: { customerId, customerName },
      inventoryType: inventoryLabel(result.inventoryType),
      sections: [
        section("sensitive", "Excluded sensitive content", sensitive, criteriaAvailable, criteriaAvailable ? null : "Unavailable through Google Ads API"),
        section("types", "Excluded types and labels", types, criteriaAvailable, criteriaAvailable ? null : "Unavailable through Google Ads API"),
        section("themes", "Excluded content themes", themes, criteriaAvailable, criteriaAvailable ? null : "Unavailable through Google Ads API"),
        section("keywords", "Excluded content keywords and lists", [...keywordLists, ...keywords], criteriaAvailable && sharedAvailable, sharedAvailable ? null : "List contents are unavailable through Google Ads API"),
        section(
          "websites-apps",
          "Excluded websites and mobile applications",
          [
            ...result.criteria.filter((criterion) => ["PLACEMENT", "MOBILE_APPLICATION", "MOBILE_APP_CATEGORY"].includes(criterion.type)),
            ...placementLists,
            ...sharedPlacements,
          ],
          criteriaAvailable && sharedAvailable,
          sharedAvailable ? null : "Some list contents are unavailable through Google Ads API",
        ),
        section(
          "youtube",
          "Excluded YouTube channels and videos",
          [
            ...result.criteria.filter((criterion) => ["YOUTUBE_CHANNEL", "YOUTUBE_VIDEO"].includes(criterion.type)),
            ...result.sharedCriteria.filter((criterion) => ["YOUTUBE_CHANNEL", "YOUTUBE_VIDEO"].includes(criterion.type)),
          ],
          criteriaAvailable && sharedAvailable,
          sharedAvailable ? null : "Some list contents are unavailable through Google Ads API",
        ),
      ],
      refreshedAt: new Date().toISOString(),
      source: "live",
      stale: false,
      warnings: [...routing.messages, ...result.warnings],
    };
    saveContentSuitabilitySnapshot(payload);
    return payload;
  } catch (error) {
    if (cached) {
      return {
        ...cached.payload,
        source: "cache",
        stale: true,
        warnings: [
          ...cached.payload.warnings,
          `Live refresh failed; showing cached settings. ${error instanceof Error ? error.message : "Unknown Google Ads error"}`,
        ],
      };
    }
    throw error;
  }
}
