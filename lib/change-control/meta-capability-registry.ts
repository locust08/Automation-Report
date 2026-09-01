import type { M03ValueType } from "@/lib/change-control/types";

export type M03MetaEntityType = "campaign" | "ad_set" | "ad";
export type M03MetaMutationMode = "direct_update" | "creative_replacement";
export type M03MetaChangeField = {
  entity_type: M03MetaEntityType;
  label: string;
  value_type: M03ValueType;
  field_path: string;
  mutation_mode: M03MetaMutationMode;
  provider_resource: "campaign" | "adset" | "ad" | "adcreative";
  provider_field?: string;
};

export const M03_META_CHANGE_FIELDS: readonly M03MetaChangeField[] = [
  { entity_type: "campaign", label: "Campaign name", value_type: "string", field_path: "campaign.name", mutation_mode: "direct_update", provider_resource: "campaign", provider_field: "name" },
  { entity_type: "campaign", label: "Campaign status", value_type: "string", field_path: "campaign.status", mutation_mode: "direct_update", provider_resource: "campaign", provider_field: "status" },
  { entity_type: "campaign", label: "Daily budget", value_type: "number", field_path: "campaign.budget.daily", mutation_mode: "direct_update", provider_resource: "campaign", provider_field: "daily_budget" },
  { entity_type: "campaign", label: "Lifetime budget", value_type: "number", field_path: "campaign.budget.lifetime", mutation_mode: "direct_update", provider_resource: "campaign", provider_field: "lifetime_budget" },
  { entity_type: "campaign", label: "Bid strategy", value_type: "string", field_path: "campaign.bid.strategy", mutation_mode: "direct_update", provider_resource: "campaign", provider_field: "bid_strategy" },
  { entity_type: "ad_set", label: "Ad set name", value_type: "string", field_path: "ad_set.name", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "name" },
  { entity_type: "ad_set", label: "Ad set status", value_type: "string", field_path: "ad_set.status", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "status" },
  { entity_type: "ad_set", label: "Daily budget", value_type: "number", field_path: "ad_set.budget.daily", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "daily_budget" },
  { entity_type: "ad_set", label: "Lifetime budget", value_type: "number", field_path: "ad_set.budget.lifetime", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "lifetime_budget" },
  { entity_type: "ad_set", label: "Start time", value_type: "string", field_path: "ad_set.schedule.start_time", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "start_time" },
  { entity_type: "ad_set", label: "End time", value_type: "string", field_path: "ad_set.schedule.end_time", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "end_time" },
  { entity_type: "ad_set", label: "Bid strategy", value_type: "string", field_path: "ad_set.bid.strategy", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "bid_strategy" },
  { entity_type: "ad_set", label: "Bid amount", value_type: "number", field_path: "ad_set.bid.amount", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "bid_amount" },
  { entity_type: "ad_set", label: "Billing event", value_type: "string", field_path: "ad_set.billing_event", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "billing_event" },
  { entity_type: "ad_set", label: "Optimization goal", value_type: "string", field_path: "ad_set.optimization_goal", mutation_mode: "direct_update", provider_resource: "adset", provider_field: "optimization_goal" },
  { entity_type: "ad_set", label: "Attribution", value_type: "json", field_path: "ad_set.attribution.spec", mutation_mode: "direct_update", provider_resource: "adset" },
  { entity_type: "ad_set", label: "Locations", value_type: "json", field_path: "ad_set.targeting.geo_locations", mutation_mode: "direct_update", provider_resource: "adset" },
  { entity_type: "ad_set", label: "Placements", value_type: "json", field_path: "ad_set.placements.publisher_platforms", mutation_mode: "direct_update", provider_resource: "adset" },
  { entity_type: "ad", label: "Ad name", value_type: "string", field_path: "ad.name", mutation_mode: "direct_update", provider_resource: "ad", provider_field: "name" },
  { entity_type: "ad", label: "Ad status", value_type: "string", field_path: "ad.status", mutation_mode: "direct_update", provider_resource: "ad", provider_field: "status" },
  { entity_type: "ad", label: "Primary text (replacement)", value_type: "string", field_path: "ad.copy.primary_text", mutation_mode: "creative_replacement", provider_resource: "adcreative" },
  { entity_type: "ad", label: "Headline (replacement)", value_type: "string", field_path: "ad.copy.headline", mutation_mode: "creative_replacement", provider_resource: "adcreative" },
  { entity_type: "ad", label: "Description (replacement)", value_type: "string", field_path: "ad.copy.description", mutation_mode: "creative_replacement", provider_resource: "adcreative" },
  { entity_type: "ad", label: "Call to action (replacement)", value_type: "string", field_path: "ad.creative.call_to_action", mutation_mode: "creative_replacement", provider_resource: "adcreative" },
  { entity_type: "ad", label: "Destination URL (replacement)", value_type: "string", field_path: "ad.creative.destination_url", mutation_mode: "creative_replacement", provider_resource: "adcreative" },
] as const;

export function m03MetaChangeFieldsForEntity(entityType: M03MetaEntityType) {
  return M03_META_CHANGE_FIELDS.filter((field) => field.entity_type === entityType);
}

export function getM03MetaChangeField(fieldPath: string) {
  const normalized = fieldPath.trim().toLowerCase();
  return M03_META_CHANGE_FIELDS.find((field) => field.field_path === normalized);
}
