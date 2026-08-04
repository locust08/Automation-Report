import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normalizeGoogleAccountId, getCredentials } from "@/lib/reporting/env";
import { fetchGoogleHealthQuerySurfaces } from "@/lib/reporting/google";
import { isNotionIntegrationError, resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";
import type {
  GoogleAdsHealthCategory,
  GoogleAdsHealthFinding,
  GoogleAdsHealthResourceNode,
  GoogleAdsHealthSeverity,
  GoogleAdsHealthStage,
  GoogleAdsHealthStagePayload,
} from "@/lib/reporting/types";

type Row = Record<string, unknown>;
type HealthState = {
  accountId: string;
  accountName: string;
  currencyCode: string;
  googleAdsUrl: string;
  rowsByKey: Record<string, unknown[]>;
};

type QueryDefinition = { key: string; query: string | string[] };
type DestinationContext = {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  hierarchy: GoogleAdsHealthResourceNode[];
};
type DestinationTarget = {
  url: string;
  contexts: DestinationContext[];
};

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const DESTINATION_LIMIT = 100;
const DESTINATION_CONCURRENCY = 4;
const DESTINATION_TIMEOUT_MS = 15_000;
const DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 GoogleAdsHealthMonitor/1.0";
const ADSBOT_MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)";
const healthCache = new Map<string, { expiresAt: number; payload: GoogleAdsHealthStagePayload }>();

export class GoogleHealthScanError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "GoogleHealthScanError";
  }
}

export async function scanGoogleAdsHealthStage(input: {
  accountId: string;
  stage: GoogleAdsHealthStage;
  bypassCache?: boolean;
  scanId?: string;
  scanAt?: Date;
}): Promise<GoogleAdsHealthStagePayload> {
  const accountId = normalizeGoogleAccountId(input.accountId);
  if (!/^\d{10}$/.test(accountId)) {
    throw new GoogleHealthScanError("Enter a valid 10-digit Google Ads customer ID.", 400);
  }

  const scanAt = input.scanAt && !Number.isNaN(input.scanAt.getTime()) ? input.scanAt : new Date();
  const cacheKey = `${input.scanId || "shared"}:${input.stage}:${accountId}`;
  const cached = healthCache.get(cacheKey);
  if (!input.bypassCache && cached && cached.expiresAt > Date.now()) return cached.payload;

  const credentials = getCredentials();
  const apiVersion = resolveHealthApiVersion(credentials.googleAdsApiVersion);
  if (!credentials.googleDeveloperToken) {
    throw new GoogleHealthScanError("Missing GOOGLE_ADS_DEVELOPER_TOKEN.", 503);
  }
  if (
    !credentials.googleAccessToken &&
    !(credentials.googleRefreshToken && credentials.googleClientId && credentials.googleClientSecret)
  ) {
    throw new GoogleHealthScanError("Missing Google Ads OAuth credentials.", 503);
  }

  const route = await resolveHealthAccessPath(accountId, credentials);
  const queries = buildStageQueries(input.stage, scanAt);
  const queryResult = await fetchGoogleHealthQuerySurfaces({
    customerId: accountId,
    apiVersion,
    developerToken: credentials.googleDeveloperToken,
    accessToken: credentials.googleAccessToken,
    refreshToken: credentials.googleRefreshToken,
    clientId: credentials.googleClientId,
    clientSecret: credentials.googleClientSecret,
    loginCustomerId: route.loginCustomerId,
    accessPath: route.accessPath,
    fallbackLoginCustomerId: credentials.googleLoginCustomerId,
    queries,
  });

  const customer = record(record(queryResult.rowsByKey.customer?.[0]).customer);
  const accountName = text(customer.descriptiveName) || `Google Ads ${formatCustomerId(accountId)}`;
  const state: HealthState = {
    accountId,
    accountName,
    currencyCode: text(customer.currencyCode),
    googleAdsUrl: `https://ads.google.com/aw/overview?ocid=${accountId}`,
    rowsByKey: queryResult.rowsByKey,
  };
  let findings: GoogleAdsHealthFinding[] = [];
  const warnings = [...route.warnings];
  let queriesCompleted = queryResult.queriesCompleted;
  let truncated = false;

  if (input.stage === "core") findings = evaluateCoreStage(state);
  if (input.stage === "policy") findings = evaluatePolicyStage(state);
  if (input.stage === "delivery") {
    const geoIds = collectGeoTargetIds([
      ...(queryResult.rowsByKey.locationCriteria ?? []),
      ...(queryResult.rowsByKey.geographicDelivery ?? []),
    ]);
    if (geoIds.length) {
      const geoResult = await fetchGoogleHealthQuerySurfaces({
        customerId: accountId,
        apiVersion,
        developerToken: credentials.googleDeveloperToken,
        accessToken: credentials.googleAccessToken,
        refreshToken: credentials.googleRefreshToken,
        clientId: credentials.googleClientId,
        clientSecret: credentials.googleClientSecret,
        loginCustomerId: route.loginCustomerId,
        accessPath: route.accessPath,
        fallbackLoginCustomerId: credentials.googleLoginCustomerId,
        queries: [{ key: "geoTargets", query: buildGeoTargetQuery(geoIds) }],
      });
      state.rowsByKey.geoTargets = geoResult.rowsByKey.geoTargets ?? [];
      queriesCompleted += geoResult.queriesCompleted;
    }
    findings = evaluateDeliveryStage(state);
  }
  if (input.stage === "destination") {
    const targets = collectDestinationTargets(state);
    truncated = targets.length > DESTINATION_LIMIT;
    if (truncated) warnings.push(`Destination checks were limited to ${DESTINATION_LIMIT} unique URLs.`);
    findings = await evaluateDestinationTargets(targets.slice(0, DESTINATION_LIMIT), state);
  }

  const payload: GoogleAdsHealthStagePayload = {
    accountId,
    accountName,
    platform: "google",
    stage: input.stage,
    status: "completed",
    scannedAt: scanAt.toISOString(),
    queriesCompleted,
    truncated,
    warnings: dedupe(warnings),
    findings: dedupeFindings(findings),
  };
  healthCache.set(cacheKey, { expiresAt: Date.now() + HEALTH_CACHE_TTL_MS, payload });
  trimCache();
  return payload;
}

async function resolveHealthAccessPath(
  accountId: string,
  credentials: ReturnType<typeof getCredentials>
): Promise<{ loginCustomerId: string | null; accessPath: string | null; warnings: string[] }> {
  try {
    const context = await resolveGoogleAccountsFromNotion({
      googleAccountIds: [accountId],
      googleLookupTerms: [accountId],
      notionAccessToken: credentials.notionAccessToken,
      notionDatabaseId: credentials.notionDatabaseId,
      fallbackLoginCustomerId: credentials.googleLoginCustomerId,
    });
    return {
      loginCustomerId: context.loginCustomerIdByAccount[accountId] ?? credentials.googleLoginCustomerId,
      accessPath: context.accessPathByAccount[accountId] ?? null,
      warnings: context.messages,
    };
  } catch (error) {
    if (!isNotionIntegrationError(error)) throw error;
    return {
      loginCustomerId: credentials.googleLoginCustomerId,
      accessPath: null,
      warnings: ["Notion access-path lookup failed; the configured Google Ads manager fallback was used."],
    };
  }
}

function buildStageQueries(stage: GoogleAdsHealthStage, now: Date): QueryDefinition[] {
  if (stage === "core") {
    return [
      { key: "customer", query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1" },
      { key: "campaigns", query: [
        "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.start_date_time, campaign.end_date_time, campaign.advertising_channel_type FROM campaign WHERE campaign.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status FROM campaign WHERE campaign.status = 'ENABLED'",
      ] },
      { key: "adGroups", query: [
        "SELECT campaign.id, campaign.status, ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons FROM ad_group WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons FROM ad_group WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'",
        "SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status FROM ad_group WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'",
      ] },
    ];
  }
  if (stage === "policy") {
    return [
      { key: "customer", query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1" },
      { key: "assets", query: "SELECT asset.resource_name, asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls FROM asset" },
      { key: "ads", query: "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.primary_status_reasons, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'" },
      { key: "assetGroups", query: "SELECT campaign.id, campaign.status, asset_group.id, asset_group.name, asset_group.status, asset_group.primary_status, asset_group.primary_status_reasons, asset_group.final_urls, asset_group.final_mobile_urls FROM asset_group WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED'" },
      { key: "assetGroupAssets", query: [
        "SELECT campaign.id, campaign.status, asset_group.id, asset_group.status, asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls, asset_group_asset.field_type, asset_group_asset.status, asset_group_asset.primary_status, asset_group_asset.primary_status_reasons FROM asset_group_asset WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED' AND asset_group_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, asset_group.id, asset_group.name, asset.id, asset.name, asset.type, asset_group_asset.status, asset_group_asset.primary_status, asset_group_asset.primary_status_reasons FROM asset_group_asset WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED' AND asset_group_asset.status = 'ENABLED'",
      ] },
      { key: "campaignAssets", query: [
        "SELECT campaign.id, campaign.status, asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls, campaign_asset.field_type, campaign_asset.status, campaign_asset.primary_status, campaign_asset.primary_status_reasons FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, asset.id, asset.name, asset.type, campaign_asset.status, campaign_asset.primary_status, campaign_asset.primary_status_reasons FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, asset.id, asset.name, asset.type, campaign_asset.status, campaign_asset.primary_status FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, asset.id, asset.name, asset.type, campaign_asset.status FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
        "SELECT campaign_asset.campaign, campaign_asset.asset, campaign_asset.status FROM campaign_asset WHERE campaign_asset.status = 'ENABLED'",
      ] },
      { key: "adGroupAssets", query: [
        "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls, ad_group_asset.field_type, ad_group_asset.status, ad_group_asset.primary_status, ad_group_asset.primary_status_reasons FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, asset.id, asset.name, asset.type, ad_group_asset.status, ad_group_asset.primary_status, ad_group_asset.primary_status_reasons FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, asset.id, asset.name, asset.type, ad_group_asset.status, ad_group_asset.primary_status FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'",
        "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, asset.id, asset.name, asset.type, ad_group_asset.status FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'",
        "SELECT ad_group_asset.ad_group, ad_group_asset.asset, ad_group_asset.status FROM ad_group_asset WHERE ad_group_asset.status = 'ENABLED'",
      ] },
      { key: "customerAssets", query: [
        "SELECT asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls, customer_asset.field_type, customer_asset.status, customer_asset.primary_status, customer_asset.primary_status_reasons FROM customer_asset WHERE customer_asset.status = 'ENABLED'",
        "SELECT customer_asset.asset, customer_asset.status, customer_asset.primary_status, customer_asset.primary_status_reasons FROM customer_asset WHERE customer_asset.status = 'ENABLED'",
      ] },
      { key: "criteria", query: "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, ad_group_criterion.criterion_id, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.type, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons, ad_group_criterion.keyword.text, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls, ad_group_criterion.approval_status, ad_group_criterion.disapproval_reasons FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED'" },
    ];
  }
  if (stage === "delivery") {
    const window = deliveryWindow(now);
    return [
      { key: "customer", query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1" },
      { key: "campaigns", query: "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.experiment_type, campaign.campaign_budget, campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.status = 'ENABLED'" },
      { key: "campaignBudgets", query: "SELECT campaign_budget.resource_name, campaign_budget.id, campaign_budget.name, campaign_budget.status, campaign_budget.amount_micros, campaign_budget.total_amount_micros FROM campaign_budget" },
      { key: "experiments", query: "SELECT experiment.resource_name, experiment.name, experiment.status, experiment.start_date, experiment.end_date FROM experiment" },
      { key: "experimentArms", query: "SELECT experiment_arm.resource_name, experiment_arm.name, experiment_arm.control, experiment_arm.campaigns FROM experiment_arm" },
      { key: "schedules", query: "SELECT campaign.id, campaign.name, campaign_criterion.status, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute FROM campaign_criterion WHERE campaign.status = 'ENABLED' AND campaign_criterion.status = 'ENABLED' AND campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.negative = FALSE" },
      { key: "locationCriteria", query: "SELECT campaign.id, campaign.name, campaign_criterion.criterion_id, campaign_criterion.negative, campaign_criterion.type, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.address.country_code FROM campaign_criterion WHERE campaign.status = 'ENABLED' AND campaign_criterion.status = 'ENABLED' AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'LOCATION_GROUP')" },
      { key: "geographicDelivery", query: [
        `SELECT campaign.id, campaign.name, user_location_view.country_criterion_id, user_location_view.targeting_location, metrics.impressions, metrics.cost_micros FROM user_location_view WHERE campaign.status = 'ENABLED' AND segments.date = '${window.endDate}' AND metrics.impressions > 0`,
        `SELECT campaign.id, campaign.name, user_location_view.country_criterion_id, user_location_view.targeting_location, metrics.impressions, metrics.cost_micros FROM user_location_view WHERE segments.date = '${window.endDate}'`,
        `SELECT campaign.id, campaign.name, user_location_view.resource_name, metrics.impressions, metrics.cost_micros FROM user_location_view WHERE segments.date = '${window.endDate}'`,
      ] },
      { key: "delivery", query: `SELECT campaign.id, campaign.name, segments.date, segments.hour, metrics.impressions, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date BETWEEN '${window.startDate}' AND '${window.endDate}' AND segments.hour <= ${window.throughHour}` },
    ];
  }
  return [
    { key: "customer", query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1" },
    { key: "assets", query: "SELECT asset.resource_name, asset.id, asset.name, asset.type, asset.final_urls, asset.final_mobile_urls FROM asset" },
    { key: "ads", query: "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ad_group_ad.status FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'" },
    { key: "assetGroups", query: "SELECT campaign.id, campaign.status, asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls, asset_group.final_mobile_urls FROM asset_group WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED'" },
    { key: "linkedAssets", query: [
      "SELECT campaign.id, campaign.status, asset.id, asset.name, asset.final_urls, asset.final_mobile_urls, campaign_asset.status FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
      "SELECT campaign.id, campaign.name, asset.id, asset.name, asset.final_urls, asset.final_mobile_urls FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
      "SELECT campaign.id, campaign.name, asset.id, asset.name, asset.final_urls FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.status = 'ENABLED'",
      "SELECT campaign_asset.campaign, campaign_asset.asset, campaign_asset.status FROM campaign_asset WHERE campaign_asset.status = 'ENABLED'",
    ] },
    { key: "assetGroupAssets", query: [
      "SELECT campaign.id, campaign.status, asset_group.id, asset_group.status, asset.id, asset.name, asset.final_urls, asset.final_mobile_urls, asset_group_asset.status FROM asset_group_asset WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED' AND asset_group_asset.status = 'ENABLED'",
      "SELECT asset_group_asset.asset, asset_group_asset.asset_group, asset_group_asset.status FROM asset_group_asset WHERE asset_group_asset.status = 'ENABLED'",
    ] },
    { key: "adGroupAssets", query: [
      "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, asset.id, asset.name, asset.final_urls, asset.final_mobile_urls, ad_group_asset.status FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'",
      "SELECT ad_group_asset.ad_group, ad_group_asset.asset, ad_group_asset.status FROM ad_group_asset WHERE ad_group_asset.status = 'ENABLED'",
    ] },
    { key: "criteria", query: "SELECT campaign.id, campaign.status, ad_group.id, ad_group.status, ad_group_criterion.criterion_id, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED'" },
    { key: "landingPages", query: [
      "SELECT campaign.id, campaign.status, ad_group.id, expanded_landing_page_view.resource_name, expanded_landing_page_view.expanded_final_url, metrics.clicks, segments.date FROM expanded_landing_page_view WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS AND metrics.clicks > 0",
      "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, expanded_landing_page_view.resource_name, expanded_landing_page_view.expanded_final_url FROM expanded_landing_page_view WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS AND metrics.clicks > 0",
      "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, expanded_landing_page_view.resource_name, expanded_landing_page_view.expanded_final_url FROM expanded_landing_page_view WHERE segments.date DURING LAST_30_DAYS",
      "SELECT expanded_landing_page_view.resource_name, expanded_landing_page_view.expanded_final_url FROM expanded_landing_page_view WHERE segments.date DURING LAST_30_DAYS",
    ] },
  ];
}

export function evaluateEntityHealth(input: {
  resourceType: string;
  enabled: boolean;
  primaryStatus?: string;
  policyStatus?: string;
}): { code: string; severity: GoogleAdsHealthSeverity } | null {
  if (!input.enabled) return null;
  const primary = upper(input.primaryStatus);
  const policy = upper(input.policyStatus);
  if (input.resourceType === "asset_group" && (primary === "NOT_ELIGIBLE" || policy === "DISAPPROVED")) return { code: "ASSET_GROUP_NOT_ELIGIBLE", severity: "critical" };
  if (input.resourceType === "ad" && policy === "DISAPPROVED") return { code: "AD_DISAPPROVED", severity: "high" };
  if (input.resourceType === "criterion" && policy === "DISAPPROVED") return { code: "CRITERION_DISAPPROVED", severity: "high" };
  if (input.resourceType === "asset" && (policy === "DISAPPROVED" || policy === "LIMITED" || primary === "LIMITED")) return { code: "ASSET_DISAPPROVED", severity: "warning" };
  if (input.resourceType === "ad" && (policy === "LIMITED" || primary === "LIMITED")) return { code: "AD_POLICY_LIMITED", severity: "warning" };
  if (primary !== "NOT_ELIGIBLE") return null;
  if (input.resourceType === "campaign") return { code: "CAMPAIGN_NOT_ELIGIBLE", severity: "high" };
  if (input.resourceType === "ad_group") return { code: "AD_GROUP_NOT_ELIGIBLE", severity: "high" };
  return null;
}

function evaluateCoreStage(state: HealthState): GoogleAdsHealthFinding[] {
  const findings: GoogleAdsHealthFinding[] = [];
  const customer = record(record(state.rowsByKey.customer?.[0]).customer);
  if (upper(customer.status) !== "ENABLED") {
    findings.push(finding(state, { code: "ACCOUNT_NOT_ENABLED", severity: "critical", category: "account", summary: "Google Ads account is not enabled", details: `Customer status is ${text(customer.status) || "unknown"}.`, resourceType: "account", resourceId: state.accountId, resourceName: state.accountName, hierarchy: [] }));
  }
  for (const raw of state.rowsByKey.campaigns ?? []) {
    const row = record(raw); const campaign = record(row.campaign); const id = text(campaign.id);
    const health = evaluateEntityHealth({ resourceType: "campaign", enabled: upper(campaign.status) === "ENABLED", primaryStatus: text(campaign.primaryStatus) });
    if (health) findings.push(entityFinding(state, campaign, "campaign", id, health, [node("campaign", id, text(campaign.name))]));
  }
  for (const raw of state.rowsByKey.adGroups ?? []) {
    const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const id = text(adGroup.id);
    const hierarchy = [node("campaign", text(campaign.id), text(campaign.name)), node("ad_group", id, text(adGroup.name))];
    const health = evaluateEntityHealth({ resourceType: "ad_group", enabled: upper(adGroup.status) === "ENABLED", primaryStatus: text(adGroup.primaryStatus) });
    if (health) findings.push(entityFinding(state, adGroup, "ad_group", id, health, hierarchy));
  }
  return findings;
}

function evaluatePolicyStage(state: HealthState): GoogleAdsHealthFinding[] {
  const findings: GoogleAdsHealthFinding[] = [];
  const assets = buildAssetLookup(state.rowsByKey.assets ?? []);
  const creativeStats = new Map<string, { campaign: Row; adGroup: Row; enabled: number; eligible: number }>();
  for (const raw of state.rowsByKey.ads ?? []) {
    const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const link = record(row.adGroupAd); const ad = record(link.ad);
    const approval = text(record(link.policySummary).approvalStatus); const id = text(ad.id); const adGroupId = text(adGroup.id);
    const stats = creativeStats.get(adGroupId) ?? { campaign, adGroup, enabled: 0, eligible: 0 };
    stats.enabled += 1; if (["ELIGIBLE", "LIMITED"].includes(upper(link.primaryStatus)) && upper(approval) !== "DISAPPROVED") stats.eligible += 1;
    creativeStats.set(adGroupId, stats);
    const hierarchy = hierarchyFor(campaign, adGroup, node("ad", id, text(ad.name)));
    const health = evaluateEntityHealth({ resourceType: "ad", enabled: true, primaryStatus: text(link.primaryStatus), policyStatus: approval });
    if (health) findings.push(entityFinding(state, ad, "ad", id, health, hierarchy, approval ? `Approval status is ${approval}.` : undefined));
    const review = upper(record(link.policySummary).reviewStatus);
    if (review === "REVIEW_IN_PROGRESS" || reasons(link).some((reason) => reason.includes("UNDER_REVIEW"))) findings.push(finding(state, { code: "REVIEW_STALE", severity: "warning", category: "policy", summary: "Ad remains under policy review", details: `Review status is ${review || "under review"}.`, resourceType: "ad", resourceId: id, resourceName: text(ad.name) || id, hierarchy }));
  }
  for (const [adGroupId, stats] of creativeStats) {
    if (stats.enabled === 0 || stats.eligible > 0) continue;
    const leaf = findings.find((item) => item.resourceType === "ad" && item.code === "AD_DISAPPROVED" && item.resourceHierarchy.some((node) => node.resourceType === "ad_group" && node.resourceId === adGroupId));
    if (leaf) {
      leaf.severity = "critical";
      leaf.summary = "Active ad group has no eligible creative";
      leaf.details = `${stats.enabled} enabled creative(s) are present and none are eligible to serve. ${leaf.details}`;
    } else {
      findings.push(finding(state, { code: "AD_GROUP_NOT_ELIGIBLE", severity: "critical", category: "policy", summary: "Active ad group has no eligible creative", details: `${stats.enabled} enabled creative(s) are present and none are eligible to serve.`, resourceType: "ad_group", resourceId: adGroupId, resourceName: text(stats.adGroup.name) || adGroupId, hierarchy: hierarchyFor(stats.campaign, stats.adGroup) }));
    }
  }
  for (const raw of state.rowsByKey.assetGroups ?? []) {
    const row = record(raw); const campaign = record(row.campaign); const assetGroup = record(row.assetGroup); const id = text(assetGroup.id);
    const health = evaluateEntityHealth({ resourceType: "asset_group", enabled: true, primaryStatus: text(assetGroup.primaryStatus), policyStatus: reasons(assetGroup).some((item) => item.includes("DISAPPROVED")) ? "DISAPPROVED" : "" });
    if (health) findings.push(entityFinding(state, assetGroup, "asset_group", id, health, [node("campaign", text(campaign.id), text(campaign.name)), node("asset_group", id, text(assetGroup.name))]));
  }
  for (const key of ["assetGroupAssets", "campaignAssets", "adGroupAssets"] as const) {
    for (const raw of state.rowsByKey[key] ?? []) {
      const row = record(raw); const link = record(row.assetGroupAsset ?? row.campaignAsset ?? row.adGroupAsset); const campaign = withResourceId(record(row.campaign), link.campaign); const adGroup = withResourceId(record(row.adGroup), link.adGroup); const assetGroup = record(row.assetGroup); const asset = resolveLinkedAsset(record(row.asset), link.asset, assets); const id = text(asset.id) || resourceId(link.asset);
      const hierarchy = hierarchyFor(campaign, adGroup, key === "assetGroupAssets" ? node("asset_group", text(assetGroup.id), text(assetGroup.name)) : undefined).concat(node("asset", id, text(asset.name)));
      const enabled = upper(campaign.status) === "ENABLED" &&
        (key !== "adGroupAssets" || upper(adGroup.status) === "ENABLED") &&
        (key !== "assetGroupAssets" || upper(assetGroup.status) === "ENABLED") &&
        upper(link.status) === "ENABLED";
      const health = evaluateEntityHealth({ resourceType: "asset", enabled, primaryStatus: text(link.primaryStatus), policyStatus: reasons(link).some((item) => item.includes("DISAPPROVED")) ? "DISAPPROVED" : text(link.primaryStatus) });
      if (health) findings.push(entityFinding(state, asset, "asset", id, health, hierarchy));
    }
  }
  let positive = 0; let restricted = 0;
  for (const raw of state.rowsByKey.criteria ?? []) {
    const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const criterion = record(row.adGroupCriterion); if (Boolean(criterion.negative)) continue;
    positive += 1; const statusReasons = reasons(criterion); if (statusReasons.some((item) => item.includes("RESTRICTED"))) restricted += 1;
    const id = text(criterion.criterionId); const name = text(record(criterion.keyword).text) || id; const hierarchy = hierarchyFor(campaign, adGroup, node("criterion", id, name));
    const disapproved = upper(criterion.approvalStatus) === "DISAPPROVED" || statusReasons.some((item) => item.includes("DISAPPROVED"));
    const health = evaluateEntityHealth({ resourceType: "criterion", enabled: true, primaryStatus: text(criterion.primaryStatus), policyStatus: disapproved ? "DISAPPROVED" : "" });
    if (health) findings.push(entityFinding(state, { ...criterion, name }, "criterion", id, health, hierarchy));
  }
  if (positive > 0 && restricted / positive >= 0.25) findings.push(finding(state, { code: "CRITERIA_RESTRICTED_RATIO", severity: "warning", category: "policy", summary: "A material share of active criteria is restricted", details: `${restricted}/${positive} (${Math.round(restricted / positive * 100)}%) active positive criteria are restricted.`, resourceType: "account", resourceId: state.accountId, resourceName: state.accountName, hierarchy: [] }));
  return findings;
}

function evaluateDeliveryStage(state: HealthState): GoogleAdsHealthFinding[] {
  const findings: GoogleAdsHealthFinding[] = [];
  const campaigns = new Map<string, Row>();
  for (const raw of state.rowsByKey.campaigns ?? []) { const campaign = record(record(raw).campaign); campaigns.set(text(campaign.id), campaign); }

  const scheduleRows = (state.rowsByKey.schedules ?? []).map(record);
  const window = deliveryWindow(new Date());
  const delivery = groupByCampaign(state.rowsByKey.delivery ?? []);
  for (const [campaignId, rows] of delivery) {
    if (!campaignHasElapsedSchedule(campaignId, scheduleRows, window.endDate, window.throughHour)) continue;
    const current = rows.filter((row) => text(record(row.segments).date) === window.endDate).reduce<{ impressions: number; costMicros: number }>((sum, row) => ({
      impressions: sum.impressions + number(record(row.metrics).impressions),
      costMicros: sum.costMicros + number(record(row.metrics).costMicros),
    }), { impressions: 0, costMicros: 0 });
    const byDate = new Map<string, { impressions: number; costMicros: number }>();
    for (const row of rows) {
      const date = text(record(row.segments).date);
      if (!date || date === window.endDate || !sameWeekday(date, window.endDate)) continue;
      const value = byDate.get(date) ?? { impressions: 0, costMicros: 0 };
      value.impressions += number(record(row.metrics).impressions);
      value.costMicros += number(record(row.metrics).costMicros);
      byDate.set(date, value);
    }
    const history = [...byDate.values()];
    const anomaly = evaluateDeliveryAnomaly({
      currentImpressions: current.impressions,
      currentCostMicros: current.costMicros,
      historicalImpressions: history.map((item) => item.impressions),
      historicalCostMicros: history.map((item) => item.costMicros),
    });
    if (!anomaly) continue;
    const campaign = campaigns.get(campaignId) ?? record(rows[0]?.campaign); const hierarchy = [node("campaign", campaignId, text(campaign.name))];
    findings.push(finding(state, { code: anomaly.code, severity: "high", category: "delivery", summary: anomaly.code === "DELIVERY_ZERO" ? "Campaign delivery is zero" : "Campaign delivery dropped severely", details: `Current delivery is ${Math.round(anomaly.ratio * 100)}% of the four-week equivalent-day median.`, resourceType: "campaign", resourceId: campaignId, resourceName: text(campaign.name) || campaignId, hierarchy }));
  }
  const geoTargets = new Map<string, Row>();
  for (const raw of state.rowsByKey.geoTargets ?? []) { const target = record(record(raw).geoTargetConstant); geoTargets.set(text(target.resourceName).split("/").at(-1) ?? "", target); }
  const locationRows = (state.rowsByKey.locationCriteria ?? []).map(record);
  for (const [campaignId, campaign] of campaigns) {
    const setting = upper(record(campaign.geoTargetTypeSetting).positiveGeoTargetType);
    if (!setting) continue;
    const positive = locationRows.filter((row) => text(record(row.campaign).id) === campaignId && !Boolean(record(row.campaignCriterion).negative));
    const unsafe: string[] = [];
    const unverifiable: string[] = [];
    if (setting !== "PRESENCE") unsafe.push(`advanced location option is ${setting}, not PRESENCE`);
    if (!positive.length) unsafe.push("no positive location target is configured, so delivery can be worldwide");
    for (const row of positive) {
      const criterion = record(row.campaignCriterion);
      const type = upper(criterion.type);
      if (type === "LOCATION") {
        const resourceName = text(record(criterion.location).geoTargetConstant);
        const id = resourceId(resourceName);
        const target = geoTargets.get(id);
        const country = upper(target?.countryCode);
        const description = text(target?.name) || resourceName || `criterion ${text(criterion.criterionId)}`;
        if (!country) unverifiable.push(description);
        else if (country !== "MY") unsafe.push(`${description} (${country})`);
      } else if (type === "PROXIMITY") {
        const proximity = record(criterion.proximity);
        const address = record(proximity.address);
        const country = upper(address.countryCode);
        const description = [text(address.cityName), country, proximity.radius ? `${text(proximity.radius)} ${text(proximity.radiusUnits).toLowerCase()}` : ""].filter(Boolean).join(", ") || `proximity criterion ${text(criterion.criterionId)}`;
        if (!country) unverifiable.push(description);
        else if (country !== "MY") unsafe.push(description);
      } else {
        unverifiable.push(`${type || "location group"} criterion ${text(criterion.criterionId)}`);
      }
    }
    const hierarchy = [node("campaign", campaignId, text(campaign.name))];
    if (unsafe.length) findings.push(finding(state, { code: "LOCATION_TARGETING_OUTSIDE_MALAYSIA", severity: "high", category: "location", summary: "Campaign targeting can reach people outside Malaysia", details: `Unsafe targeting: ${unsafe.join("; ")}.`, resourceType: "campaign", resourceId: campaignId, resourceName: text(campaign.name) || campaignId, hierarchy }));
    else if (unverifiable.length) findings.push(finding(state, { code: "LOCATION_TARGETING_UNVERIFIED", severity: "warning", category: "location", summary: "Campaign location targeting could not be verified as Malaysia-only", details: `Unverified targeting: ${unverifiable.join("; ")}.`, resourceType: "campaign", resourceId: campaignId, resourceName: text(campaign.name) || campaignId, hierarchy }));
  }
  const outsideByCampaign = groupByCampaign(state.rowsByKey.geographicDelivery ?? []);
  for (const [campaignId, rows] of outsideByCampaign) {
    const outside = rows.filter((row) => {
      const geographic = parseGeographicDelivery(row);
      const country = upper(geoTargets.get(geographic.countryCriterionId)?.countryCode);
      return geographic.locationType === "LOCATION_OF_PRESENCE" && Boolean(country) && country !== "MY";
    });
    if (!outside.length) continue;
    const campaign = campaigns.get(campaignId) ?? record(outside[0]?.campaign);
    const countries = new Map<string, { name: string; impressions: number; costMicros: number }>();
    for (const row of outside) {
      const geographic = parseGeographicDelivery(row);
      const target = geoTargets.get(geographic.countryCriterionId);
      const current = countries.get(geographic.countryCriterionId) ?? { name: text(target?.name) || `country criterion ${geographic.countryCriterionId}`, impressions: 0, costMicros: 0 };
      current.impressions += number(record(row.metrics).impressions);
      current.costMicros += number(record(row.metrics).costMicros);
      countries.set(geographic.countryCriterionId, current);
    }
    const evidence = [...countries.values()].map((country) => `${country.name}: ${country.impressions} impression(s), ${(country.costMicros / 1_000_000).toFixed(2)} ${state.currencyCode || "account currency"}`).join("; ");
    findings.push(finding(state, { code: "DELIVERY_OUTSIDE_MALAYSIA", severity: "critical", category: "location", summary: "Campaign delivered to users physically outside Malaysia", details: evidence, resourceType: "campaign", resourceId: campaignId, resourceName: text(campaign.name) || campaignId, hierarchy: [node("campaign", campaignId, text(campaign.name))] }));
  }
  return findings;
}

export function evaluateDeliveryAnomaly(input: {
  currentImpressions: number;
  currentCostMicros: number;
  historicalImpressions: number[];
  historicalCostMicros: number[];
}): { code: "DELIVERY_ZERO" | "DELIVERY_SEVERE_DROP"; ratio: number } | null {
  if (input.historicalImpressions.length < 3 || input.historicalCostMicros.length < 3) return null;
  const baselineImpressions = median(input.historicalImpressions);
  const baselineCostMicros = median(input.historicalCostMicros);
  if (baselineImpressions < 100 && baselineCostMicros < 20_000_000) return null;
  const ratios: number[] = [];
  if (baselineImpressions > 0) ratios.push(input.currentImpressions / baselineImpressions);
  if (baselineCostMicros > 0) ratios.push(input.currentCostMicros / baselineCostMicros);
  const ratio = ratios.length ? Math.max(...ratios) : 1;
  if (ratio >= 0.2) return null;
  const zero = input.currentImpressions === 0 && input.currentCostMicros === 0;
  return { code: zero ? "DELIVERY_ZERO" : "DELIVERY_SEVERE_DROP", ratio };
}

function collectDestinationTargets(state: HealthState): DestinationTarget[] {
  const targets = new Map<string, DestinationTarget>();
  const assets = buildAssetLookup(state.rowsByKey.assets ?? []);
  const add = (values: unknown, resourceType: string, resourceId: string, resourceName: string, hierarchy: GoogleAdsHealthResourceNode[]) => {
    for (const value of stringArray(values)) {
      const url = normalizeDestinationUrl(value);
      if (!url) continue;
      const context = { resourceType, resourceId, resourceName, hierarchy };
      const target = targets.get(url);
      if (target) {
        const contextKey = `${resourceType}:${resourceId}`;
        if (!target.contexts.some((item) => `${item.resourceType}:${item.resourceId}` === contextKey)) {
          target.contexts.push(context);
        }
      } else {
        targets.set(url, { url, contexts: [context] });
      }
    }
  };
  for (const raw of state.rowsByKey.ads ?? []) { const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const ad = record(record(row.adGroupAd).ad); const id = text(ad.id); const h = hierarchyFor(campaign, adGroup, node("ad", id, text(ad.name))); add(ad.finalUrls, "ad", id, text(ad.name) || id, h); add(ad.finalMobileUrls, "ad", id, text(ad.name) || id, h); }
  for (const raw of state.rowsByKey.assetGroups ?? []) { const row = record(raw); const campaign = record(row.campaign); const item = record(row.assetGroup); const id = text(item.id); const h = [node("campaign", text(campaign.id), text(campaign.name)), node("asset_group", id, text(item.name))]; add(item.finalUrls, "asset_group", id, text(item.name) || id, h); add(item.finalMobileUrls, "asset_group", id, text(item.name) || id, h); }
  for (const key of ["linkedAssets", "assetGroupAssets", "adGroupAssets"] as const) {
    for (const raw of state.rowsByKey[key] ?? []) {
      const row = record(raw);
      const link = record(row.campaignAsset ?? row.assetGroupAsset ?? row.adGroupAsset);
      const campaign = withResourceId(record(row.campaign), link.campaign);
      const adGroup = withResourceId(record(row.adGroup), link.adGroup);
      const assetGroup = withResourceId(record(row.assetGroup), link.assetGroup);
      const item = resolveLinkedAsset(record(row.asset), link.asset, assets);
      const id = text(item.id) || resourceId(link.asset);
      const parents = key === "assetGroupAssets"
        ? [node("campaign", text(campaign.id), text(campaign.name)), node("asset_group", text(assetGroup.id), text(assetGroup.name))]
        : key === "adGroupAssets"
          ? hierarchyFor(campaign, adGroup)
          : [node("campaign", text(campaign.id), text(campaign.name))];
      const hierarchy = [...parents, node("asset", id, text(item.name))].filter((value) => value.resourceId);
      add(item.finalUrls, "asset", id, text(item.name) || id, hierarchy);
      add(item.finalMobileUrls, "asset", id, text(item.name) || id, hierarchy);
    }
  }
  for (const raw of state.rowsByKey.criteria ?? []) { const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const item = record(row.adGroupCriterion); const id = text(item.criterionId); const name = text(record(item.keyword).text) || id; const h = hierarchyFor(campaign, adGroup, node("criterion", id, name)); add(item.finalUrls, "criterion", id, name, h); add(item.finalMobileUrls, "criterion", id, name, h); }
  for (const raw of state.rowsByKey.landingPages ?? []) { const row = record(raw); const campaign = record(row.campaign); const adGroup = record(row.adGroup); const item = record(row.expandedLandingPageView); const url = text(item.expandedFinalUrl); const id = text(item.resourceName) || url; add([url], "expanded_landing_page", id, url || id, hierarchyFor(campaign, adGroup, node("expanded_landing_page", id, url))); }
  return [...targets.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function evaluateDestinationTargets(targets: DestinationTarget[], state: HealthState): Promise<GoogleAdsHealthFinding[]> {
  const results = await mapWithConcurrency(targets, DESTINATION_CONCURRENCY, async (target) => ({
    target,
    desktop: await probeDestinationWithRetry(target.url, "desktop"),
    mobile: await probeDestinationWithRetry(target.url, "adsbot"),
  }));
  const findings: GoogleAdsHealthFinding[] = [];
  for (const result of results) {
    const bothFailed = !result.desktop.ok && !result.mobile.ok;
    const oneFailed = result.desktop.ok !== result.mobile.ok;
    const crossDomain = isCrossDomainDestination(result.target.url, result.desktop.finalUrl) ||
      isCrossDomainDestination(result.target.url, result.mobile.finalUrl);
    if (!bothFailed && !oneFailed && !crossDomain) continue;
    for (const context of result.target.contexts) {
      if (bothFailed || oneFailed) {
        findings.push(finding(state, {
          code: "DESTINATION_UNREACHABLE",
          severity: bothFailed ? "critical" : "warning",
          category: "destination",
          summary: bothFailed ? "Landing page is unreachable" : "Landing page fails for one probe profile",
          details: `Desktop: ${destinationResultLabel(result.desktop)}; AdsBot mobile: ${destinationResultLabel(result.mobile)}.`,
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          resourceName: context.resourceName,
          hierarchy: context.hierarchy,
          destinationUrl: [result.desktop.error, result.mobile.error].includes("unsafe_destination") ? undefined : result.target.url,
        }));
      }
      if (crossDomain) {
        findings.push(finding(state, {
          code: "DESTINATION_REDIRECT_RISK",
          severity: "warning",
          category: "destination",
          summary: "Landing page redirects across domains",
          details: `Final destination: ${result.desktop.finalUrl ?? result.mobile.finalUrl ?? "unknown"}.`,
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          resourceName: context.resourceName,
          hierarchy: context.hierarchy,
          destinationUrl: result.target.url,
        }));
      }
    }
  }
  return findings;
}

export function isCrossDomainDestination(initialUrl: string, finalUrl: string | null): boolean {
  if (!finalUrl) return false;
  try {
    return normalizeHostname(new URL(initialUrl).hostname) !== normalizeHostname(new URL(finalUrl).hostname);
  } catch {
    return false;
  }
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export async function probeDestination(url: string, mode: "desktop" | "adsbot"): Promise<{ ok: boolean; status: number | null; finalUrl: string | null; error: string | null }> {
  let current = normalizeDestinationUrl(url); if (!current) return { ok: false, status: null, finalUrl: null, error: "invalid_url" };
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    try { await assertPublicUrl(current); } catch { return { ok: false, status: null, finalUrl: current, error: "unsafe_destination" }; }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), DESTINATION_TIMEOUT_MS);
    try {
      const response: Response = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "user-agent": mode === "adsbot" ? ADSBOT_MOBILE_USER_AGENT : DESKTOP_USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" }, cache: "no-store" });
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) { const location: string | null = response.headers.get("location"); if (!location || redirect === 5) return { ok: false, status: response.status, finalUrl: current, error: "redirect_failure" }; current = new URL(location, current).toString(); continue; }
      return { ok: response.status >= 200 && response.status < 400, status: response.status, finalUrl: current, error: response.ok ? null : `http_${response.status}` };
    } catch (error) { return { ok: false, status: null, finalUrl: current, error: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error" }; }
    finally { clearTimeout(timeout); }
  }
  return { ok: false, status: null, finalUrl: current, error: "redirect_failure" };
}

async function probeDestinationWithRetry(url: string, mode: "desktop" | "adsbot") {
  let result = await probeDestination(url, mode);
  if (result.status === 429 || result.status === 503 || result.error === "timeout" || result.error === "network_error") {
    result = await probeDestination(url, mode);
  }
  return result;
}

async function assertPublicUrl(value: string): Promise<void> {
  const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("unsafe");
  const hostname = url.hostname.toLowerCase(); if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("unsafe");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true }); if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("unsafe");
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  const parts = normalized.split(".").map(Number); if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || parts[0] >= 224;
}

function finding(state: HealthState, input: { code: string; severity: GoogleAdsHealthSeverity; category: GoogleAdsHealthCategory; summary: string; details: string; resourceType: string; resourceId: string; resourceName: string; hierarchy: GoogleAdsHealthResourceNode[]; destinationUrl?: string }): GoogleAdsHealthFinding {
  return { id: [state.accountId, input.resourceType, input.resourceId, input.code, input.destinationUrl ?? ""].join("|"), code: input.code, severity: input.severity, category: input.category, summary: input.summary, details: input.details, resourceType: input.resourceType, resourceId: input.resourceId, resourceName: input.resourceName, resourceHierarchy: input.hierarchy, googleAdsUrl: state.googleAdsUrl, notionUrl: null, destinationUrl: input.destinationUrl ?? null };
}

function entityFinding(state: HealthState, resource: Row, resourceType: string, resourceId: string, health: { code: string; severity: GoogleAdsHealthSeverity }, hierarchy: GoogleAdsHealthResourceNode[], details?: string): GoogleAdsHealthFinding {
  return finding(state, { code: health.code, severity: health.severity, category: health.code.startsWith("ACCOUNT_") ? "account" : "policy", summary: `${formatLabel(resourceType)} is ${health.code.toLowerCase().replaceAll("_", " ")}`, details: details ?? `Primary status is ${text(resource.primaryStatus) || "unknown"}.`, resourceType, resourceId, resourceName: text(resource.name) || resourceId, hierarchy });
}

function collectGeoTargetIds(rows: unknown[]): string[] { return dedupe(rows.map((raw) => { const row = record(raw); const criterionId = parseGeographicDelivery(row).countryCriterionId; if (criterionId) return criterionId; const criterion = record(row.campaignCriterion); return text(record(criterion.location).geoTargetConstant).split("/").at(-1) ?? ""; }).filter(Boolean)); }
function resolveHealthApiVersion(configured: string): string { const match = configured.match(/^v(\d+)$/i); const version = match ? Number(match[1]) : 0; return version >= 24 ? `v${version}` : "v24"; }
function parseGeographicDelivery(row: Row): { countryCriterionId: string; locationType: string } { const userLocation = record(row.userLocationView); if (text(userLocation.countryCriterionId)) return { countryCriterionId: text(userLocation.countryCriterionId), locationType: "LOCATION_OF_PRESENCE" }; const userPair = text(userLocation.resourceName).split("/").at(-1) ?? ""; if (userPair) return { countryCriterionId: userPair.split("~")[0] ?? "", locationType: "LOCATION_OF_PRESENCE" }; return parseGeographicView(record(row.geographicView)); }
function parseGeographicView(value: Row): { countryCriterionId: string; locationType: string } { const explicitId = text(value.countryCriterionId); const explicitType = upper(value.locationType); if (explicitId || explicitType) return { countryCriterionId: explicitId, locationType: explicitType }; const pair = text(value.resourceName).split("/").at(-1) ?? ""; const [countryCriterionId = "", locationType = ""] = pair.split("~"); return { countryCriterionId, locationType: upper(locationType) }; }
function buildAssetLookup(rows: unknown[]): Map<string, Row> { const assets = new Map<string, Row>(); for (const raw of rows) { const asset = record(record(raw).asset); const name = text(asset.resourceName); const id = text(asset.id); if (name) assets.set(name, asset); if (id) assets.set(id, asset); } return assets; }
function resolveLinkedAsset(value: Row, resourceName: unknown, assets: Map<string, Row>): Row { if (text(value.id) || text(value.resourceName)) return value; const name = text(resourceName); return assets.get(name) ?? assets.get(resourceId(name)) ?? { id: resourceId(name), resourceName: name }; }
function resourceId(value: unknown): string { return text(value).split("/").at(-1) ?? ""; }
function withResourceId(value: Row, resourceName: unknown): Row { if (text(value.id)) return value; return { ...value, id: resourceId(resourceName) }; }
function buildGeoTargetQuery(ids: string[]): string { return `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${ids.map((id) => `'geoTargetConstants/${id.replace(/\D/g, "")}'`).join(", ")})`; }
function deliveryWindow(now: Date) { const local = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" })); const today = isoDate(local); const end = new Date(local); if (local.getHours() < 12) end.setDate(end.getDate() - 1); const endDate = isoDate(end); const start = new Date(end); start.setDate(start.getDate() - 28); return { today, startDate: isoDate(start), endDate, throughHour: local.getHours() < 12 ? 23 : Math.max(0, local.getHours() - 2) }; }
function campaignHasElapsedSchedule(campaignId: string, rows: Row[], endDate: string, throughHour: number): boolean { const matching = rows.filter((row) => text(record(row.campaign).id) === campaignId && upper(record(row.campaignCriterion).status) === "ENABLED"); if (!matching.length) return true; const day = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(`${endDate}T12:00:00Z`).getUTCDay()]; return matching.some((row) => { const schedule = record(record(row.campaignCriterion).adSchedule); return upper(schedule.dayOfWeek) === day && number(schedule.startHour) <= throughHour; }); }
function sameWeekday(left: string, right: string): boolean { return new Date(`${left}T12:00:00Z`).getUTCDay() === new Date(`${right}T12:00:00Z`).getUTCDay(); }
function median(values: number[]): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function isoDate(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function hierarchyFor(campaign: Row, adGroup?: Row, leaf?: GoogleAdsHealthResourceNode): GoogleAdsHealthResourceNode[] { return [node("campaign", text(campaign.id), text(campaign.name)), ...(adGroup && text(adGroup.id) ? [node("ad_group", text(adGroup.id), text(adGroup.name))] : []), ...(leaf ? [leaf] : [])].filter((item) => item.resourceId); }
function node(resourceType: string, resourceId: string, resourceName?: string): GoogleAdsHealthResourceNode { return { resourceType, resourceId, resourceName: resourceName || resourceId }; }
function groupByCampaign(rows: unknown[]): Map<string, Row[]> { const map = new Map<string, Row[]>(); for (const raw of rows) { const row = record(raw); const id = text(record(row.campaign).id); if (!id) continue; const list = map.get(id) ?? []; list.push(row); map.set(id, list); } return map; }
function reasons(value: Row): string[] { return array(value.primaryStatusReasons).map((item) => typeof item === "string" ? upper(item) : upper(record(item).reason)); }
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringArray(value: unknown): string[] { return array(value).map(text).filter(Boolean); }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function upper(value: unknown): string { return text(value).toUpperCase(); }
function formatCustomerId(value: string): string { return value.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3"); }
function formatLabel(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function normalizeDestinationUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid$|gbraid$|wbraid$|gad_source$|gad_campaignid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}
function destinationResultLabel(value: { status: number | null; finalUrl: string | null; error: string | null }): string { return value.error ?? `${value.status ?? "unknown"} at ${value.finalUrl ?? "unknown URL"}`; }
function dedupe<T>(values: T[]): T[] { return [...new Set(values)]; }
function dedupeFindings(values: GoogleAdsHealthFinding[]): GoogleAdsHealthFinding[] { return [...new Map(values.map((item) => [item.id, item])).values()]; }
async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> { const results = new Array<R>(items.length); let index = 0; async function worker() { while (index < items.length) { const current = index++; results[current] = await mapper(items[current]); } } await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)); return results; }
function trimCache() { const now = Date.now(); for (const [key, entry] of healthCache) if (entry.expiresAt <= now) healthCache.delete(key); while (healthCache.size > MAX_CACHE_ENTRIES) healthCache.delete(healthCache.keys().next().value as string); }
