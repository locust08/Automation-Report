import type {
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewImageAsset,
  PreviewSitelinkAsset,
  PreviewTextAsset,
} from "@/lib/reporting/types";

export type AdsEditPlatform = "google" | "meta";

export type AdsSyncState = "idle" | "validating" | "syncing" | "synced" | "failed";

export interface AdsDraftLockedFields {
  platform: AdsEditPlatform;
  accountId: string;
  campaignId: string;
  adGroupId: string;
  adId: string;
  campaignType: string;
  adType: string;
  historicalMetrics: Record<string, string | number | null>;
}

export interface AdsDraftData {
  locked: AdsDraftLockedFields;
  campaignSettings: {
    campaignName: string;
    campaignStatus: string;
    adGroupName: string;
    adGroupStatus: string;
    adName: string;
    adStatus: string;
    budget: string;
    biddingStrategy: string;
    startDate: string;
    endDate: string;
    locations: string;
    languages: string;
  };
  adContent: {
    finalUrl: string;
    displayPathParts: string[];
    headlines: PreviewTextAsset[];
    descriptions: PreviewTextAsset[];
  };
  keywords: string[];
  assets: {
    images: PreviewImageAsset[];
    businessName: string;
    businessLogoUrl: string;
  };
  sitelinks: PreviewSitelinkAsset[];
}

export interface AdsDraftValidationIssue {
  path: string;
  message: string;
}

export interface AdsDraftValidationResult {
  valid: boolean;
  issues: AdsDraftValidationIssue[];
}

export interface AdsChange {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  reviewWarning?: boolean;
}

export interface AdsChangeSet {
  platform: AdsEditPlatform;
  accountId: string;
  campaignId: string;
  adGroupId: string;
  adId: string;
  changes: AdsChange[];
  warnings: string[];
  requestedAt: string;
}

export interface AdsSyncRequestBody {
  changeSet: AdsChangeSet;
}

export interface AdsSyncResponseBody {
  success: boolean;
  state: Exclude<AdsSyncState, "idle" | "validating" | "syncing">;
  message: string;
  warnings: string[];
  auditId: string;
  syncedChanges: number;
}

export function createAdsDraftFromPreview(input: {
  platform: AdsEditPlatform;
  accountId: string;
  campaign: PreviewCampaignNode;
  adGroup: PreviewAdGroupNode;
  ad: PreviewAdNode;
}): AdsDraftData {
  const campaignDetails = input.campaign.details;
  const adDetails = input.ad.details;

  return {
    locked: {
      platform: input.platform,
      accountId: input.accountId,
      campaignId: input.campaign.id,
      adGroupId: input.adGroup.id,
      adId: input.ad.id,
      campaignType: getDetailValue(campaignDetails, "Channel") || "Unknown",
      adType: getDetailValue(adDetails, "Ad Type") || getDetailValue(adDetails, "Type") || "Unknown",
      historicalMetrics: {
        impressions: input.ad.performance?.impressions ?? null,
        clicks: input.ad.performance?.clicks ?? null,
        spend: input.ad.performance?.spend ?? null,
        ctr: input.ad.performance?.ctr ?? null,
      },
    },
    campaignSettings: {
      campaignName: input.campaign.name,
      campaignStatus: input.campaign.status,
      adGroupName: input.adGroup.name,
      adGroupStatus: input.adGroup.status,
      adName: input.ad.name,
      adStatus: input.ad.status,
      budget: getDetailValue(campaignDetails, "Budget"),
      biddingStrategy: getDetailValue(campaignDetails, "Bidding Strategy"),
      startDate: getDetailValue(campaignDetails, "Start Date"),
      endDate: getDetailValue(campaignDetails, "End Date"),
      locations: getDetailValue(campaignDetails, "Locations"),
      languages: getDetailValue(campaignDetails, "Languages"),
    },
    adContent: {
      finalUrl: input.ad.finalUrl ?? "",
      displayPathParts: input.ad.displayPathParts ?? [],
      headlines: input.ad.headlines ?? [],
      descriptions: input.ad.descriptions ?? [],
    },
    keywords: input.ad.keywords ?? [],
    assets: {
      images: input.ad.images ?? [],
      businessName: input.ad.businessName ?? "",
      businessLogoUrl: input.ad.businessLogoUrl ?? "",
    },
    sitelinks: input.ad.sitelinks ?? [],
  };
}

function getDetailValue(fields: Array<{ label: string; value: string }>, label: string): string {
  return fields.find((field) => field.label === label)?.value ?? "";
}
