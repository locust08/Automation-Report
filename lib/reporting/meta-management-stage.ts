export type MetaManagementStage = "campaigns" | "ad-groups" | "ads";
export type MetaManagementInsightLevel = "campaign" | "adset" | "ad";

export function parseMetaManagementStage(value: string | null): MetaManagementStage | null {
  return value === "campaigns" || value === "ad-groups" || value === "ads" ? value : null;
}

export function getMetaManagementInsightLevel(stage: MetaManagementStage): MetaManagementInsightLevel {
  if (stage === "campaigns") return "campaign";
  if (stage === "ad-groups") return "adset";
  return "ad";
}

export function getMetaManagementEntityId(
  stage: MetaManagementStage,
  row: { campaign_id?: string; adset_id?: string; ad_id?: string },
): string | null {
  const value = stage === "campaigns"
    ? row.campaign_id
    : stage === "ad-groups"
      ? row.adset_id
      : row.ad_id;
  return value?.trim() || null;
}
