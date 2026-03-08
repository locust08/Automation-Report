import { CampaignGroup, CampaignRow } from "@/lib/reporting/types";

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
  merged.costPerResult = safeDivide(merged.spend, merged.results);
  merged.avgCpc = safeDivide(merged.spend, merged.clicks);

  return merged;
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
