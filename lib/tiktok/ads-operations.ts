import crypto from "node:crypto";

import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import { TIKTOK_ADS_ACTIONS } from "@/lib/tiktok/ads-actions";
import { TikTokAdsApiError, type TikTokAdsClient } from "@/lib/tiktok/ads-client";
import {
  TikTokAuctionObjectiveSchema,
  validateTikTokMutationPayload,
  type TikTokAuctionObjective,
} from "@/lib/tiktok/ads-schemas";

function stableNumericRequestId(value: unknown) {
  const hex = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 13);
  return Number.parseInt(hex, 16).toString();
}

function withSafeCreateDefaults(action: TikTokAdsActionName, input: Record<string, unknown>) {
  const payload = structuredClone(input);
  if (["campaign.create", "adgroup.create", "ad.create", "spark.create"].includes(action)) {
    if (payload.operation_status === undefined) payload.operation_status = "DISABLE";
    if (payload.request_id === undefined && action !== "spark.create") {
      payload.request_id = stableNumericRequestId({ action, payload });
    }
  }
  return payload;
}

export function prepareTikTokMutationPayload(
  action: TikTokAdsActionName,
  advertiserId: string,
  input: Record<string, unknown>,
) {
  if (!TIKTOK_ADS_ACTIONS[action].mutation) {
    throw new Error(`${action} is not a TikTok mutation`);
  }
  const payload = withSafeCreateDefaults(action, { ...input, advertiser_id: advertiserId });
  const helperObjective = action === "campaign.create" ? undefined : payload.objective_type;
  if (action !== "campaign.create") delete payload.objective_type;
  const validated = validateTikTokMutationPayload(action, payload);
  return {
    payload: validated,
    helperObjective: typeof helperObjective === "string"
      ? TikTokAuctionObjectiveSchema.parse(helperObjective)
      : undefined,
  };
}

function findFirstString(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey === key && (typeof child === "string" || typeof child === "number")) {
      return String(child);
    }
    const found = findFirstString(child, key);
    if (found) return found;
  }
  return undefined;
}

function includesId(value: unknown, key: string, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => includesId(item, key, expected));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([childKey, child]) => (
    (childKey === key && String(child) === expected) || includesId(child, key, expected)
  ));
}

async function requireAsset(params: {
  client: TikTokAdsClient;
  action: TikTokAdsActionName;
  advertiserId: string;
  idKey: string;
  idValue: string;
  extra?: Record<string, unknown>;
}) {
  const result = await params.client.request(params.action, {
    advertiser_id: params.advertiserId,
    ...(["app.list", "store.list"].includes(params.action) ? {} : { page: 1, page_size: 1000 }),
    ...params.extra,
  });
  if (!includesId(result.data, params.idKey, params.idValue)) {
    throw new Error(`Required TikTok asset is not available: ${params.idKey}=${params.idValue}`);
  }
  return { action: params.action, id: params.idValue, status: "available" as const };
}

async function resolveObjective(params: {
  client: TikTokAdsClient;
  advertiserId: string;
  action: TikTokAdsActionName;
  payload: Record<string, unknown>;
  helperObjective?: TikTokAuctionObjective;
}) {
  if (params.action === "campaign.create") {
    return TikTokAuctionObjectiveSchema.parse(params.payload.objective_type);
  }
  if (params.helperObjective) return params.helperObjective;
  const campaignId = params.payload.campaign_id;
  if (typeof campaignId !== "string") return undefined;
  const campaign = await params.client.request("campaign.get", {
    advertiser_id: params.advertiserId,
    filtering: { campaign_ids: [campaignId] },
    page: 1,
    page_size: 1,
  });
  const objective = findFirstString(campaign.data, "objective_type");
  return objective ? TikTokAuctionObjectiveSchema.safeParse(objective).data : undefined;
}

export async function preflightTikTokMutation(params: {
  client: TikTokAdsClient;
  advertiserId: string;
  action: TikTokAdsActionName;
  payload: Record<string, unknown>;
  helperObjective?: TikTokAuctionObjective;
}) {
  const objective = await resolveObjective(params);
  const checks: Array<Record<string, unknown>> = [];
  if (!objective || !["adgroup.create", "ad.create", "spark.create"].includes(params.action)) {
    return { objective, checks };
  }

  const payload = params.payload;
  if (objective === "APP_PROMOTION") {
    const appId = findFirstString(payload, "app_id");
    if (!appId) throw new Error("APP_PROMOTION requires app_id in the create specification");
    checks.push(await requireAsset({
      client: params.client, action: "app.list", advertiserId: params.advertiserId,
      idKey: "app_id", idValue: appId,
    }));
  }
  if (objective === "WEB_CONVERSIONS") {
    const pixelId = findFirstString(payload, "pixel_id");
    if (!pixelId) throw new Error("WEB_CONVERSIONS requires pixel_id in the create specification");
    checks.push(await requireAsset({
      client: params.client, action: "pixel.list", advertiserId: params.advertiserId,
      idKey: "pixel_id", idValue: pixelId,
    }));
  }
  if (objective === "LEAD_GENERATION") {
    const target = findFirstString(payload, "promotion_target_type");
    const pageId = findFirstString(payload, "page_id");
    if (target === "INSTANT_PAGE") {
      if (!pageId) throw new Error("Instant-form LEAD_GENERATION requires page_id");
      await params.client.request("lead-form.get", {
        advertiser_id: params.advertiserId,
        page_id: pageId,
      });
      checks.push({ action: "lead-form.get", id: pageId, status: "available" });
    }
  }
  if (objective === "PRODUCT_SALES") {
    const storeId = findFirstString(payload, "store_id");
    const catalogId = findFirstString(payload, "catalog_id");
    if (!storeId && !catalogId) {
      throw new Error("PRODUCT_SALES requires an available store_id or catalog_id");
    }
    if (storeId) {
      checks.push(await requireAsset({
        client: params.client, action: "store.list", advertiserId: params.advertiserId,
        idKey: "store_id", idValue: storeId,
      }));
    }
    if (catalogId) {
      const businessCenterId = findFirstString(payload, "catalog_authorized_bc_id")
        ?? findFirstString(payload, "bc_id");
      if (!businessCenterId) {
        throw new Error("Catalog PRODUCT_SALES requires catalog_authorized_bc_id or bc_id");
      }
      checks.push(await requireAsset({
        client: params.client, action: "catalog.list", advertiserId: params.advertiserId,
        idKey: "catalog_id", idValue: catalogId, extra: { bc_id: businessCenterId, catalog_id: catalogId },
      }));
    }
  }
  return { objective, checks };
}

export async function checkTikTokAdvertiserCapabilities(params: {
  client: TikTokAdsClient;
  advertiserId: string;
  startDate?: string;
  endDate?: string;
}) {
  const probes: Array<{
    capability: string;
    action: TikTokAdsActionName;
    input: Record<string, unknown>;
  }> = [
    { capability: "account", action: "account.get", input: { advertiser_ids: [params.advertiserId] } },
    { capability: "campaign_management", action: "campaign.list", input: { page: 1, page_size: 1 } },
    { capability: "adgroup_management", action: "adgroup.list", input: { page: 1, page_size: 1 } },
    { capability: "ad_management", action: "ad.list", input: { page: 1, page_size: 1 } },
    { capability: "images", action: "asset.image-search", input: { page: 1, page_size: 1 } },
    { capability: "videos", action: "asset.video-search", input: { page: 1, page_size: 1 } },
    { capability: "pixels", action: "pixel.list", input: { page: 1, page_size: 1 } },
    { capability: "apps", action: "app.list", input: {} },
    { capability: "stores", action: "store.list", input: {} },
    { capability: "identities", action: "identity.list", input: { page: 1, page_size: 1 } },
    { capability: "spark_posts", action: "spark.list", input: { page: 1, page_size: 1 } },
  ];
  if (params.startDate && params.endDate) {
    probes.push({
      capability: "reporting",
      action: "report.sync",
      input: {
        report_type: "BASIC",
        data_level: "AUCTION_ADVERTISER",
        dimensions: ["advertiser_id"],
        metrics: ["spend", "impressions", "clicks"],
        start_date: params.startDate,
        end_date: params.endDate,
        page: 1,
        page_size: 1,
      },
    });
  }
  const results = [];
  for (const probe of probes) {
    try {
      const response = await params.client.request(probe.action, {
        advertiser_id: params.advertiserId,
        ...probe.input,
      });
      results.push({
        capability: probe.capability,
        status: "available",
        request_id: response.requestId,
      });
    } catch (error) {
      results.push({
        capability: probe.capability,
        status: error instanceof TikTokAdsApiError ? "unavailable" : "unknown",
        provider_code: error instanceof TikTokAdsApiError ? error.details.providerCode : undefined,
        request_id: error instanceof TikTokAdsApiError ? error.details.requestId : undefined,
      });
    }
  }
  results.push({
    capability: "lead_forms",
    status: "requires_page_id",
  });
  results.push({
    capability: "catalogs",
    status: "requires_bc_id",
  });
  return results;
}

export async function verifyTikTokMutation(params: {
  client: TikTokAdsClient;
  advertiserId: string;
  action: TikTokAdsActionName;
  input: Record<string, unknown>;
  resultIds: Record<string, string>;
}) {
  let action: TikTokAdsActionName | undefined;
  let filtering: Record<string, unknown> | undefined;
  if (params.resultIds.campaign_id) {
    action = "campaign.get";
    filtering = { campaign_ids: [params.resultIds.campaign_id] };
  }
  if (params.resultIds.adgroup_id) {
    action = "adgroup.get";
    filtering = { adgroup_ids: [params.resultIds.adgroup_id] };
  }
  if (params.resultIds.ad_id) {
    action = "ad.get";
    filtering = { ad_ids: [params.resultIds.ad_id] };
  }
  if (params.action === "spark.authorize") {
    action = "spark.list";
    filtering = undefined;
  }
  if (!action) return { status: "not_applicable" as const };
  try {
    const response = await params.client.request(action, {
      advertiser_id: params.advertiserId,
      filtering,
      page: 1,
      page_size: params.action === "spark.authorize" ? 100 : 1,
    });
    return {
      status: "verified" as const,
      action,
      request_id: response.requestId,
      result: response.data,
    };
  } catch (error) {
    return {
      status: "verification_unavailable" as const,
      action,
      provider_code: error instanceof TikTokAdsApiError ? error.details.providerCode : undefined,
      request_id: error instanceof TikTokAdsApiError ? error.details.requestId : undefined,
    };
  }
}

