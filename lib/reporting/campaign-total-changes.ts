import { computeDelta, emptyCampaignRow, mergeCampaignRows } from "@/lib/reporting/metrics";
import type { CampaignRow } from "@/lib/reporting/types";
export const totalChangeKeys = ["impressions", "clicks", "ctr", "cpm", "results", "costPerResult", "spend"] as const;
export function campaignTotalChanges(current: CampaignRow, previousRows?: CampaignRow[], currentRowCount = 1): Record<string, number | null> {
  const previous = previousRows?.reduce((sum,row) => mergeCampaignRows(sum,row), emptyCampaignRow("previous", current.platform, current.campaignType, "Previous"));
  return Object.fromEntries(totalChangeKeys.map(key => {
    let delta = previous ? computeDelta(current[key],previous[key]) : null;
    if (["ctr", "cpm"].includes(key) && (!current.impressions || !previous?.impressions)) delta = null;
    if (key === "results" || key === "costPerResult") {
      if (current.resultLabel === "Mixed" || previous?.resultLabel === "Mixed" || current.resultLabel && previous?.resultLabel && current.resultLabel !== previous.resultLabel) delta = null;
      const unique = /reach|ad recall/i.test(current.resultLabel ?? "") || /reach|estimated_ad_recallers/i.test(current.resultActionType ?? "");
      if (unique && (currentRowCount > 1 || (previousRows?.length ?? 0) > 1)) delta = null;
      if (current.resultActionType && previous?.resultActionType && current.resultActionType !== previous.resultActionType) delta = null;
      if (key === "costPerResult" && (!current.results || !previous?.results)) delta = null;
    }
    return [key,delta];
  }));
}
