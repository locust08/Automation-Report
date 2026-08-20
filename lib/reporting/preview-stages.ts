import type {
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewPlatformSection,
  PreviewReportPayload,
} from "@/lib/reporting/types";

export function buildPreviewCampaignsStage(payload: PreviewReportPayload): PreviewReportPayload {
  return {
    ...payload,
    sections: payload.sections.map((section) => ({
      ...section,
      campaigns: section.campaigns
        .filter((campaign) => isActiveStatus(campaign.status))
        .map((campaign) => ({
          ...campaign,
          children: [],
        })),
    })),
  };
}

export function buildPreviewStructureStage(payload: PreviewReportPayload): PreviewReportPayload {
  return {
    ...payload,
    sections: payload.sections.map((section) => ({
      ...section,
      campaigns: section.campaigns
        .filter((campaign) => isActiveStatus(campaign.status))
        .map((campaign) => ({
          ...campaign,
          children: campaign.children
            .filter((child) => isActiveStatus(child.status))
            .map((child) => ({
              ...child,
              ads: child.ads
                .filter((ad) => isActiveStatus(ad.status))
                .map(stripPreviewAdAssets),
            })),
        })),
    })),
  };
}

export function buildPreviewAdGroupsStage(
  payload: PreviewReportPayload,
  selection: PreviewStageSelection
): PreviewReportPayload {
  return {
    ...payload,
    sections: mapSelectedCampaign(payload.sections, selection, (campaign) => ({
      ...campaign,
      children: campaign.children
        .filter((child) => isActiveStatus(child.status))
        .map((child) => ({
          ...child,
          ads: [],
        })),
    })),
  };
}

export function buildPreviewAdsStage(
  payload: PreviewReportPayload,
  selection: PreviewStageSelection
): PreviewReportPayload {
  return {
    ...payload,
    sections: mapSelectedCampaign(payload.sections, selection, (campaign) => ({
      ...campaign,
      children: campaign.children
        .filter((child) => child.id === selection.adGroupId || !selection.adGroupId)
        .filter((child) => isActiveStatus(child.status))
        .map((child) => ({
          ...child,
          ads: child.ads
            .filter((ad) => isActiveStatus(ad.status))
            .map(stripPreviewAdAssets),
        })),
    })),
  };
}

export function buildPreviewDetailsStage(
  payload: PreviewReportPayload,
  selection: PreviewStageSelection
): PreviewReportPayload {
  return {
    ...payload,
    sections: mapSelectedCampaign(payload.sections, selection, (campaign) => ({
      ...campaign,
      children: campaign.children
        .filter((child) => child.id === selection.adGroupId || !selection.adGroupId)
        .filter((child) => isActiveStatus(child.status))
        .map((child) => ({
          ...child,
          ads: child.ads
            .filter((ad) => ad.id === selection.adId || !selection.adId)
            .filter((ad) => isActiveStatus(ad.status)),
        })),
    })),
  };
}

export function getFirstPreviewCampaign(payload: PreviewReportPayload): {
  platform: "meta" | "google" | "tiktok";
  campaign: PreviewCampaignNode;
} | null {
  for (const section of payload.sections) {
    const campaign = section.campaigns.find((item) => isActiveStatus(item.status));
    if (campaign) {
      return { platform: section.platform, campaign };
    }
  }
  return null;
}

export function getFirstPreviewChild(payload: PreviewReportPayload): PreviewAdGroupNode | null {
  for (const section of payload.sections) {
    for (const campaign of section.campaigns) {
      const child = campaign.children.find((item) => isActiveStatus(item.status));
      if (child) {
        return child;
      }
    }
  }
  return null;
}

export function getFirstPreviewAd(payload: PreviewReportPayload): PreviewAdNode | null {
  for (const section of payload.sections) {
    for (const campaign of section.campaigns) {
      for (const child of campaign.children) {
        const ad = child.ads.find((item) => isActiveStatus(item.status));
        if (ad) {
          return ad;
        }
      }
    }
  }
  return null;
}

export interface PreviewStageSelection {
  platform: "meta" | "google" | "tiktok" | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
}

function mapSelectedCampaign(
  sections: PreviewPlatformSection[],
  selection: PreviewStageSelection,
  mapCampaign: (campaign: PreviewCampaignNode) => PreviewCampaignNode
): PreviewPlatformSection[] {
  return sections.map((section) => {
    if (selection.platform && section.platform !== selection.platform) {
      return { ...section, campaigns: [] };
    }

    return {
      ...section,
      campaigns: section.campaigns
        .filter((campaign) => campaign.id === selection.campaignId || !selection.campaignId)
        .filter((campaign) => isActiveStatus(campaign.status))
        .map(mapCampaign),
    };
  });
}

function stripPreviewAdAssets(ad: PreviewAdNode): PreviewAdNode {
  return {
    ...ad,
    creative: ad.creative
      ? {
          ...ad.creative,
          imageUrl: null,
          thumbnailUrl: null,
          videoUrl: null,
        }
      : ad.creative,
    images: [],
    businessLogoUrl: null,
    sitelinks: [],
    previewLinks: [],
  };
}

function isActiveStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return ![
    "paused",
    "deleted",
    "removed",
    "archived",
    "disabled",
    "inactive",
  ].some((blocked) => normalized.includes(blocked));
}
