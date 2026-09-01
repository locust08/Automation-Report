import type { TikTokManagementStage } from "@/lib/reporting/tiktok-management-stage";

export const TIKTOK_MANAGEMENT_PRIMARY_TABS = ["campaigns", "ad_groups", "ads", "recommendations"] as const;
export type TikTokManagementTab = (typeof TIKTOK_MANAGEMENT_PRIMARY_TABS)[number] | "change_requests";

export function tiktokStageForTab(tab: TikTokManagementTab): TikTokManagementStage | null {
  if (tab === "campaigns") return "campaigns";
  if (tab === "ad_groups") return "ad-groups";
  if (tab === "ads") return "ads";
  return null;
}
