import type { CampaignPlanStatus, CampaignPlanSummary, CampaignPlatform } from "./types";

export type CampaignPlatformFilter = "all" | CampaignPlatform;
export type CampaignStatusFilter = "all" | CampaignPlanStatus;

export function filterCampaigns(
  campaigns: CampaignPlanSummary[],
  platform: CampaignPlatformFilter,
  status: CampaignStatusFilter,
) {
  return campaigns.filter((campaign) => (
    (platform === "all" || campaign.platform === platform)
    && (status === "all" || campaign.status === status)
  ));
}

export function paginateCampaigns(campaigns: CampaignPlanSummary[], requestedPage: number, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(campaigns.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * pageSize;
  return { items: campaigns.slice(start, start + pageSize), page, pageCount, total: campaigns.length };
}

export function buildCampaignRows(campaigns: CampaignPlanSummary[], columns = 2) {
  const rows: CampaignPlanSummary[][] = [];
  for (let index = 0; index < campaigns.length; index += columns) rows.push(campaigns.slice(index, index + columns));
  return rows;
}
