import { getCredentials } from "@/lib/reporting/env";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";

type SearchTermMutation = { campaignId: string | null; adGroupId: string | null; searchTerm: string; action: string };
type PlacementMutation = { campaignId: string; placement: string; placementType: string };
const MAX_MUTATIONS_PER_REVIEW = 100;
const MAX_RATE_LIMIT_RETRIES = 4;
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function context(customerIdInput: string) {
  const credentials = getCredentials();
  const customerId = customerIdInput.replace(/\D/g, "");
  if (!credentials.googleDeveloperToken) throw new Error("Google Ads developer token is unavailable.");
  let accessToken = credentials.googleAccessToken;
  if (credentials.googleRefreshToken && credentials.googleClientId && credentials.googleClientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: credentials.googleClientId, client_secret: credentials.googleClientSecret, refresh_token: credentials.googleRefreshToken, grant_type: "refresh_token" }), cache: "no-store" });
    const payload = await response.json() as { access_token?: string; error_description?: string };
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google OAuth refresh failed.");
    accessToken = payload.access_token;
  }
  if (!accessToken) throw new Error("Google Ads access credentials are unavailable.");
  const routing = await resolveGoogleManagerIdsFromNotion({ googleAccountIds:[customerId], notionAccessToken:credentials.notionAccessToken, notionDatabaseId:credentials.notionDatabaseId, fallbackLoginCustomerId:credentials.googleLoginCustomerId });
  return { credentials, customerId, accessToken, loginCustomerId:routing.loginCustomerIdByAccount[customerId]??credentials.googleLoginCustomerId };
}

async function mutate(customerIdInput: string, service: string, operations: unknown[]) {
  if (!operations.length) return [];
  const { credentials, customerId, accessToken, loginCustomerId } = await context(customerIdInput);
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const response = await fetch(`https://googleads.googleapis.com/${credentials.googleAdsApiVersion}/customers/${customerId}/${service}:mutate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "developer-token": credentials.googleDeveloperToken!, ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}), "content-type": "application/json" },
      body: JSON.stringify({ operations, partialFailure: false, validateOnly: false }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return (payload as { results?: unknown[] }).results ?? [];
    const details = JSON.stringify(payload);
    const rateLimited = response.status === 429 || /RESOURCE_(?:TEMPORARILY_)?EXHAUSTED/.test(details);
    if (!rateLimited || attempt === MAX_RATE_LIMIT_RETRIES) throw new Error(`Google Ads publish failed (${response.status}): ${details.slice(0, 1200)}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 1_000 * (2 ** attempt));
  }
  return [];
}

async function existingKeywordKeys(customerIdInput: string, rows: SearchTermMutation[]) {
  const { credentials, customerId, accessToken, loginCustomerId } = await context(customerIdInput);
  const adGroupIds = [...new Set(rows.flatMap((row) => row.adGroupId ? [row.adGroupId] : []))];
  if (!adGroupIds.length) return new Set<string>();
  const headers = { Authorization: `Bearer ${accessToken}`, "developer-token": credentials.googleDeveloperToken!, ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}), "content-type": "application/json" };
  const statusResponse = await fetch(`https://googleads.googleapis.com/${credentials.googleAdsApiVersion}/customers/${customerId}/googleAds:searchStream`, {
    method:"POST",headers,body:JSON.stringify({query:`SELECT campaign.status, ad_group.id, ad_group.status FROM ad_group WHERE ad_group.id IN (${adGroupIds.join(",")})`}),cache:"no-store",
  });
  const statusPayload=await statusResponse.json().catch(()=>({}));
  if(!statusResponse.ok)throw new Error(`Google Ads target validation failed (${statusResponse.status}): ${JSON.stringify(statusPayload).slice(0,1200)}`);
  const statusRows=(statusPayload as Array<{results?:Array<{campaign?:{status?:string};adGroup?:{id?:string;status?:string}}>}>).flatMap(batch=>batch.results??[]);
  const statusByGroup=new Map(statusRows.flatMap(row=>row.adGroup?.id?[[row.adGroup.id,{campaign:row.campaign?.status,adGroup:row.adGroup.status}] as const]:[]));
  const inactive=adGroupIds.filter(id=>{const status=statusByGroup.get(id);return !status||status.campaign!=="ENABLED"||status.adGroup!=="ENABLED";});
  if(inactive.length)throw new Error(`Google Ads publishing stopped because ${inactive.length} target ad group(s) are paused, removed, or unavailable.`);
  const response = await fetch(`https://googleads.googleapis.com/${credentials.googleAdsApiVersion}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `SELECT ad_group.id, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group.id IN (${adGroupIds.join(",")}) AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'` }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Ads duplicate check failed (${response.status}): ${JSON.stringify(payload).slice(0, 1200)}`);
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

export async function publishSearchTermOptimizations(customerId: string, rows: SearchTermMutation[]) {
  if (rows.length > MAX_MUTATIONS_PER_REVIEW) throw new Error(`Select no more than ${MAX_MUTATIONS_PER_REVIEW} search terms at a time.`);
  const normalized = customerId.replace(/\D/g, "");
  const uniqueRows = [...new Map(rows.map((row) => [`${row.adGroupId}|${row.action}|${row.searchTerm.trim().toLowerCase()}`, row])).values()];
  const existing = await existingKeywordKeys(normalized, uniqueRows);
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
  return mutate(normalized, "campaignCriteria", operations);
}
