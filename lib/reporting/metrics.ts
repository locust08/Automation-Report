import { CampaignGroup, CampaignRow } from "@/lib/reporting/types";

export const MIN_REPORTING_CAMPAIGN_SPEND = 1;

export function hasReportableCampaignSpend(row: Pick<CampaignRow, "spend">): boolean {
  return row.spend > MIN_REPORTING_CAMPAIGN_SPEND;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

export function computeDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export function emptyCampaignRow(
  id: string,
  platform: CampaignRow["platform"],
  campaignType: string,
  campaignName: string
): CampaignRow {
  return {
    id,
    platform,
    campaignType,
    campaignName,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpm: 0,
    results: 0,
    costPerResult: 0,
    spend: 0,
    conversions: 0,
    avgCpc: 0,
    youtubeEarnedLikes: 0,
    youtubeEarnedShares: 0,
  };
}

export function mergeCampaignRows(base: CampaignRow, incoming: CampaignRow): CampaignRow {
  const merged: CampaignRow = {
    ...base,
    impressions: base.impressions + incoming.impressions,
    clicks: base.clicks + incoming.clicks,
    spend: base.spend + incoming.spend,
    results: base.results + incoming.results,
    conversions: base.conversions + incoming.conversions,
    youtubeEarnedLikes: base.youtubeEarnedLikes + incoming.youtubeEarnedLikes,
    youtubeEarnedShares: base.youtubeEarnedShares + incoming.youtubeEarnedShares,
  };

  merged.ctr = safeDivide(merged.clicks * 100, merged.impressions);
  merged.cpm = safeDivide(merged.spend * 1000, merged.impressions);
  merged.costPerResult = safeDivide(
    merged.spend * resolveCostPerResultScale(base, incoming),
    merged.results
  );
  merged.avgCpc = safeDivide(merged.spend, merged.clicks);

  return merged;
}

function resolveCostPerResultScale(base: CampaignRow, incoming: CampaignRow): number {
  const baseHasResult = base.spend > 0 && base.results > 0 && base.costPerResult > 0;
  const incomingHasResult = incoming.spend > 0 && incoming.results > 0 && incoming.costPerResult > 0;
  const baseScale = inferCostPerResultScale(base);
  const incomingScale = inferCostPerResultScale(incoming);

  if (!baseHasResult) {
    return incomingScale;
  }

  if (!incomingHasResult) {
    return baseScale;
  }

  return approximatelyEqual(baseScale, incomingScale) ? baseScale : 1;
}

function inferCostPerResultScale(row: CampaignRow): number {
  if (row.spend <= 0 || row.results <= 0 || row.costPerResult <= 0) {
    return 1;
  }

  const unscaledCost = row.spend / row.results;
  if (unscaledCost <= 0) {
    return 1;
  }

  const observedScale = row.costPerResult / unscaledCost;
  return approximatelyEqual(observedScale, 1000) ? 1000 : 1;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.01);
}

export function buildGroups(rows: CampaignRow[]): CampaignGroup[] {
  const byGroup = new Map<string, CampaignRow[]>();

  rows.forEach((row) => {
    const key = `${row.platform}::${row.campaignType}`;
    const current = byGroup.get(key) ?? [];
    current.push(row);
    byGroup.set(key, current);
  });

  const groups: CampaignGroup[] = [];

  byGroup.forEach((groupRows, key) => {
    const [platform, campaignType] = key.split("::");
    const totals = groupRows.reduce(
      (acc, row) => mergeCampaignRows(acc, row),
      emptyCampaignRow(`${key}-totals`, rowPlatform(platform), campaignType, "Grand Total")
    );

    groups.push({
      id: key,
      platform: rowPlatform(platform),
      campaignType,
      rows: groupRows.sort((a, b) => b.spend - a.spend),
      totals,
    });
  });

  return groups.sort((a, b) => {
    if (a.platform === b.platform) {
      return a.campaignType.localeCompare(b.campaignType);
    }
    return a.platform.localeCompare(b.platform);
  });
}

function rowPlatform(value: string): CampaignRow["platform"] {
  if (value === "meta" || value === "google" || value === "googleYoutube") {
    return value;
  }
  return "meta";
}
