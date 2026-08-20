import type { TikTokSetupObjective } from "../../lib/tiktok/setup-plan";

export function setupInput(objective: TikTokSetupObjective | "VIDEO_VIEWS" = "TRAFFIC") {
  const objectiveSettings = objective === "TRAFFIC"
    ? {
      objective: "TRAFFIC" as const,
      destination: "WEBSITE" as const,
      destinationUrl: "https://example.com/traffic?utm_source=tiktok",
      optimizationGoal: "TRAFFIC_LANDING_PAGE_VIEW" as const,
      billingEvent: "OCPM" as const,
    }
    : objective === "WEB_CONVERSIONS"
      ? {
        objective: "WEB_CONVERSIONS" as const,
        destination: "WEBSITE" as const,
        destinationUrl: "https://example.com/convert?utm_source=tiktok",
        optimizationGoal: "CONVERT" as const,
        billingEvent: "OCPM" as const,
        pixelId: "9001",
        optimizationEvent: "COMPLETE_PAYMENT",
      }
      : objective === "LEAD_GENERATION"
        ? {
          objective: "LEAD_GENERATION" as const,
          destination: "INSTANT_FORM" as const,
          promotionTargetType: "INSTANT_PAGE" as const,
          optimizationGoal: "LEAD_GENERATION" as const,
          billingEvent: "OCPM" as const,
          pageId: "8001",
        }
        : {
          objective: "VIDEO_VIEWS" as const,
          destination: "VIDEO" as const,
          optimizationGoal: "ENGAGED_VIEW" as const,
          billingEvent: "CPV" as const,
        };

  return {
    advertiser: {
      id: "123",
      name: "Primary Ads",
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
    },
    brief: {
      id: "brief-001",
      productOrOffer: "Approved offer",
      audienceSummary: "Adults interested in the approved offer",
      objective,
      primaryKpi: objective === "VIDEO_VIEWS" ? "Engaged views" : "Approved outcome",
    },
    mediaPlan: {
      id: "plan-001",
      clientName: "Example Client",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      totalApprovedBudget: 500,
      allocatedBudget: 375,
      approval: {
        status: "APPROVED" as const,
        reference: "approval-001",
        approvedBy: "Media Director",
        approvedAt: "2026-08-18T09:00:00+08:00",
      },
    },
    campaign: {
      name: `TikTok | ${objective} | 2026-09`,
      campaignType: "AUCTION" as const,
      automationMode: "MANUAL" as const,
      budgetOwner: "ADGROUP" as const,
      specialIndustries: [],
    },
    adGroups: [{
      key: "prospecting",
      name: "MY | Broad | Prospecting",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      dailyBudget: 100,
      budgetMode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET" as const,
      bidType: "BID_TYPE_NO_BID" as const,
      targeting: {
        validation: {
          status: "VALIDATED" as const,
          source: "TIKTOK_API" as const,
          advertiserId: "123",
          validatedAt: "2026-08-18T08:30:00+08:00",
        },
        locationIds: ["156"],
        placements: ["PLACEMENT_TIKTOK"] as ["PLACEMENT_TIKTOK"],
        searchResultEnabled: false as const,
        gender: "GENDER_UNLIMITED" as const,
        ageGroups: ["AGE_35_44", "AGE_25_34"],
        languageCodes: [],
        interestCategoryIds: [],
        audienceIds: [],
      },
      objectiveSettings,
      ads: [{
        key: "video-01",
        name: "Video 01",
        format: "SINGLE_VIDEO" as const,
        creativeMode: "REGULAR" as const,
        identity: { type: "CUSTOMIZED_USER" as const, identityId: "identity_1" },
        video: { videoId: "video_1" },
        adText: "Approved caption",
        callToAction: "LEARN_MORE",
      }],
    }],
  };
}

