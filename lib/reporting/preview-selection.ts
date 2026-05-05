import { PreviewCampaignNode, PreviewPlatformSection } from "@/lib/reporting/types";

export interface PreviewEntryRequest {
  platform: PreviewPlatformSection["platform"] | null;
  campaignId: string | null;
  campaignName: string | null;
}

export interface PreviewEntryResolution {
  status: "ready" | "empty" | "invalid-campaign";
  section: PreviewPlatformSection | null;
  campaign: PreviewCampaignNode | null;
  message: string | null;
}

export function resolvePreviewEntry(
  sections: PreviewPlatformSection[],
  request: PreviewEntryRequest
): PreviewEntryResolution {
  const section = pickPreviewSection(sections, request.platform);
  const requestedCampaign = Boolean(request.campaignId || request.campaignName);

  if (!section) {
    return {
      status: "empty",
      section: null,
      campaign: null,
      message: request.platform
        ? `No active ${platformLabel(request.platform)} campaigns are available for this preview.`
        : "No active campaigns are available for this preview.",
    };
  }

  if (requestedCampaign) {
    const campaign = findCampaign(section, request.campaignId, request.campaignName);
    if (!campaign) {
      return {
        status: "invalid-campaign",
        section,
        campaign: null,
        message: `The requested campaign could not be found in ${platformLabel(section.platform)} for the current account and date range.`,
      };
    }

    return {
      status: "ready",
      section,
      campaign,
      message: null,
    };
  }

  const campaign = section.campaigns[0] ?? null;
  if (!campaign) {
    return {
      status: "empty",
      section,
      campaign: null,
      message: `No active ${platformLabel(section.platform)} campaigns are available for this preview.`,
    };
  }

  return {
    status: "ready",
    section,
    campaign,
    message: null,
  };
}

export function findCampaign(
  section: PreviewPlatformSection,
  campaignId: string | null,
  campaignName: string | null
): PreviewCampaignNode | null {
  const normalizedCampaignId = campaignId?.trim() ?? "";
  if (normalizedCampaignId) {
    return section.campaigns.find((campaign) => campaign.id === normalizedCampaignId) ?? null;
  }

  const normalizedCampaignName = normalizeName(campaignName);
  if (!normalizedCampaignName) {
    return null;
  }

  return (
    section.campaigns.find((campaign) => normalizeName(campaign.name) === normalizedCampaignName) ??
    null
  );
}

function pickPreviewSection(
  sections: PreviewPlatformSection[],
  platform: PreviewPlatformSection["platform"] | null
): PreviewPlatformSection | null {
  if (platform) {
    return sections.find((section) => section.platform === platform) ?? null;
  }

  return sections.find((section) => section.campaigns.length > 0) ?? sections[0] ?? null;
}

function normalizeName(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function platformLabel(platform: PreviewPlatformSection["platform"]): string {
  return platform === "meta" ? "Meta Ads" : "Google Ads";
}
