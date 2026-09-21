import { googleAdsClient } from "../google-ads/client";
import { getCredentials } from "@/lib/reporting/env";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";

type SearchTermMutation = { campaignId: string | null; adGroupId: string | null; searchTerm: string; action: string };
type PlacementMutation = { campaignId: string; placement: string; placementType: string };
const MAX_MUTATIONS_PER_REVIEW = 100;
async function context(customerIdInput: string) {
  const credentials = getCredentials();
  const customerId = customerIdInput.replace(/\D/g, "");
  const routing = await resolveGoogleManagerIdsFromNotion({ googleAccountIds: [customerId], notionAccessToken: credentials.notionAccessToken, notionDatabaseId: credentials.notionDatabaseId, fallbackLoginCustomerId: credentials.googleLoginCustomerId });
  const loginCustomerId = Object.hasOwn(routing.loginCustomerIdByAccount, customerId) ? routing.loginCustomerIdByAccount[customerId] : credentials.googleLoginCustomerId;
  return { client: googleAdsClient(credentials), customerId, loginCustomerId };
}

async function mutate(customerIdInput: string, service: string, operations: unknown[]) {
  if (!operations.length) return [];
  const { client, customerId, loginCustomerId } = await context(customerIdInput);
  const payload = await client.mutate(customerId, service, operations, { loginCustomerId, validateOnly: false });
  return payload.results ?? [];
}

async function existingKeywordKeys(customerIdInput: string, rows: SearchTermMutation[]) {
  const { client, customerId, loginCustomerId } = await context(customerIdInput);
  const adGroupIds = [...new Set(rows.flatMap((row) => row.adGroupId ? [row.adGroupId] : []))];
  if (!adGroupIds.length) return new Set<string>();
  const statusPayload = await client.request(`customers/${customerId}/googleAds:searchStream`, { query: `SELECT campaign.status, ad_group.id, ad_group.status FROM ad_group WHERE ad_group.id IN (${adGroupIds.join(",")})` }, { loginCustomerId });
  const statusRows=(statusPayload as Array<{results?:Array<{campaign?:{status?:string};adGroup?:{id?:string;status?:string}}>}>).flatMap(batch=>batch.results??[]);
  const statusByGroup=new Map(statusRows.flatMap(row=>row.adGroup?.id?[[row.adGroup.id,{campaign:row.campaign?.status,adGroup:row.adGroup.status}] as const]:[]));
  const inactive=adGroupIds.filter(id=>{const status=statusByGroup.get(id);return !status||status.campaign!=="ENABLED"||status.adGroup!=="ENABLED";});
  if(inactive.length)throw new Error(`Google Ads publishing stopped because ${inactive.length} target ad group(s) are paused, removed, or unavailable.`);
  const payload = await client.request(`customers/${customerId}/googleAds:searchStream`, { query: `SELECT ad_group.id, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group.id IN (${adGroupIds.join(",")}) AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'` }, { loginCustomerId });
  const batches = payload as Array<{ results?: Array<{ adGroup?: { id?: string }; adGroupCriterion?: { negative?: boolean; keyword?: { text?: string; matchType?: string } } }> }>;
  const rowsFromGoogle=batches.flatMap((batch)=>batch.results??[]);
  return new Set(rowsFromGoogle.flatMap((row) => {
    const groupId = row.adGroup?.id;
    const text = row.adGroupCriterion?.keyword?.text?.trim().toLowerCase();
    const matchType = row.adGroupCriterion?.keyword?.matchType;
    if (!groupId || !text || matchType !== "EXACT") return [];
    return [`${groupId}|${row.adGroupCriterion?.negative ? "negative exact" : "add exact"}|${text}`];
  }));
}

export async function publishSearchTermOptimizations(customerId: string, rows: SearchTermMutation[], options: { rejectPositiveExactOverlap?: boolean } = {}) {
  if (rows.length > MAX_MUTATIONS_PER_REVIEW) throw new Error(`Select no more than ${MAX_MUTATIONS_PER_REVIEW} search terms at a time.`);
  const normalized = customerId.replace(/\D/g, "");
  const uniqueRows = [...new Map(rows.map((row) => [`${row.adGroupId}|${row.action}|${row.searchTerm.trim().toLowerCase()}`, row])).values()];
  const existing = await existingKeywordKeys(normalized, uniqueRows);
  if (options.rejectPositiveExactOverlap) {
    const overlap = uniqueRows.find((row) => existing.has(`${row.adGroupId}|add exact|${row.searchTerm.trim().toLowerCase()}`));
    if (overlap) throw new Error(`Google Ads publishing stopped because “${overlap.searchTerm}” is already an enabled positive exact keyword in the target ad group.`);
  }
  const publishableRows = uniqueRows.filter((row) => !existing.has(`${row.adGroupId}|${row.action}|${row.searchTerm.trim().toLowerCase()}`));
  const operations = publishableRows.map((row) => {
    if (!row.adGroupId) throw new Error(`Search term “${row.searchTerm}” is missing its Google Ads ad group ID.`);
    const matchType = row.action === "negative phrase" ? "PHRASE" : "EXACT";
    return { create: { adGroup: `customers/${normalized}/adGroups/${row.adGroupId}`, negative: row.action !== "add exact", status: "ENABLED", keyword: { text: row.searchTerm, matchType } } };
  });
  const results = await mutate(normalized, "adGroupCriteria", operations);
  return {
    published: results.length,
    requested: rows.length,
    deduplicated: rows.length - publishableRows.length,
    resourceNames: results.flatMap((result) => {
      const resourceName = (result as { resourceName?: unknown })?.resourceName;
      return typeof resourceName === "string" ? [resourceName] : [];
    }),
  };
}

export async function publishPlacementExclusions(customerId: string, rows: PlacementMutation[]) {
  if (rows.length > MAX_MUTATIONS_PER_REVIEW) throw new Error(`Select no more than ${MAX_MUTATIONS_PER_REVIEW} placements at a time.`);
  const normalized = customerId.replace(/\D/g, "");
  const uniqueRows = [...new Map(rows.map((row) => [`${row.campaignId}|${row.placementType}|${row.placement.trim().toLowerCase()}`, row])).values()];
  const operations = uniqueRows.map((row) => {
    const campaign = `customers/${normalized}/campaigns/${row.campaignId}`;
    if (row.placementType === "YOUTUBE_CHANNEL") return { create: { campaign, negative: true, youtubeChannel: { channelId: row.placement } } };
    if (row.placementType === "YOUTUBE_VIDEO") return { create: { campaign, negative: true, youtubeVideo: { videoId: row.placement } } };
    if (row.placementType === "MOBILE_APPLICATION") return { create: { campaign, negative: true, mobileApplication: { appId: row.placement } } };
    return { create: { campaign, negative: true, placement: { url: row.placement } } };
  });
  const results = await mutate(normalized, "campaignCriteria", operations);
  return {
    published: results.length,
    resourceNames: results.flatMap((result) => {
      const resourceName = (result as { resourceName?: unknown })?.resourceName;
      return typeof resourceName === "string" ? [resourceName] : [];
    }),
  };
}
