import { createTikTokAdsClient, type TikTokAdsClient } from "@/lib/tiktok/ads-client";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";

export type TikTokSynchronizedResourceType = "campaign" | "ad_group" | "ad" | "identity" | "video" | "pixel";
export type TikTokSynchronizedResource = {
  id: string;
  type: TikTokSynchronizedResourceType;
  name: string;
  status: string | null;
  parent_id: string | null;
};

export async function discoverTikTokSynchronizedResources(input: {
  accountIdentity: string;
  type: TikTokSynchronizedResourceType;
  parentIdentity?: string | null;
  search?: string | null;
  client?: TikTokAdsClient;
}): Promise<{ resources: TikTokSynchronizedResource[]; provider_execution_locked: true }> {
  const advertiserId = input.accountIdentity.trim();
  if (!/^\d{1,32}$/.test(advertiserId)) throw new Error("Enter a valid TikTok advertiser ID.");
  const client = input.client ?? await createTikTokAdsClient();
  await client.validateReadableAdvertiser(advertiserId, true);
  const { action, filterKey } = discoveryAction(input.type);
  const request: Record<string, unknown> = { advertiser_id: advertiserId, page: 1, page_size: 100 };
  if (input.parentIdentity?.trim() && filterKey) request.filtering = { [filterKey]: [input.parentIdentity.trim()] };
  const response = await client.request(action, request);
  const search = input.search?.trim().toLowerCase() ?? "";
  const resources = collectRows(response.data)
    .map((row) => mapResource(input.type, row))
    .filter((row) => row.id && (!search || row.id.toLowerCase().includes(search) || row.name.toLowerCase().includes(search)))
    .slice(0, 50);
  return { resources, provider_execution_locked: true };
}

function discoveryAction(type: TikTokSynchronizedResourceType): { action: TikTokAdsActionName; filterKey?: string } {
  if (type === "campaign") return { action: "campaign.list" };
  if (type === "ad_group") return { action: "adgroup.list", filterKey: "campaign_ids" };
  if (type === "ad") return { action: "ad.list", filterKey: "adgroup_ids" };
  if (type === "identity") return { action: "identity.list" };
  if (type === "video") return { action: "asset.video-search" };
  return { action: "pixel.list" };
}

function collectRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["list", "data", "campaigns", "adgroups", "ads", "identities", "videos", "pixels"]) {
    const nested = row[key];
    if (Array.isArray(nested)) return collectRows(nested);
    if (nested && typeof nested === "object") {
      const found = collectRows(nested);
      if (found.length) return found;
    }
  }
  return [];
}

function mapResource(type: TikTokSynchronizedResourceType, row: Record<string, unknown>): TikTokSynchronizedResource {
  const idKeys: Record<TikTokSynchronizedResourceType, string[]> = {
    campaign: ["campaign_id", "id"], ad_group: ["adgroup_id", "id"], ad: ["ad_id", "id"],
    identity: ["identity_id", "id"], video: ["video_id", "id"], pixel: ["pixel_code", "pixel_id", "id"],
  };
  const nameKeys: Record<TikTokSynchronizedResourceType, string[]> = {
    campaign: ["campaign_name", "name"], ad_group: ["adgroup_name", "name"], ad: ["ad_name", "name"],
    identity: ["display_name", "identity_name", "name"], video: ["video_name", "file_name", "name"], pixel: ["pixel_name", "name"],
  };
  return {
    id: first(row, idKeys[type]),
    type,
    name: first(row, nameKeys[type]) || first(row, idKeys[type]) || `Unnamed TikTok ${type.replaceAll("_", " ")}`,
    status: first(row, ["operation_status", "secondary_status", "status"]) || null,
    parent_id: first(row, ["campaign_id", "adgroup_id"]) || null,
  };
}

function first(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (row[key] != null && String(row[key]).trim()) return String(row[key]);
  return "";
}
