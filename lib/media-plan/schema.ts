export const SUPPORTED_CAMPAIGN_TYPE = "Search";
export const DEFAULT_TARGET_LOCATION = "Malaysia Nationwide";
export const DEFAULT_NETWORK = "Google Search Only";
export const DEFAULT_CAMPAIGN_STATUS = "PAUSED";

export const MEDIA_PLAN_LIMITS = {
  headline: 30,
  description: 90,
  displayPath: 15,
  sitelinks: 6,
  keywords: 10,
} as const;

export type MediaPlanStatus =
  | "Draft"
  | "Generating"
  | "Generated"
  | "Edited"
  | "Validation Error"
  | "Ready for Approval"
  | "Saving to Notion"
  | "Saved to Notion"
  | "Creating Google Ads Campaign"
  | "Created Paused"
  | "Failed";

export type MediaPlanCampaignObjective = "Leads" | "Sales" | "Website Traffic";
export type MediaPlanBiddingStrategy = "Conversions" | "Clicks";
export type MediaPlanLanguage = "English" | "Malay" | "Chinese";
export type MediaPlanKeywordMatchType = "BROAD" | "PHRASE" | "EXACT";

export interface MediaPlanFormData {
  websiteUrl: string;
  adBudget: string;
  googleCid: string;
  campaignType: string;
  specialRemarks: string;
  targetLocation: string;
  language: string;
}

export interface MediaPlanCampaign {
  campaignName: string;
  brandOrClientName: string;
  businessName: string;
  campaignObjective: MediaPlanCampaignObjective;
  campaignType: "Search";
  biddingStrategy: MediaPlanBiddingStrategy;
  websiteUrl: string;
  finalUrl: string;
  startDate: string;
  averageDailyBudget: number;
  targetCPA: number | null;
  network: ["Google Search Only"];
  networkNotes: string;
  targetLocation: string[];
  language: MediaPlanLanguage[];
}

export interface MediaPlanKeyword {
  text: string;
  matchType: MediaPlanKeywordMatchType;
}

export interface MediaPlanSitelink {
  title: string;
  url: string;
}

export interface MediaPlanAdGroup {
  adGroupName: string;
  intentType: string;
  keywords: MediaPlanKeyword[];
  displayPath1: string;
  displayPath2: string;
  headlines: string[];
  descriptions: string[];
  sitelinks: MediaPlanSitelink[];
}

export interface MediaPlanPlanningNotes {
  strategy: string;
  assumptions: string[];
  warnings: string[];
}

export interface MediaPlan {
  batchPreviewId: string;
  campaign: MediaPlanCampaign;
  adGroups: MediaPlanAdGroup[];
  planningNotes: MediaPlanPlanningNotes;
}

export interface MediaPlanGenerateRequest {
  websiteUrl: string;
  adBudget: string;
  googleCid: string;
  campaignType?: string;
  specialRemarks?: string;
  targetLocation?: string;
  language?: string;
}

export interface MediaPlanGenerateSuccessResponse {
  success: true;
  plan: MediaPlan;
  openAi: {
    responseId: string | null;
    model: string | null;
  };
}

export interface MediaPlanGenerateErrorResponse {
  success: false;
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

export type MediaPlanGenerateResponse =
  | MediaPlanGenerateSuccessResponse
  | MediaPlanGenerateErrorResponse;

export interface MediaPlanApproveRequest {
  mediaPlan: MediaPlan;
  googleCid: string;
  source: "media-plan";
  clientRequestId?: string;
  batchId?: string;
}

export interface MediaPlanApproveSuccessResponse {
  success: true;
  batchId: string;
  notionPageUrls: string[];
  createdRowCount: number;
  status: "ready_for_setup";
  duplicate: boolean;
}

export interface MediaPlanApproveErrorResponse {
  success: false;
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

export type MediaPlanApproveResponse =
  | MediaPlanApproveSuccessResponse
  | MediaPlanApproveErrorResponse;

export interface MediaPlanCreateCampaignRequest {
  batchId: string;
  googleCid: string;
}

export interface MediaPlanCreateCampaignSuccessResponse {
  success: true;
  source: "media-plan";
  batchId: string;
  customerId: string;
  campaignId: string;
  campaignResourceName: string;
  campaignStatus: "PAUSED";
  createdAdGroups: number;
  createdAds: number;
  googleAdsReviewLink: string;
  dryRun?: boolean;
}

export interface MediaPlanCreateCampaignFailureResponse {
  success: false;
  source?: "media-plan";
  batchId?: string;
  error: string;
  failedStep?: string;
  notionPageUrls?: string[];
  duplicate?: boolean;
}

export type MediaPlanCreateCampaignResponse =
  | MediaPlanCreateCampaignSuccessResponse
  | MediaPlanCreateCampaignFailureResponse;

export const DEFAULT_MEDIA_PLAN_FORM: MediaPlanFormData = {
  websiteUrl: "",
  adBudget: "",
  googleCid: "",
  campaignType: SUPPORTED_CAMPAIGN_TYPE,
  specialRemarks: "",
  targetLocation: DEFAULT_TARGET_LOCATION,
  language: "",
};

export const MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS = {
  defaultNetwork: DEFAULT_NETWORK,
  defaultCampaignStatus: DEFAULT_CAMPAIGN_STATUS,
  googleSearchOnlyRule:
    "This feature only supports Google Search campaigns. Do not generate Performance Max, Shopping, Video, Display, Demand Gen, or AI Max.",
  notionDatabaseContext:
    "Existing Notion database is Google Ads Ad Group Setup Requests. It uses one row per Google Search ad group. The generated media plan must be easy to map into the existing Notion fields.",
  characterLimits:
    "Headlines max 30 characters, descriptions max 90 characters, display paths max 15 characters each.",
} as const;

export const MEDIA_PLAN_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    batchPreviewId: { type: "string" },
    campaign: {
      type: "object",
      additionalProperties: false,
      properties: {
        campaignName: { type: "string" },
        brandOrClientName: { type: "string" },
        businessName: { type: "string" },
        campaignObjective: { type: "string", enum: ["Leads", "Sales", "Website Traffic"] },
        campaignType: { type: "string", enum: ["Search"] },
        biddingStrategy: { type: "string", enum: ["Conversions", "Clicks"] },
        websiteUrl: { type: "string" },
        finalUrl: { type: "string" },
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        averageDailyBudget: { type: "number" },
        targetCPA: { type: ["number", "null"] },
        network: {
          type: "array",
          items: { type: "string", enum: ["Google Search Only"] },
          minItems: 1,
          maxItems: 1,
        },
        networkNotes: { type: "string" },
        targetLocation: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        language: {
          type: "array",
          items: { type: "string", enum: ["English", "Malay", "Chinese"] },
          minItems: 1,
        },
      },
      required: [
        "campaignName",
        "brandOrClientName",
        "businessName",
        "campaignObjective",
        "campaignType",
        "biddingStrategy",
        "websiteUrl",
        "finalUrl",
        "startDate",
        "averageDailyBudget",
        "targetCPA",
        "network",
        "networkNotes",
        "targetLocation",
        "language",
      ],
    },
    adGroups: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          adGroupName: { type: "string" },
          intentType: { type: "string" },
          keywords: {
            type: "array",
            maxItems: MEDIA_PLAN_LIMITS.keywords,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                matchType: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"] },
              },
              required: ["text", "matchType"],
            },
          },
          displayPath1: { type: "string", maxLength: MEDIA_PLAN_LIMITS.displayPath },
          displayPath2: { type: "string", maxLength: MEDIA_PLAN_LIMITS.displayPath },
          headlines: {
            type: "array",
            minItems: 3,
            items: { type: "string", maxLength: MEDIA_PLAN_LIMITS.headline },
          },
          descriptions: {
            type: "array",
            minItems: 2,
            items: { type: "string", maxLength: MEDIA_PLAN_LIMITS.description },
          },
          sitelinks: {
            type: "array",
            maxItems: MEDIA_PLAN_LIMITS.sitelinks,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                url: { type: "string" },
              },
              required: ["title", "url"],
            },
          },
        },
        required: [
          "adGroupName",
          "intentType",
          "keywords",
          "displayPath1",
          "displayPath2",
          "headlines",
          "descriptions",
          "sitelinks",
        ],
      },
    },
    planningNotes: {
      type: "object",
      additionalProperties: false,
      properties: {
        strategy: { type: "string" },
        assumptions: {
          type: "array",
          items: { type: "string" },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["strategy", "assumptions", "warnings"],
    },
  },
  required: ["batchPreviewId", "campaign", "adGroups", "planningNotes"],
} as const;
