import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";
import type { AdsFieldChangeRecord, ManagedAdTextAsset, ManagedAsset, ManagedAssetAutomationSetting, ManagedCampaign, ManagedCustomParameter, ManagedEntityType, ManagedFieldKey, ManagedFieldValue, ManagedRecommendation, ManagedRecommendationCategory, ManagedRecommendationMetrics, ManagedSitelink, ManagedSitelinkAssociation, ManagedSitelinkScope } from "@/lib/ads-management/types";

interface GoogleRow {
  campaign?: { id?: string; resourceName?: string; name?: string; status?: string; primaryStatus?: string; primaryStatusReasons?: string[]; optimizationScore?: number; startDate?: string; endDate?: string; advertisingChannelType?: string; biddingStrategyType?: string; campaignBudget?: string };
  campaignBudget?: { resourceName?: string; amountMicros?: string | number; name?: string; period?: string };
  adGroup?: { id?: string; resourceName?: string; name?: string; status?: string; primaryStatus?: string; primaryStatusReasons?: string[]; cpcBidMicros?: string | number };
  adGroupAd?: { resourceName?: string; status?: string; adStrength?: string; actionItems?: string[]; adGroupAdAssetAutomationSettings?: ManagedAssetAutomationSetting[]; ad?: GoogleAd };
  asset?: { resourceName?: string; name?: string; type?: string; source?: string; finalUrls?: string[]; finalMobileUrls?: string[]; sitelinkAsset?: { linkText?: string; description1?: string; description2?: string; startDate?: string; endDate?: string }; imageAsset?: { fullSize?: { url?: string } }; youtubeVideoAsset?: { youtubeVideoId?: string; youtubeVideoTitle?: string }; callToActionAsset?: { callToAction?: string } };
  customerAsset?: { resourceName?: string; asset?: string; fieldType?: string; status?: string; source?: string };
  campaignAsset?: { resourceName?: string; campaign?: string; asset?: string; fieldType?: string; status?: string; source?: string };
  adGroupAsset?: { resourceName?: string; adGroup?: string; asset?: string; fieldType?: string; status?: string; source?: string };
  recommendation?: { resourceName?: string; type?: string; dismissed?: boolean; campaign?: string; adGroup?: string; campaignBudget?: string; impact?: { baseMetrics?: ManagedRecommendationMetrics; potentialMetrics?: ManagedRecommendationMetrics } };
  customer?: { optimizationScore?: number; currencyCode?: string };
  segments?: { date?: string; recommendationType?: string };
  metrics?: { costMicros?: string | number; impressions?: string | number; clicks?: string | number; conversions?: number; allConversions?: number; conversionsFromInteractionsRate?: number; interactions?: string | number; searchBudgetLostImpressionShare?: number; searchRankLostImpressionShare?: number; optimizationScoreUrl?: string; optimizationScoreUplift?: number };
}

interface GoogleAssetRef { asset?: string }
interface GoogleAd {
  id?: string; name?: string; type?: string; finalUrls?: string[]; finalMobileUrls?: string[]; finalUrlSuffix?: string; trackingUrlTemplate?: string; urlCustomParameters?: ManagedCustomParameter[];
  responsiveSearchAd?: { path1?: string; path2?: string; headlines?: ManagedAdTextAsset[]; descriptions?: ManagedAdTextAsset[] };
  demandGenMultiAssetAd?: { businessName?: string; callToActionText?: string; headlines?: ManagedAdTextAsset[]; descriptions?: ManagedAdTextAsset[]; leadFormOnly?: boolean; logoImages?: GoogleAssetRef[]; marketingImages?: GoogleAssetRef[]; squareMarketingImages?: GoogleAssetRef[]; portraitMarketingImages?: GoogleAssetRef[]; tallPortraitMarketingImages?: GoogleAssetRef[] };
  demandGenVideoResponsiveAd?: { breadcrumb1?: string; breadcrumb2?: string; businessName?: ManagedAdTextAsset; headlines?: ManagedAdTextAsset[]; longHeadlines?: ManagedAdTextAsset[]; descriptions?: ManagedAdTextAsset[]; callToActions?: GoogleAssetRef[]; logoImages?: GoogleAssetRef[]; videos?: GoogleAssetRef[] };
  demandGenCarouselAd?: { businessName?: string; callToActionText?: string; headline?: ManagedAdTextAsset; description?: ManagedAdTextAsset; logoImage?: GoogleAssetRef; carouselCards?: GoogleAssetRef[] };
  demandGenProductAd?: { breadcrumb1?: string; breadcrumb2?: string; businessName?: ManagedAdTextAsset; headline?: ManagedAdTextAsset; description?: ManagedAdTextAsset; logoImage?: GoogleAssetRef; callToAction?: GoogleAssetRef };
}

interface GoogleContext { customerId: string; loginCustomerId: string | null; apiVersion: string; developerToken: string; accessToken: string }

async function contextFor(accountId: string): Promise<GoogleContext> {
  const credentials = getCredentials();
  const customerId = normalizeGoogleAccountId(accountId);
  if (!/^\d{10}$/.test(customerId)) throw new Error("Google Ads account ID must contain 10 digits.");
  if (!credentials.googleDeveloperToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is required.");
  const resolution = await resolveGoogleAccountsFromNotion({ googleAccountIds: [customerId], googleLookupTerms: [customerId], notionAccessToken: credentials.notionAccessToken, notionDatabaseId: process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || credentials.notionDatabaseId, fallbackLoginCustomerId: credentials.googleLoginCustomerId });
  const accessToken = await resolveAccessToken(credentials.googleAccessToken, credentials.googleRefreshToken, credentials.googleClientId, credentials.googleClientSecret);
  return { customerId, loginCustomerId: resolution.loginCustomerIdByAccount[customerId] ?? null, apiVersion: credentials.googleAdsApiVersion, developerToken: credentials.googleDeveloperToken, accessToken };
}

async function resolveAccessToken(accessToken: string | null, refreshToken: string | null, clientId: string | null, clientSecret: string | null) {
  if (refreshToken && clientId && clientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }), cache: "no-store" });
    const json = await response.json() as { access_token?: string; error_description?: string };
    if (!response.ok || !json.access_token) throw new Error(json.error_description || "Google OAuth token refresh failed.");
    return json.access_token;
  }
  if (accessToken) return accessToken;
  throw new Error("Google Ads OAuth credentials are missing.");
}

async function googlePost<T>(ctx: GoogleContext, path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${ctx.accessToken}`, "developer-token": ctx.developerToken, "Content-Type": "application/json" };
  if (ctx.loginCustomerId) headers["login-customer-id"] = ctx.loginCustomerId;
  const response = await fetch(`https://googleads.googleapis.com/${ctx.apiVersion}/customers/${ctx.customerId}/${path}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const text = await response.text();
  let json: T & GoogleErrorEnvelope;
  try {
    json = (text ? JSON.parse(text) : {}) as T & GoogleErrorEnvelope;
  } catch {
    throw new Error(`Google Ads returned a non-JSON response (${response.status}). Request ID: ${response.headers.get("request-id") || "unavailable"}.`);
  }
  if (!response.ok) {
    const streamError = Array.isArray(json)
      ? (json.find((item) => item && typeof item === "object" && "error" in item) as GoogleErrorEnvelope | undefined)?.error
      : json.error;
    throw new Error(formatGoogleError(response.status, response.headers.get("request-id"), streamError, text));
  }
  return json;
}

interface GoogleErrorEnvelope {
  error?: {
    message?: string;
    status?: string;
    details?: Array<{
      errors?: Array<{
        message?: string;
        errorCode?: Record<string, string>;
        location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> };
      }>;
    }>;
  };
}

function formatGoogleError(status: number, requestId: string | null, error: GoogleErrorEnvelope["error"], rawText: string): string {
  const details = (error?.details ?? []).flatMap((detail) => detail.errors ?? []).map((item) => {
    const code = Object.values(item.errorCode ?? {})[0];
    const path = (item.location?.fieldPathElements ?? []).map((part) => `${part.fieldName ?? "field"}${part.index == null ? "" : `[${part.index}]`}`).join(".");
    return [code, path, item.message].filter(Boolean).join(" · ");
  });
  const safeFallback = rawText.replace(/[\r\n\t]+/g, " ").slice(0, 500);
  const description = details.length ? details.join(" | ") : error?.message || error?.status || safeFallback || "Unknown Google Ads error.";
  return `Google Ads request failed (${status}): ${description} Request ID: ${requestId || "unavailable"}.`;
}

export async function fetchManagedSearchCampaigns(accountId: string, dates?: { startDate?: string; endDate?: string }): Promise<{ campaigns: ManagedCampaign[]; synchronizedAt: string }> {
  const ctx = await contextFor(accountId);
  const dateCondition = managedDateCondition(dates?.startDate, dates?.endDate);
  const campaignQuery = `SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.optimization_score, campaign.start_date, campaign.end_date, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.name, campaign_budget.period, customer.currency_code FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name`;
  const adGroupQuery = `SELECT campaign.id, campaign.bidding_strategy_type, ad_group.id, ad_group.resource_name, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' ORDER BY campaign.id, ad_group.name`;
  const performanceQuery = `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.interactions FROM campaign WHERE segments.date ${dateCondition} AND campaign.status != 'REMOVED' ORDER BY segments.date`;
  const campaignSummaryQuery = `SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.all_conversions, metrics.conversions_from_interactions_rate, metrics.interactions, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date ${dateCondition} AND campaign.status != 'REMOVED'`;
  const adGroupPerformanceQuery = `SELECT campaign.id, ad_group.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.interactions FROM ad_group WHERE segments.date ${dateCondition} AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' ORDER BY segments.date`;
  const adPerformanceQuery = `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.interactions FROM ad_group_ad WHERE segments.date ${dateCondition} AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED'`;
  const sitelinkAssetFields = "asset.resource_name, asset.name, asset.source, asset.final_urls, asset.final_mobile_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.sitelink_asset.start_date, asset.sitelink_asset.end_date";
  const campaignSitelinkQuery = `SELECT campaign.id, campaign.status, campaign_asset.resource_name, campaign_asset.campaign, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, campaign_asset.source, ${sitelinkAssetFields} FROM campaign_asset WHERE campaign_asset.field_type = 'SITELINK' AND campaign_asset.status != 'REMOVED' AND campaign.status != 'REMOVED'`;
  const adQuery = `SELECT campaign.id, ad_group.id, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.demand_gen_multi_asset_ad.business_name, ad_group_ad.ad.demand_gen_multi_asset_ad.call_to_action_text, ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions, ad_group_ad.ad.demand_gen_multi_asset_ad.lead_form_only, ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images, ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images, ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images, ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images, ad_group_ad.ad.demand_gen_multi_asset_ad.tall_portrait_marketing_images, ad_group_ad.ad.demand_gen_video_responsive_ad.breadcrumb1, ad_group_ad.ad.demand_gen_video_responsive_ad.breadcrumb2, ad_group_ad.ad.demand_gen_video_responsive_ad.business_name, ad_group_ad.ad.demand_gen_video_responsive_ad.headlines, ad_group_ad.ad.demand_gen_video_responsive_ad.long_headlines, ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions, ad_group_ad.ad.demand_gen_video_responsive_ad.call_to_actions, ad_group_ad.ad.demand_gen_video_responsive_ad.logo_images, ad_group_ad.ad.demand_gen_video_responsive_ad.videos, ad_group_ad.ad.demand_gen_carousel_ad.business_name, ad_group_ad.ad.demand_gen_carousel_ad.call_to_action_text, ad_group_ad.ad.demand_gen_carousel_ad.headline, ad_group_ad.ad.demand_gen_carousel_ad.description, ad_group_ad.ad.demand_gen_carousel_ad.logo_image, ad_group_ad.ad.demand_gen_carousel_ad.carousel_cards, ad_group_ad.ad.demand_gen_product_ad.breadcrumb1, ad_group_ad.ad.demand_gen_product_ad.breadcrumb2, ad_group_ad.ad.demand_gen_product_ad.business_name, ad_group_ad.ad.demand_gen_product_ad.headline, ad_group_ad.ad.demand_gen_product_ad.description, ad_group_ad.ad.demand_gen_product_ad.logo_image, ad_group_ad.ad.demand_gen_product_ad.call_to_action FROM ad_group_ad WHERE campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED' ORDER BY campaign.id, ad_group.id, ad_group_ad.ad.id`;
  const enrichedAdQuery = adQuery
    .replace("ad_group_ad.status,", "ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.action_items, ad_group_ad.ad_group_ad_asset_automation_settings,")
    .replace("ad_group_ad.ad.final_urls,", "ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ad_group_ad.ad.url_custom_parameters,");
  const [campaignBatches, adGroupBatches, adBatches, performanceBatches] = await Promise.all([
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: campaignQuery }),
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: adGroupQuery }),
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: enrichedAdQuery }),
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: performanceQuery }),
  ]);
  // Keep the additional entity-level metric reads sequential to avoid adding another burst of Google requests.
  const campaignSummaryBatches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: campaignSummaryQuery });
  const adGroupPerformanceBatches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: adGroupPerformanceQuery });
  const adPerformanceBatches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: adPerformanceQuery });
  const campaignSitelinkBatches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: campaignSitelinkQuery });
  const campaignRows = campaignBatches.flatMap((batch) => batch.results ?? []);
  const adGroupRows = adGroupBatches.flatMap((batch) => batch.results ?? []);
  const adRows = adBatches.flatMap((batch) => batch.results ?? []);
  const performanceRows = performanceBatches.flatMap((batch) => batch.results ?? []);
  const campaignSummaryRows = campaignSummaryBatches.flatMap((batch) => batch.results ?? []);
  const adGroupPerformanceRows = adGroupPerformanceBatches.flatMap((batch) => batch.results ?? []);
  const adPerformanceRows = adPerformanceBatches.flatMap((batch) => batch.results ?? []);
  const campaignSitelinkRows = campaignSitelinkBatches.flatMap((batch) => batch.results ?? []);
  const assetIds = [...new Set(adRows.flatMap((row) => [...JSON.stringify(row).matchAll(/customers\/\d+\/assets\/(\d+)/g)].map((match) => match[1])))];
  const assetsByResourceName = await fetchAssetDetails(ctx, assetIds);
  const byId = new Map<string, ManagedCampaign>();
  for (const row of campaignRows) {
    const c = row.campaign; const b = row.campaignBudget;
    if (!c?.id || !c.resourceName || !c.campaignBudget) continue;
    let campaign = byId.get(c.id);
    if (!campaign) {
      const name = c.name || `Campaign ${c.id}`;
      const fields: ManagedFieldValue[] = [
        field("campaign", c.id, name, "campaign.name", "Campaign name", "string", name),
        field("campaign", c.id, name, "campaign.status", "Campaign status", "string", c.status || "UNSPECIFIED"),
        field("campaign", c.id, name, "campaign.start_date", "Start date", "date", c.startDate || ""),
        field("campaign", c.id, name, "campaign.end_date", "End date", "date", c.endDate || ""),
        field("campaign", c.campaignBudget, name, "campaign_budget.amount_micros", "Daily budget", "money_micros", String(b?.amountMicros ?? "0")),
      ];
      campaign = { id: c.id, resourceName: c.resourceName, name, status: c.status || "UNSPECIFIED", primaryStatus: c.primaryStatus || "UNSPECIFIED", primaryStatusReasons: c.primaryStatusReasons ?? [], optimizationScore: typeof c.optimizationScore === "number" ? c.optimizationScore : null, startDate: c.startDate || "", endDate: c.endDate || "", budgetResourceName: c.campaignBudget, budgetAmountMicros: String(b?.amountMicros ?? "0"), budgetName: b?.name || "", budgetType: b?.period || "DAILY", currencyCode: row.customer?.currencyCode || "MYR", biddingStrategyType: c.biddingStrategyType || "UNSPECIFIED", channelType: c.advertisingChannelType || "UNSPECIFIED", adGroups: [], fields, performance: [] };
      byId.set(c.id, campaign);
    }
  }
  for (const row of adGroupRows) {
    const c = row.campaign; const g = row.adGroup; const campaign = c?.id ? byId.get(c.id) : null;
    if (!campaign || !g?.id || !g.resourceName) continue;
    const name = g.name || `Ad group ${g.id}`;
    const cpcEditable = ["MANUAL_CPC", "ENHANCED_CPC"].includes(c?.biddingStrategyType || campaign.biddingStrategyType);
    campaign.adGroups.push({ id: g.id, resourceName: g.resourceName, name, status: g.status || "UNSPECIFIED", primaryStatus: g.primaryStatus || "UNSPECIFIED", primaryStatusReasons: g.primaryStatusReasons ?? [], cpcBidMicros: g.cpcBidMicros == null ? null : String(g.cpcBidMicros), performance: [], fields: [
      field("ad_group", g.id, name, "ad_group.name", "Ad group name", "string", name),
      field("ad_group", g.id, name, "ad_group.status", "Configured status", "string", g.status || "UNSPECIFIED"),
      { ...field("ad_group", g.id, name, "ad_group.cpc_bid_micros", "Default CPC bid", "money_micros", String(g.cpcBidMicros ?? "0")), editable: cpcEditable },
    ], ads: [] });
  }
  for (const row of adRows) {
    const campaign = row.campaign?.id ? byId.get(row.campaign.id) : null;
    const group = campaign?.adGroups.find((item) => item.id === row.adGroup?.id);
    const ad = row.adGroupAd?.ad;
    if (!group || !ad?.id) continue;
    const resourceName = `customers/${ctx.customerId}/ads/${ad.id}`;
    const adType = ad.type || "UNKNOWN";
    const name = ad.name?.trim() || firstAdHeadline(ad)?.trim() || `${humanize(adType)} ${ad.id}`;
    const fields = adFields(row.adGroupAd?.resourceName, resourceName, name, ad, adType, row.adGroupAd?.status || "UNSPECIFIED", row.adGroupAd?.adGroupAdAssetAutomationSettings ?? []);
    for (const managedField of fields) {
      if (["asset_ref", "asset_refs"].includes(managedField.valueType)) managedField.assetOptions = [...assetsByResourceName.values()];
    }
    group.ads.push({ id: ad.id, resourceName, name, status: row.adGroupAd?.status || "UNSPECIFIED", adType, adStrength: row.adGroupAd?.adStrength || "UNSPECIFIED", actionItems: row.adGroupAd?.actionItems ?? [], fields, performance: [] });
  }
  for (const row of performanceRows) {
    const campaign = row.campaign?.id ? byId.get(row.campaign.id) : null;
    if (!campaign || !row.segments?.date) continue;
    campaign.performance.push({ date: row.segments.date, costMicros: String(row.metrics?.costMicros ?? "0"), impressions: Number(row.metrics?.impressions ?? 0), clicks: Number(row.metrics?.clicks ?? 0), conversions: Number(row.metrics?.conversions ?? 0), interactions: Number(row.metrics?.interactions ?? 0) });
  }
  for (const row of campaignSummaryRows) {
    const campaign = row.campaign?.id ? byId.get(row.campaign.id) : null;
    if (!campaign) continue;
    campaign.summaryMetrics = { ...managedPerformanceMetrics(row), allConversions: Number(row.metrics?.allConversions ?? 0), conversionRate: typeof row.metrics?.conversionsFromInteractionsRate === "number" ? row.metrics.conversionsFromInteractionsRate : null, searchBudgetLostImpressionShare: typeof row.metrics?.searchBudgetLostImpressionShare === "number" ? row.metrics.searchBudgetLostImpressionShare : null, searchRankLostImpressionShare: typeof row.metrics?.searchRankLostImpressionShare === "number" ? row.metrics.searchRankLostImpressionShare : null };
  }
  for (const row of adGroupPerformanceRows) {
    const campaign = row.campaign?.id ? byId.get(row.campaign.id) : null;
    const group = campaign?.adGroups.find((item) => item.id === row.adGroup?.id);
    if (!group || !row.segments?.date) continue;
    const point = { date: row.segments.date, ...managedPerformanceMetrics(row) };
    group.performance?.push(point);
    group.performanceMetrics = addPerformanceMetrics(group.performanceMetrics, point);
  }
  for (const row of adPerformanceRows) {
    const campaign = row.campaign?.id ? byId.get(row.campaign.id) : null;
    const group = campaign?.adGroups.find((item) => item.id === row.adGroup?.id);
    const ad = group?.ads.find((item) => item.id === row.adGroupAd?.ad?.id);
    if (ad && row.segments?.date) {
      const point = { date: row.segments.date, ...managedPerformanceMetrics(row) };
      ad.performance?.push(point);
      ad.performanceMetrics = addPerformanceMetrics(ad.performanceMetrics, point);
    }
  }
  for (const campaign of byId.values()) {
    const campaignSitelinks = campaignSitelinkRows
      .filter((row) => row.campaign?.id === campaign.id)
      .flatMap((row) => managedSitelink(row, "campaign", campaign.resourceName));
    campaign.fields.push({
      ...field("campaign", campaign.resourceName, campaign.name, "campaign.sitelinks", "Campaign sitelinks", "sitelinks", dedupeSitelinks(campaignSitelinks)),
      sitelinkTargets: [{ scope: "campaign", resourceName: campaign.resourceName, label: `Campaign: ${campaign.name}` }],
    });
  }
  return { campaigns: [...byId.values()], synchronizedAt: new Date().toISOString() };
}

function managedSitelink(row: GoogleRow, scope: ManagedSitelinkScope, targetResourceName: string): ManagedSitelink[] {
  const asset = row.asset;
  const link = scope === "customer" ? row.customerAsset : scope === "campaign" ? row.campaignAsset : row.adGroupAsset;
  if (!asset?.resourceName || !link?.resourceName || !asset.sitelinkAsset?.linkText) return [];
  const source = asset.source || link.source || "UNSPECIFIED";
  return [{
    id: link.resourceName,
    assetResourceName: asset.resourceName,
    linkResourceName: link.resourceName,
    scope,
    targetResourceName,
    source,
    status: link.status || "ENABLED",
    linkText: asset.sitelinkAsset.linkText,
    description1: asset.sitelinkAsset.description1 || "",
    description2: asset.sitelinkAsset.description2 || "",
    finalUrls: asset.finalUrls ?? [],
    finalMobileUrls: asset.finalMobileUrls ?? [],
    startDate: asset.sitelinkAsset.startDate || "",
    endDate: asset.sitelinkAsset.endDate || "",
    editable: source !== "AUTOMATICALLY_CREATED",
    associations: [{ linkResourceName: link.resourceName, scope, targetResourceName, status: link.status || "ENABLED" }],
  }];
}

function dedupeSitelinks(items: ManagedSitelink[]): ManagedSitelink[] {
  const byAsset = new Map<string, ManagedSitelink>();
  for (const item of items) {
    const key = item.assetResourceName || item.id;
    const existing = byAsset.get(key);
    if (!existing) {
      byAsset.set(key, item);
      continue;
    }
    const associations = [...(existing.associations ?? sitelinkAssociations(existing)), ...(item.associations ?? sitelinkAssociations(item))].filter((association): association is ManagedSitelinkAssociation => Boolean(association.linkResourceName));
    existing.associations = associations.filter((association, index) => associations.findIndex((candidate) => candidate.linkResourceName === association.linkResourceName) === index);
  }
  return [...byAsset.values()];
}

function managedPerformanceMetrics(row: GoogleRow) { return { costMicros: String(row.metrics?.costMicros ?? "0"), impressions: Number(row.metrics?.impressions ?? 0), clicks: Number(row.metrics?.clicks ?? 0), conversions: Number(row.metrics?.conversions ?? 0), interactions: Number(row.metrics?.interactions ?? 0) }; }
function addPerformanceMetrics(current: ReturnType<typeof managedPerformanceMetrics> | undefined, next: ReturnType<typeof managedPerformanceMetrics>) { return { costMicros: String(Number(current?.costMicros ?? 0) + Number(next.costMicros)), impressions: Number(current?.impressions ?? 0) + next.impressions, clicks: Number(current?.clicks ?? 0) + next.clicks, conversions: Number(current?.conversions ?? 0) + next.conversions, interactions: Number(current?.interactions ?? 0) + next.interactions }; }
function managedDateCondition(startDate?: string, endDate?: string) { const valid = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); if (startDate || endDate) { if (!valid(startDate) || !valid(endDate) || startDate! > endDate!) throw new Error("A valid Google Ads startDate and endDate are required."); return `BETWEEN '${startDate}' AND '${endDate}'`; } return "DURING LAST_30_DAYS"; }

export async function fetchManagedRecommendations(accountId: string): Promise<{ recommendations: ManagedRecommendation[]; optimizationScore: number | null; optimizationScoreUrl: string | null; synchronizedAt: string }> {
  const ctx = await contextFor(accountId);
  const recommendationQuery = `SELECT recommendation.resource_name, recommendation.type, recommendation.dismissed, recommendation.campaign, recommendation.ad_group, recommendation.campaign_budget, recommendation.impact, campaign.name, ad_group.name FROM recommendation WHERE recommendation.dismissed = FALSE`;
  const scoreQuery = `SELECT customer.optimization_score, metrics.optimization_score_url, metrics.optimization_score_uplift, segments.recommendation_type FROM customer`;
  const [recommendationBatches, scoreBatches] = await Promise.all([
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: recommendationQuery }),
    googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: scoreQuery }),
  ]);
  const scoreRows = scoreBatches.flatMap((batch) => batch.results ?? []);
  const scoreUpliftByType = new Map(scoreRows.flatMap((row): Array<[string, number]> => row.segments?.recommendationType && typeof row.metrics?.optimizationScoreUplift === "number" ? [[row.segments.recommendationType, row.metrics.optimizationScoreUplift]] : []));
  const recommendations = recommendationBatches.flatMap((batch) => batch.results ?? []).flatMap((row): ManagedRecommendation[] => {
    const item = row.recommendation;
    if (!item?.resourceName || !item.type) return [];
    return [{ resourceName: item.resourceName, type: item.type, category: recommendationCategory(item.type), title: recommendationTitle(item.type), description: recommendationDescription(item.type), campaignResourceName: item.campaign, campaignName: row.campaign?.name, adGroupResourceName: item.adGroup, adGroupName: row.adGroup?.name, baseMetrics: item.impact?.baseMetrics, potentialMetrics: item.impact?.potentialMetrics, optimizationScoreUplift: scoreUpliftByType.get(item.type) }];
  });
  const scoreRow = scoreRows[0];
  return { recommendations, optimizationScore: typeof scoreRow?.customer?.optimizationScore === "number" ? scoreRow.customer.optimizationScore : null, optimizationScoreUrl: scoreRow?.metrics?.optimizationScoreUrl || null, synchronizedAt: new Date().toISOString() };
}

function recommendationCategory(type: string): ManagedRecommendationCategory {
  if (type.includes("BUDGET") || type.includes("TARGET_CPA") || type.includes("TARGET_ROAS") || type.includes("MAXIMIZE") || type.includes("BID") || type.includes("ROAS")) return "bidding_budgets";
  if (type.includes("KEYWORD") || type.includes("AUDIENCE") || type.includes("CUSTOMER_MATCH") || type.includes("SEARCH_PARTNERS") || type.includes("DISPLAY_EXPANSION")) return "keywords_targeting";
  if (type.includes("TAG") || type.includes("CONVERSION")) return "measurement";
  if (type.includes("FIX") || type.includes("SUSPENSION") || type.includes("REFRESH")) return "repairs";
  return "ads_assets";
}
function recommendationTitle(type: string): string {
  const titles: Record<string, string> = { CAMPAIGN_BUDGET: "Adjust your budgets", FORECASTING_CAMPAIGN_BUDGET: "Adjust your budgets", MARGINAL_ROI_CAMPAIGN_BUDGET: "Adjust your budgets", MOVE_UNUSED_BUDGET: "Move unused budgets", DYNAMIC_IMAGE_EXTENSION_OPT_IN: "Add dynamic images", IMPROVE_DEMAND_GEN_AD_STRENGTH: "Improve your Demand Gen ads", IMPROVE_GOOGLE_TAG_COVERAGE: "Improve Google tag coverage", RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: "Improve your responsive search ads", RESPONSIVE_SEARCH_AD: "Add responsive search ads", RESPONSIVE_SEARCH_AD_ASSET: "Add assets to your responsive search ads", SITELINK_ASSET: "Add sitelinks", KEYWORD: "Add relevant keywords", KEYWORD_MATCH_TYPE: "Improve keyword match types", MAXIMIZE_CLICKS_OPT_IN: "Get more clicks with automated bidding", MAXIMIZE_CONVERSIONS_OPT_IN: "Get more conversions with automated bidding", SEARCH_PARTNERS_OPT_IN: "Opt in to Google Search Partner Network", REFRESH_CUSTOMER_MATCH_LIST: "Refresh your Customer Match lists", PERFORMANCE_MAX_OPT_IN: "Create a Performance Max campaign", IMPROVE_PERFORMANCE_MAX_AD_STRENGTH: "Improve your Performance Max ads", SHOPPING_FIX_DISAPPROVED_PRODUCTS: "Fix disapproved products", SHOPPING_FIX_MERCHANT_CENTER_ACCOUNT_SUSPENSION_WARNING: "Fix your Merchant Center account", SHOPPING_FIX_SUSPENDED_MERCHANT_CENTER_ACCOUNT: "Fix your suspended Merchant Center account" };
  return titles[type] || formatRecommendationType(type);
}
function recommendationDescription(type: string): string {
  const descriptions: Record<string, string> = { CAMPAIGN_BUDGET: "Get more clicks by adjusting budgets in campaigns that are limited by budget.", FORECASTING_CAMPAIGN_BUDGET: "Google forecasts that adjusting the affected campaign budget may capture more traffic.", MARGINAL_ROI_CAMPAIGN_BUDGET: "Get more clicks by adjusting your budgets in Maximize clicks campaigns. Google estimates a smaller relative increase in overall cost per click.", MOVE_UNUSED_BUDGET: "Move budget from campaigns with unused capacity to campaigns that can capture more traffic.", DYNAMIC_IMAGE_EXTENSION_OPT_IN: "Enhance your text ads with landing-page images, which can improve click-through rate.", IMPROVE_DEMAND_GEN_AD_STRENGTH: "Add or improve Demand Gen assets to increase placement coverage and ad strength.", IMPROVE_GOOGLE_TAG_COVERAGE: "Deploy Google tags on more pages so conversion measurement is more complete.", RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: "Get more clicks by improving headlines and descriptions and by adding supporting assets such as sitelinks.", RESPONSIVE_SEARCH_AD: "Reach more relevant searches by adding responsive search ads to eligible ad groups.", RESPONSIVE_SEARCH_AD_ASSET: "Add more relevant headlines and descriptions to improve responsive search ad coverage.", SITELINK_ASSET: "Add links to useful pages on your site that can appear below eligible ads.", SEARCH_PARTNERS_OPT_IN: "Get more conversions and conversion value by opting in to the Google Search Partner Network.", REFRESH_CUSTOMER_MATCH_LIST: "Keep Customer Match lists useful by refreshing customer information that may have become outdated.", PERFORMANCE_MAX_OPT_IN: "Use Performance Max to reach more customers across Google’s advertising channels." };
  return descriptions[type] || "Google identified an account or campaign setting that may improve performance or coverage.";
}
function formatRecommendationType(type: string): string { return type.toLowerCase().split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" "); }

function field(entityType: ManagedEntityType, entityId: string, entityName: string, fieldKey: ManagedFieldKey, fieldLabel: string, valueType: ManagedFieldValue["valueType"], value: unknown): ManagedFieldValue {
  return { entityType, entityId, entityName, fieldKey, fieldLabel, valueType, value, editable: true };
}

function sanitizeAdTextAssets(value: unknown): ManagedAdTextAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): ManagedAdTextAsset[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const asset = candidate as { text?: unknown; pinnedField?: unknown };
    const text = typeof asset.text === "string" ? asset.text.trim() : "";
    if (!text) return [];
    return [{ text, ...(typeof asset.pinnedField === "string" && asset.pinnedField ? { pinnedField: asset.pinnedField } : {}) }];
  });
}

function adFields(adGroupAdResourceName: string | undefined, resourceName: string, name: string, ad: GoogleAd, adType: string, status: string, automationSettings: ManagedAssetAutomationSetting[]): ManagedFieldValue[] {
  const fields: ManagedFieldValue[] = [
    field("ad", adGroupAdResourceName || resourceName, name, "ad_group_ad.status", "Ad status", "string", status),
    { ...field("ad", resourceName, name, "ad.name", "Ad name", "string", name), editable: false },
    field("ad", resourceName, name, "ad.final_url", "Final URL", "url", ad.finalUrls?.[0] || ""),
    field("ad", resourceName, name, "ad.final_mobile_urls", "Mobile final URLs", "url_list", ad.finalMobileUrls ?? []),
    field("ad", resourceName, name, "ad.tracking_url_template", "Tracking URL template", "string", ad.trackingUrlTemplate || ""),
    field("ad", resourceName, name, "ad.final_url_suffix", "Final URL suffix", "string", ad.finalUrlSuffix || ""),
    field("ad", resourceName, name, "ad.url_custom_parameters", "Custom parameters", "custom_parameters", ad.urlCustomParameters ?? []),
  ];
  if (adType === "RESPONSIVE_SEARCH_AD") {
    const value = ad.responsiveSearchAd;
    fields.push(
      field("ad", resourceName, name, "ad.path1", "Display path 1", "string", value?.path1 || ""),
      field("ad", resourceName, name, "ad.path2", "Display path 2", "string", value?.path2 || ""),
      field("ad", resourceName, name, "ad.headlines", "Headlines", "text_assets", sanitizeAdTextAssets(value?.headlines)),
      field("ad", resourceName, name, "ad.descriptions", "Descriptions", "text_assets", sanitizeAdTextAssets(value?.descriptions)),
    );
  } else if (adType === "DEMAND_GEN_MULTI_ASSET_AD") {
    const value = ad.demandGenMultiAssetAd;
    fields.push(
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.business_name", "Business name", "string", value?.businessName || ""),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.call_to_action_text", "Call to action", "string", value?.callToActionText || ""),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.headlines", "Headlines", "text_assets", sanitizeAdTextAssets(value?.headlines)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.descriptions", "Descriptions", "text_assets", sanitizeAdTextAssets(value?.descriptions)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.lead_form_only", "Lead form only", "boolean", Boolean(value?.leadFormOnly)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.logo_images", "Logo images", "asset_refs", assetRefs(value?.logoImages)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.marketing_images", "Landscape images", "asset_refs", assetRefs(value?.marketingImages)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.square_marketing_images", "Square images", "asset_refs", assetRefs(value?.squareMarketingImages)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.portrait_marketing_images", "Portrait images", "asset_refs", assetRefs(value?.portraitMarketingImages)),
      field("ad", resourceName, name, "ad.demand_gen_multi_asset_ad.tall_portrait_marketing_images", "Tall portrait images", "asset_refs", assetRefs(value?.tallPortraitMarketingImages)),
    );
  } else if (adType === "DEMAND_GEN_VIDEO_RESPONSIVE_AD") {
    const value = ad.demandGenVideoResponsiveAd;
    fields.push(
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.business_name", "Business name", "single_text_asset", textAsset(value?.businessName)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.breadcrumb1", "Display path 1", "string", value?.breadcrumb1 || ""),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.breadcrumb2", "Display path 2", "string", value?.breadcrumb2 || ""),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.headlines", "Headlines", "text_assets", sanitizeAdTextAssets(value?.headlines)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.long_headlines", "Long headlines", "text_assets", sanitizeAdTextAssets(value?.longHeadlines)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.descriptions", "Descriptions", "text_assets", sanitizeAdTextAssets(value?.descriptions)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.call_to_actions", "Call-to-action assets", "asset_refs", assetRefs(value?.callToActions)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.logo_images", "Logo images", "asset_refs", assetRefs(value?.logoImages)),
      field("ad", resourceName, name, "ad.demand_gen_video_responsive_ad.videos", "Videos", "asset_refs", assetRefs(value?.videos)),
      field("ad", adGroupAdResourceName || resourceName, name, "ad_group_ad.ad_group_ad_asset_automation_settings", "Asset optimization", "asset_automation_settings", automationSettings),
    );
  } else if (adType === "DEMAND_GEN_CAROUSEL_AD") {
    const value = ad.demandGenCarouselAd;
    fields.push(
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.business_name", "Business name", "string", value?.businessName || ""),
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.call_to_action_text", "Call to action", "string", value?.callToActionText || ""),
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.headline", "Headline", "single_text_asset", textAsset(value?.headline)),
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.description", "Description", "single_text_asset", textAsset(value?.description)),
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.logo_image", "Logo image", "asset_ref", value?.logoImage?.asset || ""),
      field("ad", resourceName, name, "ad.demand_gen_carousel_ad.carousel_cards", "Carousel cards", "asset_refs", assetRefs(value?.carouselCards)),
    );
  } else if (adType === "DEMAND_GEN_PRODUCT_AD") {
    const value = ad.demandGenProductAd;
    fields.push(
      field("ad", resourceName, name, "ad.demand_gen_product_ad.business_name", "Business name", "single_text_asset", textAsset(value?.businessName)),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.breadcrumb1", "Display path 1", "string", value?.breadcrumb1 || ""),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.breadcrumb2", "Display path 2", "string", value?.breadcrumb2 || ""),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.headline", "Headline", "single_text_asset", textAsset(value?.headline)),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.description", "Description", "single_text_asset", textAsset(value?.description)),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.logo_image", "Logo image", "asset_ref", value?.logoImage?.asset || ""),
      field("ad", resourceName, name, "ad.demand_gen_product_ad.call_to_action", "Call-to-action asset", "asset_ref", value?.callToAction?.asset || ""),
    );
  }
  return fields;
}

async function fetchAssetDetails(ctx: GoogleContext, assetIds: string[]): Promise<Map<string, ManagedAsset>> {
  if (!assetIds.length) return new Map();
  const query = `SELECT asset.resource_name, asset.name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title, asset.call_to_action_asset.call_to_action FROM asset WHERE asset.id IN (${assetIds.join(",")})`;
  try {
    const batches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query });
    return new Map(batches.flatMap((batch) => batch.results ?? []).flatMap((row): Array<[string, ManagedAsset]> => {
      const asset = row.asset;
      if (!asset?.resourceName) return [];
      return [[asset.resourceName, { resourceName: asset.resourceName, name: asset.name || asset.youtubeVideoAsset?.youtubeVideoTitle || humanize(asset.type || "asset"), type: asset.type || "UNKNOWN", imageUrl: asset.imageAsset?.fullSize?.url, youtubeVideoId: asset.youtubeVideoAsset?.youtubeVideoId, youtubeVideoTitle: asset.youtubeVideoAsset?.youtubeVideoTitle, callToAction: asset.callToActionAsset?.callToAction }]];
    }));
  } catch {
    // Asset decoration must never prevent the core campaign/ad editor from loading.
    return new Map();
  }
}

function assetRefs(value: GoogleAssetRef[] | undefined): string[] { return (value ?? []).flatMap((item) => item.asset ? [item.asset] : []); }
function textAsset(value: ManagedAdTextAsset | undefined): string { return value?.text?.trim() || ""; }
function firstAdHeadline(ad: GoogleAd): string {
  return ad.responsiveSearchAd?.headlines?.[0]?.text || ad.demandGenMultiAssetAd?.headlines?.[0]?.text || ad.demandGenVideoResponsiveAd?.headlines?.[0]?.text || ad.demandGenCarouselAd?.headline?.text || ad.demandGenProductAd?.headline?.text || "";
}
function humanize(value: string): string { return value.toLowerCase().split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" "); }

export async function fetchOfficialValues(accountId: string, changes: AdsFieldChangeRecord[]): Promise<Map<string, unknown>> {
  const values = new Map<string, unknown>();
  const normalChanges = changes.filter((change) => change.field_key !== "recommendation.apply");
  if (normalChanges.length) {
    const { campaigns } = await fetchManagedSearchCampaigns(accountId);
    for (const campaign of campaigns) {
      for (const f of campaign.fields) values.set(key(f.entityType, f.entityId, f.fieldKey), f.value);
      for (const group of campaign.adGroups) {
        for (const f of group.fields) values.set(key(f.entityType, f.entityId, f.fieldKey), f.value);
        for (const ad of group.ads) for (const f of ad.fields) values.set(key(f.entityType, f.entityId, f.fieldKey), f.value);
      }
    }
  }
  const recommendationChanges = changes.filter((change) => change.field_key === "recommendation.apply");
  let activeRecommendations = new Set<string>();
  if (recommendationChanges.length) {
    const ctx = await contextFor(accountId);
    const batches = await googlePost<Array<{ results?: GoogleRow[] }>>(ctx, "googleAds:searchStream", { query: "SELECT recommendation.resource_name FROM recommendation WHERE recommendation.dismissed = FALSE" });
    activeRecommendations = new Set(batches.flatMap((batch) => batch.results ?? []).flatMap((row) => row.recommendation?.resourceName ? [row.recommendation.resourceName] : []));
  }
  return new Map(changes.map((c) => [c.id, c.field_key === "recommendation.apply" ? (activeRecommendations.has(c.entity_id) ? "ACTIVE" : "APPLIED") : values.get(key(c.entity_type, c.entity_id, c.field_key))]));
}

function key(type: string, id: string, field: string) { return `${type}:${id}:${field}`; }

export function validateLocalChange(change: AdsFieldChangeRecord): string[] {
  const errors: string[] = [];
  if (change.field_key === "recommendation.apply") {
    if (!/^customers\/\d+\/recommendations\/[A-Za-z0-9_-]+$/.test(change.entity_id)) errors.push("Google recommendation resource name is invalid.");
    if (change.baseline_value !== "ACTIVE" || change.proposed_value !== "APPLIED") errors.push("Recommendation requests must change from ACTIVE to APPLIED.");
    return errors;
  }
  if (["campaign.name", "ad_group.name"].includes(change.field_key) && !String(change.proposed_value ?? "").trim()) errors.push(`${change.field_label} is required.`);
  if (["campaign.status", "ad_group.status", "ad_group_ad.status"].includes(change.field_key) && !["ENABLED", "PAUSED"].includes(String(change.proposed_value))) errors.push("Status must be ENABLED or PAUSED.");
  if (change.value_type === "money_micros" && (!Number.isFinite(Number(change.proposed_value)) || Number(change.proposed_value) <= 0)) errors.push(`${change.field_label} must be greater than zero.`);
  if (["campaign.start_date", "campaign.end_date"].includes(change.field_key) && !/^\d{4}-\d{2}-\d{2}$/.test(String(change.proposed_value))) errors.push(`${change.field_label} must use YYYY-MM-DD.`);
  if (change.field_key === "ad.final_url") {
    try { const url = new URL(String(change.proposed_value)); if (!/^https?:$/.test(url.protocol)) errors.push("Final URL must use http or https."); }
    catch { errors.push("Final URL must be a valid URL."); }
  }
  if (change.value_type === "url_list" && Array.isArray(change.proposed_value)) change.proposed_value.forEach((item) => { try { const url = new URL(String(item)); if (!/^https?:$/.test(url.protocol)) errors.push(`${change.field_label} must use http or https.`); } catch { errors.push(`${change.field_label} contains an invalid URL.`); } });
  if (change.value_type === "custom_parameters" && Array.isArray(change.proposed_value)) (change.proposed_value as ManagedCustomParameter[]).forEach((item) => { if (!item.key.trim() || !item.value.trim()) errors.push("Every custom parameter needs both a name and value."); else if (!/^[a-zA-Z0-9_]+$/.test(item.key)) errors.push(`Custom parameter name "${item.key}" may contain only letters, numbers, and underscores.`); });
  if (change.value_type === "sitelinks") {
    const baseline = Array.isArray(change.baseline_value) ? change.baseline_value as ManagedSitelink[] : [];
    const proposed = Array.isArray(change.proposed_value) ? change.proposed_value as ManagedSitelink[] : [];
    if (proposed.length > 20) errors.push("A change request can contain at most 20 effective sitelinks.");
    const proposedById = new Map(proposed.map((item) => [item.id, item]));
    for (const original of baseline.filter((item) => !item.editable)) {
      const next = proposedById.get(original.id);
      if (!next || !sameSitelinkContent(original, next)) errors.push(`Automatically created sitelink "${original.linkText}" cannot be edited or deleted.`);
    }
    proposed.forEach((item, index) => {
      const label = `Sitelink ${index + 1}`;
      if (!item.linkText.trim()) errors.push(`${label} needs link text.`);
      if (item.linkText.length > 25) errors.push(`${label} text must be 25 characters or fewer.`);
      if (item.description1.length > 35 || item.description2.length > 35) errors.push(`${label} description lines must be 35 characters or fewer.`);
      if (Boolean(item.description1) !== Boolean(item.description2)) errors.push(`${label} must include both description lines or neither one.`);
      if (!item.finalUrls.length) errors.push(`${label} needs a final URL.`);
      [...item.finalUrls, ...item.finalMobileUrls].forEach((url) => { try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) errors.push(`${label} URLs must use http or https.`); } catch { errors.push(`${label} contains an invalid URL.`); } });
      if (item.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) errors.push(`${label} start date must use YYYY-MM-DD.`);
      if (item.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.endDate)) errors.push(`${label} end date must use YYYY-MM-DD.`);
      if (item.startDate && item.endDate && item.startDate > item.endDate) errors.push(`${label} end date must be on or after its start date.`);
      if (item.scope === "campaign" && !/^customers\/\d+\/campaigns\/\d+$/.test(item.targetResourceName)) errors.push(`${label} has an invalid campaign scope.`);
      if (item.scope === "ad_group" && !/^customers\/\d+\/adGroups\/\d+$/.test(item.targetResourceName)) errors.push(`${label} has an invalid ad-group scope.`);
      if (item.scope === "customer" && !/^customers\/\d+$/.test(item.targetResourceName)) errors.push(`${label} has an invalid account scope.`);
    });
  }
  if ((["ad.path1", "ad.path2"].includes(change.field_key) || change.field_key.endsWith(".breadcrumb1") || change.field_key.endsWith(".breadcrumb2")) && String(change.proposed_value ?? "").length > 15) errors.push(`${change.field_label} must be 15 characters or fewer.`);
  if (change.value_type === "single_text_asset" && !String(change.proposed_value ?? "").trim()) errors.push(`${change.field_label} is required.`);
  if (change.field_key.endsWith("business_name") && String(change.proposed_value ?? "").length > 25) errors.push(`${change.field_label} must be 25 characters or fewer.`);
  if (["asset_ref", "asset_refs"].includes(change.value_type)) {
    const refs = change.value_type === "asset_refs" && Array.isArray(change.proposed_value) ? change.proposed_value : [change.proposed_value];
    refs.forEach((ref) => { if (ref && !/^customers\/\d+\/assets\/\d+$/.test(String(ref))) errors.push(`${change.field_label} contains an invalid Google asset resource name.`); });
  }
  if (change.field_key.endsWith("headlines") || change.field_key.endsWith("descriptions")) {
    const assets = Array.isArray(change.proposed_value) ? change.proposed_value as ManagedAdTextAsset[] : [];
    const headline = change.field_key.endsWith("headlines"); const rsa = change.field_key === "ad.headlines" || change.field_key === "ad.descriptions"; const min = rsa ? (headline ? 3 : 2) : 1; const max = rsa ? (headline ? 15 : 4) : 5; const demandGenVideoHeadline = change.field_key.includes("demand_gen_video_responsive_ad") && headline && !change.field_key.endsWith("long_headlines"); const charMax = change.field_key.endsWith("long_headlines") || !headline ? 90 : demandGenVideoHeadline ? 40 : 30;
    if (assets.length < min || assets.length > max) errors.push(`${change.field_label} must contain ${min} to ${max} items.`);
    assets.forEach((asset, index) => { if (!asset.text?.trim()) errors.push(`${change.field_label} ${index + 1} cannot be empty.`); else if (visibleGoogleAdTextLength(asset.text) > charMax) errors.push(`${change.field_label} ${index + 1} must be ${charMax} characters or fewer.`); });
  }
  return errors;
}

function visibleGoogleAdTextLength(value: string): number {
  return value.replace(/\{keyword:([^{}]*)\}/gi, "$1").length;
}

export async function mutateGoogleChanges(accountId: string, changes: AdsFieldChangeRecord[], validateOnly: boolean): Promise<Map<string, unknown>> {
  const ctx = await contextFor(accountId);
  if (!validateOnly) assertWritesAllowed();
  const results = new Map<string, unknown>();
  const recommendationValidation = validateOnly && changes.some((change) => change.field_key === "recommendation.apply") ? await fetchOfficialValues(accountId, changes.filter((change) => change.field_key === "recommendation.apply")) : null;
  for (const change of changes) {
    try {
      if (change.field_key === "recommendation.apply") {
        if (validateOnly) {
          if (recommendationValidation?.get(change.id) !== "ACTIVE") throw new Error("This Google recommendation is no longer active.");
          results.set(change.id, { validated: true, resourceName: change.entity_id });
          continue;
        }
        const response = await googlePost(ctx, "recommendations:apply", { operations: [{ resourceName: change.entity_id }], partialFailure: false });
        results.set(change.id, response);
        continue;
      }
      if (isSitelinkChange(change)) {
        const mutateOperations = buildSitelinkMutateOperations(ctx.customerId, change);
        if (!mutateOperations.length) {
          results.set(change.id, { validated: validateOnly, unchanged: true });
          continue;
        }
        const response = await googlePost(ctx, "googleAds:mutate", { mutateOperations, validateOnly, partialFailure: false, responseContentType: "MUTABLE_RESOURCE" });
        if (!validateOnly) assertCompleteMutateResponse(response, mutateOperations.length);
        results.set(change.id, response);
        continue;
      }
      const mapping = mutationFor(ctx.customerId, change);
      const response = await googlePost(ctx, mapping.path, { operations: [{ update: mapping.update, updateMask: mapping.mask }], validateOnly, partialFailure: false, responseContentType: "MUTABLE_RESOURCE" });
      results.set(change.id, response);
    } catch (error) {
      results.set(change.id, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function assertCompleteMutateResponse(response: unknown, expectedOperations: number) {
  const operationResponses = response && typeof response === "object" && Array.isArray((response as { mutateOperationResponses?: unknown }).mutateOperationResponses)
    ? (response as { mutateOperationResponses: unknown[] }).mutateOperationResponses
    : null;
  if (!operationResponses || operationResponses.length !== expectedOperations) {
    throw new Error(`Google returned ${operationResponses?.length ?? 0} operation results for ${expectedOperations} requested sitelink operations.`);
  }
}

export function buildSitelinkMutateOperations(customerId: string, change: AdsFieldChangeRecord): unknown[] {
  const baseline = Array.isArray(change.baseline_value) ? change.baseline_value as ManagedSitelink[] : [];
  const proposed = Array.isArray(change.proposed_value) ? change.proposed_value as ManagedSitelink[] : [];
  const proposedById = new Map(proposed.map((item) => [item.id, item]));
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  const operations: Array<Record<string, unknown>> = [];
  for (const original of baseline) {
    const next = proposedById.get(original.id);
    if (!original.editable) continue;
    const oldAssociations = sitelinkAssociations(original);
    const nextAssociations = next ? sitelinkAssociations(next) : [];
    const contentChanged = Boolean(next && !sameSitelinkContent(original, next));
    for (const association of oldAssociations) {
      if (contentChanged || !next || !hasAssociation(nextAssociations, association)) operations.push(sitelinkRemoveOperation(association));
    }
    if (next && !contentChanged && original.assetResourceName) {
      for (const association of nextAssociations) {
        if (!hasAssociation(oldAssociations, association)) operations.push(sitelinkCreateLinkOperation(association, original.assetResourceName));
      }
    }
  }
  let temporaryAssetId = -1;
  for (const item of proposed) {
    const original = baselineById.get(item.id);
    if (original && sameSitelinkContent(original, item)) continue;
    const assetResourceName = `customers/${customerId}/assets/${temporaryAssetId--}`;
    operations.push({ assetOperation: { create: {
      resourceName: assetResourceName,
      name: `Sitelink | ${item.linkText}`.slice(0, 128),
      finalUrls: item.finalUrls,
      ...(item.finalMobileUrls.length ? { finalMobileUrls: item.finalMobileUrls } : {}),
      sitelinkAsset: {
        linkText: item.linkText,
        ...(item.description1 ? { description1: item.description1, description2: item.description2 } : {}),
        ...(item.startDate ? { startDate: item.startDate } : {}),
        ...(item.endDate ? { endDate: item.endDate } : {}),
      },
    } } });
    const associations = sitelinkAssociations(item);
    for (const association of associations) operations.push(sitelinkCreateLinkOperation(association, assetResourceName));
  }
  return operations;
}

type SitelinkAssociation = Pick<ManagedSitelink, "scope" | "targetResourceName"> & { linkResourceName?: string; status?: string };

function sitelinkAssociations(item: ManagedSitelink): SitelinkAssociation[] {
  return item.associations?.length ? item.associations : [{ scope: item.scope, targetResourceName: item.targetResourceName, linkResourceName: item.linkResourceName, status: item.status }];
}

function hasAssociation(items: SitelinkAssociation[], candidate: SitelinkAssociation): boolean {
  if (candidate.linkResourceName) return items.some((item) => item.linkResourceName === candidate.linkResourceName);
  return items.some((item) => item.scope === candidate.scope && item.targetResourceName === candidate.targetResourceName);
}

function sitelinkRemoveOperation(item: SitelinkAssociation): Record<string, unknown> {
  const remove = item.linkResourceName || "";
  if (item.scope === "customer") return { customerAssetOperation: { remove } };
  if (item.scope === "campaign") return { campaignAssetOperation: { remove } };
  return { adGroupAssetOperation: { remove } };
}

function sitelinkCreateLinkOperation(item: SitelinkAssociation, asset: string): Record<string, unknown> {
  if (item.scope === "customer") return { customerAssetOperation: { create: { asset, fieldType: "SITELINK", status: "ENABLED" } } };
  if (item.scope === "campaign") return { campaignAssetOperation: { create: { campaign: item.targetResourceName, asset, fieldType: "SITELINK", status: "ENABLED" } } };
  return { adGroupAssetOperation: { create: { adGroup: item.targetResourceName, asset, fieldType: "SITELINK", status: "ENABLED" } } };
}

function sameSitelinkContent(left: ManagedSitelink, right: ManagedSitelink): boolean {
  return JSON.stringify(sitelinkContent(left)) === JSON.stringify(sitelinkContent(right));
}

function sitelinkContent(item: ManagedSitelink) {
  return { linkText: item.linkText.trim(), description1: item.description1.trim(), description2: item.description2.trim(), finalUrls: item.finalUrls.map((url) => url.trim()).filter(Boolean), finalMobileUrls: item.finalMobileUrls.map((url) => url.trim()).filter(Boolean), startDate: item.startDate, endDate: item.endDate };
}

export function sitelinkVerificationMatches(change: AdsFieldChangeRecord, observedValue: unknown): boolean {
  if (!isSitelinkChange(change)) return false;
  const baseline = Array.isArray(change.baseline_value) ? change.baseline_value as ManagedSitelink[] : [];
  const proposed = Array.isArray(change.published_value ?? change.proposed_value) ? (change.published_value ?? change.proposed_value) as ManagedSitelink[] : [];
  const observed = Array.isArray(observedValue) ? observedValue as ManagedSitelink[] : [];
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  const proposedById = new Map(proposed.map((item) => [item.id, item]));

  for (const original of baseline) {
    const next = proposedById.get(original.id);
    const oldAssociations = sitelinkAssociations(original);
    const nextAssociations = next ? sitelinkAssociations(next) : [];
    if (!next || sameSitelinkContent(original, next)) {
      const removedLinks = new Set(oldAssociations.filter((association) => !hasAssociation(nextAssociations, association)).map((association) => association.linkResourceName).filter(Boolean));
      if (observed.some((item) => sitelinkAssociations(item).some((association) => association.linkResourceName && removedLinks.has(association.linkResourceName)))) return false;
      if (next && nextAssociations.some((association) => !oldAssociations.some((old) => hasAssociation([old], association))) && !observed.some((item) => sameSitelinkContent(item, next) && nextAssociations.every((association) => hasAssociation(sitelinkAssociations(item), association)))) return false;
    }
  }
  for (const next of proposed) {
    const original = baselineById.get(next.id);
    if (original && sameSitelinkContent(original, next)) continue;
    const expectedAssociations = sitelinkAssociations(next);
    if (!observed.some((item) => {
      if (!sameSitelinkContent(item, next)) return false;
      const actualAssociations = sitelinkAssociations(item);
      return expectedAssociations.every((expected) => actualAssociations.some((actual) => actual.scope === expected.scope && actual.targetResourceName === expected.targetResourceName));
    })) return false;
  }
  return true;
}

function isSitelinkChange(change: Pick<AdsFieldChangeRecord, "field_key" | "value_type">): boolean {
  return change.value_type === "sitelinks" && ["campaign.sitelinks", "ad.sitelinks"].includes(change.field_key);
}

function mutationFor(customerId: string, c: AdsFieldChangeRecord) {
  const value = c.proposed_value;
  if (c.field_key === "campaign_budget.amount_micros") return { path: "campaignBudgets:mutate", mask: "amount_micros", update: { resourceName: c.entity_id, amountMicros: String(value) } };
  if (c.entity_type === "ad") {
    if (c.field_key === "ad_group_ad.status") return { path: "adGroupAds:mutate", mask: "status", update: { resourceName: c.entity_id, status: String(value) } };
    if (c.field_key === "ad_group_ad.ad_group_ad_asset_automation_settings") return { path: "adGroupAds:mutate", mask: "ad_group_ad_asset_automation_settings", update: { resourceName: c.entity_id, adGroupAdAssetAutomationSettings: mutableAdValue(c.value_type, value) } };
    if (c.field_key === "ad.final_url") return { path: "ads:mutate", mask: "final_urls", update: { resourceName: c.entity_id, finalUrls: [String(value)] } };
    const legacyProperty = c.field_key.split(".")[1];
    const mask = ["path1", "path2", "headlines", "descriptions"].includes(legacyProperty) && c.field_key.split(".").length === 2 ? `responsive_search_ad.${legacyProperty}` : c.field_key.slice(3);
    return { path: "ads:mutate", mask, update: setNestedAdValue(c.entity_id, mask, mutableAdValue(c.value_type, value)) };
  }
  if (c.entity_type === "campaign") {
    const property = c.field_key.split(".")[1];
    return { path: "campaigns:mutate", mask: property, update: { resourceName: `customers/${customerId}/campaigns/${c.entity_id}`, [camel(property)]: value } };
  }
  const property = c.field_key.split(".")[1];
  return { path: "adGroups:mutate", mask: property, update: { resourceName: `customers/${customerId}/adGroups/${c.entity_id}`, [camel(property)]: property.endsWith("micros") ? String(value) : value } };
}

function mutableAdValue(valueType: string, value: unknown): unknown {
  if (valueType === "text_assets") return sanitizeAdTextAssets(value);
  if (valueType === "single_text_asset") return { text: String(value ?? "") };
  if (valueType === "asset_refs") return Array.isArray(value) ? value.map((asset) => ({ asset: String(asset) })) : [];
  if (valueType === "asset_ref") return { asset: String(value ?? "") };
  if (valueType === "boolean") return Boolean(value);
  if (valueType === "url_list") return Array.isArray(value) ? value.map(String) : [];
  if (valueType === "custom_parameters") return Array.isArray(value) ? value.map((item) => ({ key: String((item as ManagedCustomParameter)?.key ?? ""), value: String((item as ManagedCustomParameter)?.value ?? "") })) : [];
  if (valueType === "asset_automation_settings") return Array.isArray(value) ? value : [];
  return value;
}

function setNestedAdValue(resourceName: string, path: string, value: unknown): Record<string, unknown> {
  const update: Record<string, unknown> = { resourceName };
  const parts = path.split(".").map(camel);
  let target = update;
  for (const part of parts.slice(0, -1)) {
    const child: Record<string, unknown> = {};
    target[part] = child;
    target = child;
  }
  target[parts.at(-1) || path] = value;
  return update;
}

function camel(value: string) { return value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()); }
function assertWritesAllowed() {
  if (process.env.GOOGLE_ADS_MANAGEMENT_WRITES_ENABLED !== "true") throw new Error("Live Google Ads management writes are disabled.");
}

export function assertGoogleWritesAllowed(accountId: string) {
  const customerId = normalizeGoogleAccountId(accountId);
  if (!/^\d{10}$/.test(customerId)) throw new Error("Google Ads account ID must contain 10 digits.");
  assertWritesAllowed();
}
