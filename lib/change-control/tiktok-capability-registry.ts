import type { M03ValueType } from "./types";

export type M03TikTokEntityType = "campaign" | "ad_group" | "ad";
export type M03TikTokMutationMode = "direct_update" | "creative_replacement";
export type M03TikTokProviderResource = "campaign" | "adgroup" | "ad";

export type M03TikTokChangeField = {
  entity_type: M03TikTokEntityType;
  label: string;
  value_type: M03ValueType;
  field_path: string;
  mutation_mode: M03TikTokMutationMode;
  provider_resource: M03TikTokProviderResource;
  provider_field?: string;
};

export const M03_TIKTOK_CHANGE_FIELDS: readonly M03TikTokChangeField[] = [
  direct("campaign", "Campaign name", "string", "campaign.name", "campaign", "campaign_name"),
  direct("campaign", "Campaign status", "string", "campaign.status", "campaign", "operation_status"),
  direct("campaign", "Budget", "number", "campaign.budget.amount", "campaign", "budget"),
  direct("campaign", "Daily budget", "number", "campaign.budget.daily", "campaign", "budget"),
  direct("ad_group", "Ad group name", "string", "ad_group.name", "adgroup", "adgroup_name"),
  direct("ad_group", "Ad group status", "string", "ad_group.status", "adgroup", "operation_status"),
  direct("ad_group", "Budget", "number", "ad_group.budget.amount", "adgroup", "budget"),
  direct("ad_group", "Daily budget", "number", "ad_group.budget.daily", "adgroup", "budget"),
  direct("ad_group", "Start time", "string", "ad_group.schedule.start_time", "adgroup", "schedule_start_time"),
  direct("ad_group", "End time", "string", "ad_group.schedule.end_time", "adgroup", "schedule_end_time"),
  direct("ad_group", "Bid type", "string", "ad_group.bid.type", "adgroup", "bid_type"),
  direct("ad_group", "Bid amount", "number", "ad_group.bid.amount", "adgroup", "bid_price"),
  direct("ad_group", "Optimization goal", "string", "ad_group.optimization_goal", "adgroup", "optimization_goal"),
  direct("ad_group", "Billing event", "string", "ad_group.billing_event", "adgroup", "billing_event"),
  direct("ad_group", "Locations", "json", "ad_group.targeting.locations", "adgroup"),
  direct("ad_group", "Age groups", "json", "ad_group.targeting.age_groups", "adgroup"),
  direct("ad_group", "Placements", "json", "ad_group.placements.type", "adgroup"),
  direct("ad_group", "Pixel code", "string", "ad_group.conversion.pixel_code", "adgroup"),
  direct("ad_group", "Conversion event", "string", "ad_group.conversion.event", "adgroup"),
  direct("ad", "Ad name", "string", "ad.name", "ad", "ad_name"),
  direct("ad", "Ad status", "string", "ad.status", "ad", "operation_status"),
  direct("ad", "Primary text", "string", "ad.copy.primary_text", "ad", "ad_text"),
  direct("ad", "Call to action", "string", "ad.creative.call_to_action", "ad", "call_to_action"),
  direct("ad", "Destination URL", "string", "ad.creative.destination_url", "ad", "landing_page_url"),
  direct("ad", "Tracking URL", "string", "ad.creative.tracking_url", "ad", "tracking_url"),
  replacement("Video reference", "ad.creative.video_reference"),
  replacement("Identity reference", "ad.creative.identity_reference"),
  replacement("Creative format", "ad.creative.format"),
] as const;

export function m03TikTokChangeFieldsForEntity(entityType: M03TikTokEntityType) {
  return M03_TIKTOK_CHANGE_FIELDS.filter((field) => field.entity_type === entityType);
}

export function getM03TikTokChangeField(fieldPath: string) {
  const normalized = fieldPath.trim().toLowerCase();
  return M03_TIKTOK_CHANGE_FIELDS.find((field) => field.field_path === normalized);
}

function direct(entity_type: M03TikTokEntityType, label: string, value_type: M03ValueType, field_path: string, provider_resource: M03TikTokProviderResource, provider_field?: string): M03TikTokChangeField {
  return { entity_type, label, value_type, field_path, mutation_mode: "direct_update", provider_resource, provider_field };
}

function replacement(label: string, field_path: string): M03TikTokChangeField {
  return { entity_type: "ad", label, value_type: "string", field_path, mutation_mode: "creative_replacement", provider_resource: "ad" };
}
