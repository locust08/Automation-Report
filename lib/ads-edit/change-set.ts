import type { AdsChange, AdsChangeSet, AdsDraftData } from "@/lib/ads-edit/types";

const LOCKED_TOP_LEVEL_KEYS = new Set(["locked"]);

const LABELS: Record<string, string> = {
  "campaignSettings.campaignName": "Campaign name",
  "campaignSettings.campaignStatus": "Campaign status",
  "campaignSettings.adGroupName": "Ad group name",
  "campaignSettings.adGroupStatus": "Ad group status",
  "campaignSettings.adName": "Ad name",
  "campaignSettings.adStatus": "Ad status",
  "campaignSettings.budget": "Budget",
  "campaignSettings.biddingStrategy": "Bidding strategy",
  "campaignSettings.startDate": "Start date",
  "campaignSettings.endDate": "End date",
  "campaignSettings.locations": "Locations",
  "campaignSettings.languages": "Languages",
  "adContent.finalUrl": "Final URL",
  "adContent.displayPathParts": "Display path",
  "adContent.headlines": "Headlines",
  "adContent.descriptions": "Descriptions",
  keywords: "Keywords",
  "assets.images": "Images",
  "assets.businessName": "Business name",
  "assets.businessLogoUrl": "Business logo URL",
  sitelinks: "Site links",
};

export function buildAdsChangeSet(originalData: AdsDraftData, draftData: AdsDraftData): AdsChangeSet {
  assertLockedFieldsMatch(originalData, draftData);

  const changes: AdsChange[] = [];
  collectChanges("", originalData, draftData, changes);

  const warnings = changes.some((change) => change.reviewWarning)
    ? ["Ad content or assets changed. Google Ads or Meta Ads may send affected ads/assets back through review before serving."]
    : [];

  return {
    platform: originalData.locked.platform,
    accountId: originalData.locked.accountId,
    campaignId: originalData.locked.campaignId,
    adGroupId: originalData.locked.adGroupId,
    adId: originalData.locked.adId,
    changes,
    warnings,
    requestedAt: new Date().toISOString(),
  };
}

function collectChanges(path: string, originalValue: unknown, draftValue: unknown, changes: AdsChange[]) {
  const topLevelKey = path.split(".")[0];
  if (LOCKED_TOP_LEVEL_KEYS.has(topLevelKey)) {
    return;
  }

  if (path && isTrackedLeaf(path)) {
    if (!isEqual(originalValue, draftValue)) {
      changes.push({
        path,
        label: LABELS[path] ?? humanizePath(path),
        before: originalValue,
        after: draftValue,
        reviewWarning: path.startsWith("adContent.") || path.startsWith("assets.") || path === "sitelinks",
      });
    }
    return;
  }

  if (!isPlainObject(originalValue) || !isPlainObject(draftValue)) {
    return;
  }

  const keys = new Set([...Object.keys(originalValue), ...Object.keys(draftValue)]);
  keys.forEach((key) => {
    const nextPath = path ? `${path}.${key}` : key;
    collectChanges(nextPath, originalValue[key], draftValue[key], changes);
  });
}

function isTrackedLeaf(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(LABELS, path);
}

function assertLockedFieldsMatch(originalData: AdsDraftData, draftData: AdsDraftData) {
  if (!isEqual(originalData.locked, draftData.locked)) {
    throw new Error("Locked identifiers were changed. Reload the draft before syncing.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function humanizePath(path: string): string {
  return path
    .split(".")
    .map((part) => part.replace(/([A-Z])/g, " $1"))
    .join(" / ");
}
