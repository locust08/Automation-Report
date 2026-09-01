import type { M03ProviderOperation } from "@/lib/change-control/provider-contract";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";

export type TikTokM03GuardedOperation = {
  action: TikTokAdsActionName;
  advertiser_id: string;
  payload: Record<string, unknown>;
  auto_retry_post: false;
};

/**
 * Converts an approved M03 operation into the existing guarded TikTok primitive contract.
 * This function only compiles a request. It does not call TikTok, and provider execution
 * remains blocked by the M03 deployment/platform/account/revision gate.
 */
export function compileTikTokM03Operation(operation: M03ProviderOperation, advertiserId: string): TikTokM03GuardedOperation {
  if (operation.platform !== "tiktok") throw new Error("Only TikTok operations can be compiled by the TikTok M03 adapter.");
  const proposed = asRecord(operation.payload.proposed_value);
  const identityKey = operation.provider_resource === "campaign" ? "campaign_id" : operation.provider_resource === "adgroup" ? "adgroup_id" : "ad_id";
  const identity = operation.resource_identity;

  if (operation.action === "create_inactive_replacement") {
    return guarded("ad.create", advertiserId, { ...proposed, operation_status: "DISABLE", previous_ad_id: identity, m03_operation_key: operation.operation_key });
  }
  if (operation.action === "verify_replacement") {
    return guarded("ad.get", advertiserId, { filtering: { ad_ids: ["$replacement_resource_id"] }, page: 1, page_size: 1, m03_operation_key: operation.operation_key });
  }
  if (operation.action === "activate_replacement") {
    return guarded("ad.status", advertiserId, { ad_ids: ["$replacement_resource_id"], operation_status: "ENABLE", m03_operation_key: operation.operation_key });
  }
  if (operation.action === "disable_previous") {
    return guarded("ad.status", advertiserId, { ad_ids: [identity], operation_status: "DISABLE", m03_operation_key: operation.operation_key });
  }

  const status = operation.field_path.endsWith(".status");
  const budget = operation.provider_resource === "adgroup" && operation.field_path.includes(".budget.");
  const action: TikTokAdsActionName = status
    ? operation.provider_resource === "campaign" ? "campaign.status" : operation.provider_resource === "adgroup" ? "adgroup.status" : "ad.status"
    : budget ? "adgroup.budget"
      : operation.provider_resource === "campaign" ? "campaign.update" : operation.provider_resource === "adgroup" ? "adgroup.update" : "ad.update";
  const value = operation.payload.proposed_value;
  const field = operation.field_path.split(".").at(-1) ?? operation.field_path;
  return guarded(action, advertiserId, {
    [identityKey]: identity,
    ...(status ? { operation_status: value } : { ...proposed, [field]: value }),
    m03_operation_key: operation.operation_key,
  });
}

function guarded(action: TikTokAdsActionName, advertiserId: string, payload: Record<string, unknown>): TikTokM03GuardedOperation {
  return { action, advertiser_id: advertiserId, payload: { advertiser_id: advertiserId, ...payload }, auto_retry_post: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
