export type TikTokManagementStage = "campaigns" | "ad-groups" | "ads" | "assets";

export function getTikTokManagementStagePlan(stage: TikTokManagementStage) {
  if (stage === "campaigns") return { objectActions: ["campaign.list"] as const, reportLevel: "campaign" as const, loadAssets: false };
  if (stage === "ad-groups") return { objectActions: ["campaign.list", "adgroup.list"] as const, reportLevel: "adgroup" as const, loadAssets: false };
  return { objectActions: ["campaign.list", "adgroup.list", "ad.list"] as const, reportLevel: "ad" as const, loadAssets: stage === "assets" };
}

export function parseTikTokManagementStage(value: string | null): TikTokManagementStage | null {
  return value === "campaigns" || value === "ad-groups" || value === "ads" || value === "assets" ? value : null;
}
