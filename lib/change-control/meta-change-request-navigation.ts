import { M03_META_CHANGE_FIELDS, type M03MetaChangeField } from "@/lib/change-control/meta-capability-registry";

export type MetaChangeRequestNavigationFilter = "requests" | "campaign" | "ad_set" | "ad" | "creative";

export function metaChangeFieldsForNavigationFilter(filter: MetaChangeRequestNavigationFilter): readonly M03MetaChangeField[] {
  if (filter === "requests") return [];
  if (filter === "creative") return M03_META_CHANGE_FIELDS.filter((field) => field.mutation_mode === "creative_replacement");
  return M03_META_CHANGE_FIELDS.filter((field) => field.entity_type === filter && field.mutation_mode === "direct_update");
}
