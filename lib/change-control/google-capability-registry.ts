import type { M03ValueType } from "./types";

export type M03GoogleEntityType = "campaign" | "ad_group" | "ad" | "recommendation";
export type M03GoogleChangeField = {
  entity_type: M03GoogleEntityType;
  label: string;
  value_type: M03ValueType;
  field_path: string;
  mutation_mode: "direct_update" | "creative_replacement";
  provider_resource: string;
  source_field_key?: string;
};

export const M03_GOOGLE_CHANGE_FIELDS: readonly M03GoogleChangeField[] = [
  { entity_type: "campaign", label: "Campaign name", value_type: "string", field_path: "campaign.name", mutation_mode: "direct_update", provider_resource: "campaign" },
  { entity_type: "campaign", label: "Campaign status", value_type: "string", field_path: "campaign.status", mutation_mode: "direct_update", provider_resource: "campaign" },
  { entity_type: "campaign", label: "Daily budget", value_type: "number", field_path: "campaign.budget.amount_micros", mutation_mode: "direct_update", provider_resource: "campaign_budget", source_field_key: "campaign_budget.amount_micros" },
  { entity_type: "campaign", label: "Start date", value_type: "string", field_path: "campaign.schedule.start_date", mutation_mode: "direct_update", provider_resource: "campaign", source_field_key: "campaign.start_date" },
  { entity_type: "campaign", label: "End date", value_type: "string", field_path: "campaign.schedule.end_date", mutation_mode: "direct_update", provider_resource: "campaign", source_field_key: "campaign.end_date" },
  { entity_type: "ad_group", label: "Ad group name", value_type: "string", field_path: "ad_group.name", mutation_mode: "direct_update", provider_resource: "ad_group" },
  { entity_type: "ad_group", label: "Ad group status", value_type: "string", field_path: "ad_group.status", mutation_mode: "direct_update", provider_resource: "ad_group" },
  { entity_type: "ad_group", label: "CPC bid", value_type: "number", field_path: "ad_group.bid.cpc_bid_micros", mutation_mode: "direct_update", provider_resource: "ad_group", source_field_key: "ad_group.cpc_bid_micros" },
  { entity_type: "ad", label: "Headlines", value_type: "json", field_path: "ad.copy.headlines", mutation_mode: "creative_replacement", provider_resource: "ad_group_ad", source_field_key: "ad.headlines" },
  { entity_type: "ad", label: "Descriptions", value_type: "json", field_path: "ad.copy.descriptions", mutation_mode: "creative_replacement", provider_resource: "ad_group_ad", source_field_key: "ad.descriptions" },
  { entity_type: "ad", label: "Final URL", value_type: "string", field_path: "ad.creative.final_url", mutation_mode: "creative_replacement", provider_resource: "ad_group_ad", source_field_key: "ad.final_url" },
] as const;

export function googleChangeFieldsForEntity(entityType: M03GoogleEntityType) {
  return M03_GOOGLE_CHANGE_FIELDS.filter((field) => field.entity_type === entityType);
}

export function getM03GoogleChangeField(fieldPath: string) {
  const normalized = fieldPath.trim().toLowerCase();
  return M03_GOOGLE_CHANGE_FIELDS.find((field) => field.field_path === normalized);
}
