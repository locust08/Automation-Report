import type { MetaManagementTab } from "@/lib/ads-management/meta-management-navigation";
import type { MetaManagementStage } from "@/lib/reporting/meta-management-stage";
import type { PreviewReportPayload } from "@/lib/reporting/types";

export function metaStageForTab(tab: MetaManagementTab): MetaManagementStage | null {
  if (tab === "campaigns") return "campaigns";
  if (tab === "ad_sets") return "ad-groups";
  if (tab === "ads") return "ads";
  return null;
}

export function isMetaCircuitBlocked(
  protection: PreviewReportPayload["metaProtection"],
  now: number,
): boolean {
  if (!protection?.circuitOpen) return false;
  if (!protection.blockedUntil) return true;
  return Date.parse(protection.blockedUntil) > now;
}
