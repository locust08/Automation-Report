import { fetchManagedSearchCampaigns } from "@/lib/ads-management/google";
import type { ManagedCampaign, ManagedFieldValue } from "@/lib/ads-management/types";
import { createM03ProviderAdapter } from "@/lib/change-control/provider-adapters";
import { canonicalM03Hash, m03BaselineKey, type M03ProviderAdapter, type M03ProviderBaseline } from "@/lib/change-control/provider-contract";
import type { M03ChangeItem, M03ChangeItemInput, M03Platform } from "@/lib/change-control/types";
import { getCredentials } from "@/lib/reporting/env";
import { createTikTokAdsClient, type TikTokAdsClient } from "@/lib/tiktok/ads-client";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";

type BaselineInput = { accountIdentity: string; campaignIdentity: string; items: Array<M03ChangeItem | M03ChangeItemInput> };
type BaselineDependencies = {
  google?: (input: BaselineInput) => Promise<Record<string, unknown>>;
  metaFetch?: typeof globalThis.fetch;
  tiktokClient?: TikTokAdsClient;
};

export function createM03OfficialProviderAdapter(platform: M03Platform, dependencies: BaselineDependencies = {}): M03ProviderAdapter {
  return createM03ProviderAdapter(platform, {
    retrieveBaseline: (input) => retrieveOfficialM03Baseline(platform, input, dependencies),
  });
}

export async function retrieveOfficialM03Baseline(platform: M03Platform, input: BaselineInput, dependencies: BaselineDependencies = {}): Promise<M03ProviderBaseline> {
  const canonical_payload = platform === "google"
    ? await (dependencies.google ?? retrieveGoogleBaseline)(input)
    : platform === "meta"
      ? await retrieveMetaBaseline(input, dependencies.metaFetch ?? globalThis.fetch)
      : await retrieveTikTokBaseline(input, dependencies.tiktokClient ?? await createTikTokAdsClient());
  return {
    platform,
    account_identity: input.accountIdentity,
    campaign_identity: input.campaignIdentity,
    captured_at: new Date().toISOString(),
    canonical_payload,
    payload_hash: canonicalM03Hash(canonical_payload),
    source: "provider",
  };
}

async function retrieveGoogleBaseline(input: BaselineInput) {
  const { campaigns } = await fetchManagedSearchCampaigns(input.accountIdentity);
  const campaign = campaigns.find((entry) => entry.id === input.campaignIdentity || entry.resourceName === input.campaignIdentity);
  if (!campaign) throw new Error("Google Ads did not return the exact campaign selected for this change request.");
  return mapRequestedValues(input.items, (item) => googleItemValue(campaign, item));
}

function googleItemValue(campaign: ManagedCampaign, item: M03ChangeItem | M03ChangeItemInput) {
  const fields = googleEntityFields(campaign, item);
  const aliases = googleFieldAliases(item.field_path);
  const field = fields.find((entry) => aliases.includes(entry.fieldKey.toLowerCase()));
  if (!field) throw new Error(`Google Ads baseline field is unavailable: ${item.field_path}`);
  return normalizeLikeBaseline(field.value, item.baseline_value);
}

function googleEntityFields(campaign: ManagedCampaign, item: M03ChangeItem | M03ChangeItemInput): ManagedFieldValue[] {
  if (item.entity_type === "campaign") return campaign.fields;
  const adGroup = campaign.adGroups.find((entry) => entry.id === item.entity_identity || entry.resourceName === item.entity_identity);
  if (item.entity_type === "ad_group") {
    if (!adGroup) throw new Error(`Google Ads ad group was not found: ${item.entity_identity}`);
    return adGroup.fields;
  }
  const ad = campaign.adGroups.flatMap((entry) => entry.ads).find((entry) => entry.id === item.entity_identity || entry.resourceName === item.entity_identity);
  if (!ad) throw new Error(`Google Ads ad was not found: ${item.entity_identity}`);
  return ad.fields;
}

function googleFieldAliases(path: string) {
  const normalized = path.toLowerCase();
  const aliases = [normalized];
  if (normalized.startsWith("campaign.budget.")) aliases.push(`campaign_budget.${normalized.split(".").at(-1)}`);
  if (normalized === "campaign.schedule.start_date") aliases.push("campaign.start_date");
  if (normalized === "campaign.schedule.end_date") aliases.push("campaign.end_date");
  if (normalized.startsWith("ad_group.bid.")) aliases.push(`ad_group.${normalized.split(".").at(-1)}`);
  if (normalized.startsWith("ad.copy.")) aliases.push(normalized.replace("ad.copy.", "ad."));
  if (normalized.startsWith("ad.creative.")) aliases.push(normalized.replace("ad.creative.", "ad."));
  return aliases;
}

async function retrieveMetaBaseline(input: BaselineInput, fetcher: typeof globalThis.fetch) {
  const token = getCredentials().metaAccessToken;
  if (!token) throw new Error("Meta credentials are unavailable for an official M03 baseline.");
  const byEntity = groupByEntity(input.items);
  const rows = new Map<string, Record<string, unknown>>();
  for (const [identity, items] of byEntity) {
    const entityType = items[0]?.entity_type ?? "campaign";
    const fields = metaFields(entityType);
    const url = new URL(`https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION?.trim() || "v24.0"}/${encodeURIComponent(identity)}`);
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("access_token", token);
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || payload.error) throw new Error(`Meta did not return the exact ${entityType} baseline.`);
    rows.set(identity, payload);
  }
  return mapRequestedValues(input.items, (item) => {
    const row = rows.get(item.entity_identity);
    const value = row ? deepGet(row, metaProviderPath(item.field_path, item.entity_type)) : undefined;
    if (value === undefined) throw new Error(`Meta baseline field is unavailable: ${item.field_path}`);
    return normalizeLikeBaseline(value, item.baseline_value);
  });
}

function metaFields(entityType: string) {
  if (entityType === "campaign") return ["id", "name", "status", "objective", "buying_type", "daily_budget", "lifetime_budget", "start_time", "stop_time", "special_ad_categories"];
  if (entityType === "ad_group" || entityType === "ad_set") return ["id", "name", "status", "daily_budget", "lifetime_budget", "start_time", "end_time", "bid_amount", "bid_strategy", "billing_event", "optimization_goal", "targeting", "promoted_object"];
  return ["id", "name", "status", "creative{id,name,title,body,object_story_spec,effective_object_story_id}"];
}

function metaProviderPath(path: string, entityType: string) {
  const normalized = path.toLowerCase();
  if (normalized.startsWith("ad.copy.") || normalized.startsWith("ad.creative.")) return `creative.${normalized.split(".").at(-1)}`;
  if (normalized.startsWith("campaign.budget.")) return normalized.endsWith("lifetime") || normalized.endsWith("lifetime_budget") ? "lifetime_budget" : "daily_budget";
  if (normalized === "campaign.schedule.start_date") return "start_time";
  if (normalized === "campaign.schedule.end_date") return "stop_time";
  if (normalized.startsWith("campaign.targeting.") || normalized.startsWith("campaign.placements.")) return `targeting.${normalized.split(".").at(-1)}`;
  if (normalized.startsWith("campaign.conversion.")) return `promoted_object.${normalized.split(".").at(-1)}`;
  if (entityType === "ad_group" || entityType === "ad_set") return normalized.replace(/^ad_(?:group|set)\./, "");
  return normalized.replace(/^campaign\./, "").replace(/^ad\./, "");
}

async function retrieveTikTokBaseline(input: BaselineInput, client: TikTokAdsClient) {
  await client.validateReadableAdvertiser(input.accountIdentity, true);
  const byEntity = groupByEntity(input.items);
  const rows = new Map<string, Record<string, unknown>>();
  for (const [identity, items] of byEntity) {
    const entityType = items[0]?.entity_type ?? "campaign";
    const { action, filterKey } = tiktokReadAction(entityType);
    const response = await client.request(action, {
      advertiser_id: input.accountIdentity,
      filtering: { [filterKey]: [identity] },
      page: 1,
      page_size: 1,
    });
    const row = findProviderRow(response.data, identity);
    if (!row) throw new Error(`TikTok did not return the exact ${entityType} baseline: ${identity}`);
    rows.set(identity, row);
  }
  return mapRequestedValues(input.items, (item) => {
    const row = rows.get(item.entity_identity);
    const value = row ? deepGet(row, tiktokProviderPath(item.field_path)) : undefined;
    if (value === undefined) throw new Error(`TikTok baseline field is unavailable: ${item.field_path}`);
    return normalizeLikeBaseline(value, item.baseline_value);
  });
}

function tiktokReadAction(entityType: string): { action: TikTokAdsActionName; filterKey: string } {
  if (entityType === "campaign") return { action: "campaign.get", filterKey: "campaign_ids" };
  if (entityType === "ad_group" || entityType === "adgroup") return { action: "adgroup.get", filterKey: "adgroup_ids" };
  return { action: "ad.get", filterKey: "ad_ids" };
}

function tiktokProviderPath(path: string) {
  const normalized = path.toLowerCase();
  const aliases: Record<string, string> = {
    "campaign.name": "campaign_name", "campaign.status": "operation_status",
    "campaign.budget.amount": "budget", "campaign.budget.daily": "budget",
    "campaign.schedule.start_date": "schedule_start_time", "campaign.schedule.end_date": "schedule_end_time",
    "ad_group.name": "adgroup_name", "ad_group.status": "operation_status",
    "ad.name": "ad_name", "ad.status": "operation_status",
  };
  if (aliases[normalized]) return aliases[normalized];
  if (normalized.startsWith("campaign.bid.") || normalized.startsWith("ad_group.bid.")) return normalized.split(".").at(-1) ?? normalized;
  if (normalized.startsWith("campaign.targeting.") || normalized.startsWith("campaign.placements.") || normalized.startsWith("campaign.conversion.")) return normalized.split(".").at(-1) ?? normalized;
  if (normalized.startsWith("ad.copy.") || normalized.startsWith("ad.creative.")) return normalized.split(".").at(-1) ?? normalized;
  return normalized.split(".").at(-1) ?? normalized;
}

function groupByEntity(items: Array<M03ChangeItem | M03ChangeItemInput>) {
  const groups = new Map<string, Array<M03ChangeItem | M03ChangeItemInput>>();
  for (const item of items) groups.set(item.entity_identity, [...(groups.get(item.entity_identity) ?? []), item]);
  return groups;
}

function mapRequestedValues(items: Array<M03ChangeItem | M03ChangeItemInput>, read: (item: M03ChangeItem | M03ChangeItemInput) => unknown) {
  return Object.fromEntries(items.map((item) => [m03BaselineKey(item), read(item)]));
}

function deepGet(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function normalizeLikeBaseline(value: unknown, reviewed: unknown) {
  if (typeof reviewed === "number") return Number(value);
  if (typeof reviewed === "boolean") return value === true || String(value).toLowerCase() === "true";
  if (reviewed === null) return value ?? null;
  return value;
}

function findProviderRow(value: unknown, identity: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const child of value) { const found = findProviderRow(child, identity); if (found) return found; }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (["campaign_id", "adgroup_id", "ad_id", "id"].some((key) => String(row[key] ?? "") === identity)) return row;
  for (const child of Object.values(row)) { const found = findProviderRow(child, identity); if (found) return found; }
  return null;
}
