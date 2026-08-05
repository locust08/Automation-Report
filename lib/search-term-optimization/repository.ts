import { promises as fs } from "node:fs";
import path from "node:path";

import { getCredentials } from "@/lib/reporting/env";
import { calculateSafetyScore, evaluateHardGates } from "@/lib/search-term-optimization/scoring";
import type {
  OptimizationDashboardPayload,
  OptimizationResult,
  GoogleKeywordRecommendation,
} from "@/lib/search-term-optimization/types";

type RawCriterion = {
  text?: string;
  matchType?: string;
  negative?: boolean;
};

type RawRow = {
  term_id?: string;
  searchTerm: string;
  campaignName: string;
  adGroupName: string;
  destinationUrl: string;
  proposedAction: string;
  specialReview?: string;
  relevance?: string;
  mismatchIsClear: boolean;
  mismatchCategory: string;
  negativePhraseSeed?: string;
  reason: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

type GoogleSearchTermContext = {
  resourceName: string | null;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string;
  triggeringKeyword: string | null;
  matchType: string | null;
  addedExcludedStatus: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
};

type RawOutput = {
  customerId: string;
  customerIdNormalized: string;
  customerName: string;
  generatedAt: string;
  loginCustomerIdUsed?: string;
  dateRange: { startDate: string; endDate: string };
  source: {
    termsReviewed: number;
    mutatingGoogleAdsChanges: boolean;
  };
  siteContexts: Record<string, { primaryPage?: { text?: string } }>;
  safetyCorpus?: { keywordCriteria?: RawCriterion[] };
  allRows: RawRow[];
};

export interface SearchTermOptimizationRepository {
  getDashboard(accountId?: string): Promise<OptimizationDashboardPayload>;
}

export class ManualRunnerOutputRepository implements SearchTermOptimizationRepository {
  async getDashboard(accountId?: string): Promise<OptimizationDashboardPayload> {
    const raw = await readLatestManualRunnerOutput(accountId);
    const generatedAt = normalizeTimestamp(raw.generatedAt);
    const fresh = Date.now() - new Date(generatedAt).getTime() <= 48 * 60 * 60 * 1000;
    const automationEnabled = false;
    const criteria = raw.safetyCorpus?.keywordCriteria ?? [];
    const landingText = Object.values(raw.siteContexts)
      .map((context) => context.primaryPage?.text ?? "")
      .join(" ")
      .toLowerCase();
    const landingContextLoaded = landingText.length > 0;
    const googleContext = await getCachedGoogleSearchTermContext(raw).catch(() => new Map<string, GoogleSearchTermContext>());

    const results = raw.allRows.map((row, index) =>
      mapResult({ row, index, criteria, landingText, landingContextLoaded, fresh, automationEnabled, generatedAt, googleContext }),
    );

    return {
      account: {
        customerId: raw.customerId,
        customerName: raw.customerName,
        reportingPeriod: raw.dateRange,
        lastAnalysisAt: generatedAt,
        nextRunAt: null,
        automationEnabled,
      },
      source: {
        label: "Google Ads manual review runner",
        fresh,
        termsReviewed: raw.source.termsReviewed,
        mutatingGoogleAdsChanges: raw.source.mutatingGoogleAdsChanges,
      },
      summary: {
        totalReviewed: results.length,
        automaticallyExcluded: results.filter((row) => row.executionStatus === "published").length,
        addExactRecommendations: results.filter((row) => row.proposedAction === "add exact").length,
        needsReview: results.filter(
          (row) => row.proposedAction !== "no action" && row.executionStatus === "review-required",
        ).length,
        noAction: results.filter((row) => row.proposedAction === "no action").length,
        failedOrUnverified: results.filter(
          (row) => row.executionStatus === "failed" || row.verificationStatus === "failed",
        ).length,
      },
      results,
      history: results.filter((row) => row.verificationStatus === "verified"),
      googleRecommendations: [],
      googleRecommendationsWarning: null,
      changeSets: [],
    };
  }
}

export async function getGoogleRecommendationsForAccount(accountId?: string) {
  const raw = await readLatestManualRunnerOutput(accountId);
  return getCachedGoogleKeywordRecommendations(raw);
}

const recommendationCache = globalThis as typeof globalThis & {
  __googleKeywordRecommendationCache?: Map<
    string,
    { expiresAt: number; rows: GoogleKeywordRecommendation[]; warning: string | null }
  >;
};

async function getCachedGoogleKeywordRecommendations(raw: RawOutput) {
  recommendationCache.__googleKeywordRecommendationCache ??= new Map();
  const key = `search-terms:${raw.customerIdNormalized || raw.customerId.replace(/\D/g, "")}:${raw.dateRange.startDate}:${raw.dateRange.endDate}`;
  const cached = recommendationCache.__googleKeywordRecommendationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const value = await fetchGoogleKeywordRecommendations(raw).then(
    (rows) => ({ expiresAt: Date.now() + 10 * 60 * 1000, rows, warning: null }),
    (error: unknown) => ({
      expiresAt: Date.now() + 60 * 1000,
      rows: [],
      warning: error instanceof Error ? error.message : "Google recommendations could not be retrieved.",
    }),
  );
  recommendationCache.__googleKeywordRecommendationCache.set(key, value);
  return value;
}

async function fetchGoogleKeywordRecommendations(raw: RawOutput): Promise<GoogleKeywordRecommendation[]> {
  const credentials = getCredentials();
  if (!credentials.googleDeveloperToken) throw new Error("Google Ads developer token is unavailable.");
  const accessToken = await resolveRecommendationAccessToken(credentials);
  const customerId = raw.customerIdNormalized || raw.customerId.replace(/\D/g, "");
  const loginCustomerId = (raw.loginCustomerIdUsed || credentials.googleLoginCustomerId || "").replace(/\D/g, "");
  const response = await fetch(
    `https://googleads.googleapis.com/${credentials.googleAdsApiVersion}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": credentials.googleDeveloperToken,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `
          SELECT
            search_term_view.resource_name,
            search_term_view.search_term,
            search_term_view.status,
            segments.search_term_match_type,
            campaign.name,
            ad_group.name,
            metrics.cost_micros
          FROM search_term_view
          WHERE segments.date BETWEEN '${raw.dateRange.startDate}' AND '${raw.dateRange.endDate}'
            AND search_term_view.status = 'NONE'
          ORDER BY metrics.cost_micros DESC
        `,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Google search terms failed (${response.status}): ${(await response.text()).slice(0, 2_000)}`);
  }
  const batches = (await response.json()) as Array<{
    results?: Array<{
      searchTermView?: {
        resourceName?: string;
        searchTerm?: string;
        status?: string;
      };
      segments?: { searchTermMatchType?: string };
      campaign?: { name?: string };
      adGroup?: { name?: string };
    }>;
  }>;
  return batches.flatMap((batch) => batch.results ?? []).flatMap(({ searchTermView, segments, campaign, adGroup }) => {
    if (!searchTermView?.resourceName || !searchTermView.searchTerm?.trim()) return [];
    return [{
      resourceName: searchTermView.resourceName,
      searchTerm: searchTermView.searchTerm.trim(),
      matchType: segments?.searchTermMatchType ?? null,
      addedExcluded: searchTermView.status ?? "NONE",
      campaign: campaign?.name ?? "Unknown campaign",
      adGroup: adGroup?.name ?? "Unknown ad group",
    }];
  });
}

async function resolveRecommendationAccessToken(credentials: ReturnType<typeof getCredentials>) {
  if (credentials.googleRefreshToken && credentials.googleClientId && credentials.googleClientSecret) {
    const body = new URLSearchParams({
      client_id: credentials.googleClientId,
      client_secret: credentials.googleClientSecret,
      refresh_token: credentials.googleRefreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, cache: "no-store" });
    const payload = (await response.json()) as { access_token?: string; error_description?: string };
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google OAuth refresh failed.");
    return payload.access_token;
  }
  if (credentials.googleAccessToken) return credentials.googleAccessToken;
  throw new Error("Google Ads access credentials are unavailable.");
}

function mapResult(input: {
  row: RawRow;
  index: number;
  criteria: RawCriterion[];
  landingText: string;
  landingContextLoaded: boolean;
  fresh: boolean;
  automationEnabled: boolean;
  generatedAt: string;
  googleContext: Map<string, GoogleSearchTermContext>;
}): OptimizationResult {
  const { row, criteria, landingText } = input;
  const live = input.googleContext.get(searchTermIdentity(row.campaignName, row.adGroupName, row.searchTerm));
  const effectiveConversions = live?.conversions ?? row.conversions;
  const effectiveClicks = live?.clicks ?? row.clicks;
  const effectiveSpend = live?.spend ?? row.cost;
  const normalizedTerm = normalizeText(row.searchTerm);
  const positiveExactOverlap = criteria.some(
    (criterion) =>
      !criterion.negative &&
      criterion.matchType === "EXACT" &&
      normalizeText(criterion.text ?? "") === normalizedTerm,
  );
  const alreadyNegative = criteria.some(
    (criterion) => criterion.negative && normalizeText(criterion.text ?? "") === normalizedTerm,
  );
  const mismatchSeed = normalizeText(row.negativePhraseSeed ?? row.searchTerm);
  const landingIntentAbsent =
    input.landingContextLoaded && row.mismatchIsClear
      ? !landingText.includes(mismatchSeed)
      : row.mismatchIsClear
        ? null
        : false;
  const meaningIsAmbiguous = /\b(ambiguous|unclear|may|might|not explicit|unspecified)\b/i.test(row.reason);
  const requiresConfirmation = Boolean(row.specialReview?.trim());
  const score = calculateSafetyScore({
    mismatchIsClear: row.mismatchIsClear,
    mismatchCategory: row.mismatchCategory,
    conversions: effectiveConversions,
    noPositiveKeywordOverlap: !positiveExactOverlap,
    landingIntentAbsent,
    noQualifiedLeadSignal: null,
    hasPaidClicksOrSpend: effectiveClicks > 0 || effectiveSpend > 0,
    meaningIsAmbiguous,
    requiresConfirmation,
  });
  const wordCount = row.searchTerm.trim().split(/\s+/).filter(Boolean).length;
  const hardGateFailures = evaluateHardGates({
    automationEnabled: input.automationEnabled,
    proposedAction: row.proposedAction,
    conversions: effectiveConversions,
    landingContextLoaded: input.landingContextLoaded,
    googleAdsDataFresh: input.fresh,
    alreadyNegative,
    unresolvedPreviousDecision: false,
    validLength: row.searchTerm.length <= 80 && wordCount <= 10,
    exactMatchOnly: row.proposedAction === "negative exact",
    unknownRequiredSignals: ["qualified-lead signal"],
  });
  const executionEligibility = score.total >= 90 && hardGateFailures.length === 0;
  const actionNeedsReview = row.proposedAction !== "no action" && !executionEligibility;

  return {
    id: row.term_id ?? `${input.index}-${normalizedTerm}`,
    searchTermResourceName: live?.resourceName ?? null,
    searchTerm: row.searchTerm,
    campaignId: live?.campaignId ?? null,
    campaign: live?.campaignName ?? row.campaignName,
    adGroupId: live?.adGroupId ?? null,
    adGroup: live?.adGroupName ?? row.adGroupName,
    assetGroup: null,
    destinationUrl: row.destinationUrl,
    triggeringKeyword: live?.triggeringKeyword ?? null,
    matchType: live?.matchType ?? null,
    addedExcludedStatus: live?.addedExcludedStatus ?? (alreadyNegative ? "EXCLUDED" : null),
    impressions: live?.impressions ?? row.impressions,
    clicks: effectiveClicks,
    spend: effectiveSpend,
    conversions: effectiveConversions,
    qualifiedLeads: null,
    spamLeads: null,
    invalidLeads: null,
    clientComplaints: null,
    firstDetectedAt: null,
    lastReviewedAt: null,
    dataRetrievedAt: input.generatedAt,
    previousDecision: null,
    classification: row.mismatchIsClear ? row.mismatchCategory : row.relevance ?? "unclassified",
    mismatchCategory: row.mismatchCategory,
    proposedAction: row.proposedAction,
    explanation: row.reason,
    safetyScore: score.total,
    safetyBand: score.band,
    scoreBreakdown: score.breakdown,
    hardGateFailures,
    executionEligibility,
    executionStatus: executionEligibility ? "eligible" : actionNeedsReview ? "review-required" : "not-eligible",
    verificationStatus: "not-applicable",
  };
}

const searchTermContextCache = globalThis as typeof globalThis & {
  __searchTermContextCache?: Map<string, { expiresAt: number; rows: Map<string, GoogleSearchTermContext> }>;
};

async function getCachedGoogleSearchTermContext(raw: RawOutput) {
  searchTermContextCache.__searchTermContextCache ??= new Map();
  const customerId = raw.customerIdNormalized || raw.customerId.replace(/\D/g, "");
  const key = `${customerId}:${raw.dateRange.startDate}:${raw.dateRange.endDate}`;
  const cached = searchTermContextCache.__searchTermContextCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const rows = await fetchGoogleSearchTermContext(raw);
  searchTermContextCache.__searchTermContextCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, rows });
  return rows;
}

async function fetchGoogleSearchTermContext(raw: RawOutput) {
  const credentials = getCredentials();
  if (!credentials.googleDeveloperToken) throw new Error("Google Ads developer token is unavailable.");
  const accessToken = await resolveRecommendationAccessToken(credentials);
  const customerId = raw.customerIdNormalized || raw.customerId.replace(/\D/g, "");
  const loginCustomerId = (raw.loginCustomerIdUsed || credentials.googleLoginCustomerId || "").replace(/\D/g, "");
  const query = `
    SELECT search_term_view.resource_name, search_term_view.search_term, search_term_view.status,
      campaign.id, campaign.name, ad_group.id, ad_group.name,
      segments.search_term_match_type, segments.keyword.info.text,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${raw.dateRange.startDate}' AND '${raw.dateRange.endDate}'
  `;
  const response = await fetch(`https://googleads.googleapis.com/${credentials.googleAdsApiVersion}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": credentials.googleDeveloperToken,
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google search-term context failed (${response.status}).`);
  const batches = await response.json() as Array<{ results?: Array<{
    searchTermView?: { resourceName?: string; searchTerm?: string; status?: string };
    campaign?: { id?: string; name?: string };
    adGroup?: { id?: string; name?: string };
    segments?: { searchTermMatchType?: string; keyword?: { info?: { text?: string } } };
    metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number };
  }> }>;
  const rows = new Map<string, GoogleSearchTermContext>();
  for (const result of batches.flatMap((batch) => batch.results ?? [])) {
    const term = result.searchTermView?.searchTerm?.trim();
    const campaignName = result.campaign?.name ?? "Unknown campaign";
    const adGroupName = result.adGroup?.name ?? "Unknown ad group";
    if (!term) continue;
    const key = searchTermIdentity(campaignName, adGroupName, term);
    const existing = rows.get(key);
    const keyword = result.segments?.keyword?.info?.text ?? null;
    rows.set(key, {
      resourceName: result.searchTermView?.resourceName ?? null,
      campaignId: result.campaign?.id ?? null,
      campaignName,
      adGroupId: result.adGroup?.id ?? null,
      adGroupName,
      triggeringKeyword: existing?.triggeringKeyword && keyword && existing.triggeringKeyword !== keyword ? "Multiple keywords" : keyword ?? existing?.triggeringKeyword ?? null,
      matchType: result.segments?.searchTermMatchType ?? null,
      addedExcludedStatus: result.searchTermView?.status ?? null,
      impressions: (existing?.impressions ?? 0) + Number(result.metrics?.impressions ?? 0),
      clicks: (existing?.clicks ?? 0) + Number(result.metrics?.clicks ?? 0),
      spend: (existing?.spend ?? 0) + Number(result.metrics?.costMicros ?? 0) / 1_000_000,
      conversions: (existing?.conversions ?? 0) + Number(result.metrics?.conversions ?? 0),
    });
  }
  return rows;
}

function searchTermIdentity(campaign: string, adGroup: string, term: string) {
  return `${normalizeText(campaign)}\u0000${normalizeText(adGroup)}\u0000${normalizeText(term)}`;
}

async function readLatestManualRunnerOutput(accountId?: string): Promise<RawOutput> {
  const directory = path.join(process.cwd(), "tmp");
  const normalizedAccountId = accountId?.replace(/\D/g, "");
  const filenames = (await fs.readdir(directory))
    .filter((name) => name.startsWith("google_ads_search_term_review_agent_") && name.endsWith(".json"))
    .filter((name) => !normalizedAccountId || name.includes(normalizedAccountId))
    .sort()
    .reverse();

  if (!filenames[0]) {
    throw new Error(
      normalizedAccountId
        ? `No completed search-term analysis was found for account ${normalizedAccountId}.`
        : "No completed search-term analysis output was found.",
    );
  }

  return JSON.parse(await fs.readFile(path.join(directory, filenames[0]), "utf8")) as RawOutput;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTimestamp(value: string) {
  return /z$/i.test(value) || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}+08:00`;
}
