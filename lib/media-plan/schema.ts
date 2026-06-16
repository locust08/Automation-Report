export const SUPPORTED_CAMPAIGN_TYPE = "Search";
export const DEFAULT_TARGET_LOCATION = "Malaysia Nationwide";
export const DEFAULT_MEDIA_PLAN_LANGUAGE = "English";
export const DEFAULT_NETWORK = "Google Search Only";
export const DEFAULT_CAMPAIGN_STATUS = "PAUSED";

export const MEDIA_PLAN_TARGET_LOCATION_OPTIONS = [
  "Malaysia Nationwide",
  "Selangor",
  "Kuala Lumpur",
  "Johor",
  "Penang",
  "Perak",
  "Pahang",
  "Negeri Sembilan",
  "Melaka",
  "Kedah",
  "Kelantan",
  "Terengganu",
  "Perlis",
  "Sabah",
  "Sarawak",
  "Putrajaya",
  "Labuan",
] as const;

export const MEDIA_PLAN_LANGUAGE_OPTIONS = ["English", "Malay", "Chinese"] as const;

export const MEDIA_PLAN_LIMITS = {
  headline: 30,
  description: 90,
  displayPath: 15,
  sitelinks: 6,
  keywords: 10,
  assetFileBytes: 5 * 1024 * 1024,
  productServiceImages: 10,
} as const;

export const MEDIA_PLAN_ASSET_ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg"] as const;

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
export type MediaPlanLanguage = (typeof MEDIA_PLAN_LANGUAGE_OPTIONS)[number];
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

export type MediaPlanAssetKind = "logo" | "productServiceImage";

export interface MediaPlanAsset {
  id: string;
  kind: MediaPlanAssetKind;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  fileUploadId?: string;
}

export interface MediaPlanAssets {
  logo: MediaPlanAsset[];
  productServiceImages: MediaPlanAsset[];
}

export interface MediaPlan {
  batchPreviewId: string;
  campaign: MediaPlanCampaign;
  adGroups: MediaPlanAdGroup[];
  planningNotes: MediaPlanPlanningNotes;
  assets?: MediaPlanAssets;
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

export type MediaPlanGenerationStatus = "queued" | "in_progress" | "completed";
export type MediaPlanOperation = "generate" | "approve_create";
export type MediaPlanOperationStatus = "idle" | "running" | "completed" | "failed";
export type MediaPlanProgressStepStatus = "pending" | "in_progress" | "completed" | "failed";

export interface MediaPlanProgressStep {
  id: string;
  label: string;
  status: MediaPlanProgressStepStatus;
}

export interface MediaPlanOperationProgress {
  operation: MediaPlanOperation;
  title: string;
  status: MediaPlanOperationStatus;
  statusLabel: string;
  steps: MediaPlanProgressStep[];
  percent: number;
  startedAt: string;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  message?: string;
}

export type MediaPlanProgressStreamEvent =
  | { type: "progress"; progress: MediaPlanOperationProgress }
  | { type: "result"; result: MediaPlanApproveAndCreateResponse }
  | {
      type: "error";
      error: string;
      issues?: Array<{ path: string; message: string }>;
      failedStep?: string;
      progress?: MediaPlanOperationProgress;
    };

export interface MediaPlanGenerateOpenAIMeta {
  responseId: string | null;
  model: string | null;
  startedAt?: string | null;
  status?: MediaPlanGenerationStatus | string | null;
}

export interface MediaPlanGenerateCompletedResponse {
  success: true;
  status: "completed";
  plan: MediaPlan;
  openAi: MediaPlanGenerateOpenAIMeta;
  progress?: MediaPlanOperationProgress;
}

export interface MediaPlanGeneratePendingResponse {
  success: true;
  status: Exclude<MediaPlanGenerationStatus, "completed">;
  openAi: MediaPlanGenerateOpenAIMeta & {
    responseId: string;
  };
  progress?: MediaPlanOperationProgress;
}

export interface MediaPlanGenerateErrorResponse {
  success: false;
  error: string;
  issues?: Array<{ path: string; message: string }>;
  progress?: MediaPlanOperationProgress;
}

export type MediaPlanGenerateResponse =
  | MediaPlanGenerateCompletedResponse
  | MediaPlanGeneratePendingResponse
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

export interface MediaPlanApproveAndCreateSuccessResponse {
  success: true;
  source: "media-plan";
  batchId: string;
  notionPageUrls: string[];
  createdRowCount: number;
  approvalStatus: "ready_for_setup";
  duplicateApproval: boolean;
  customerId: string;
  campaignId: string;
  campaignResourceName: string;
  campaignStatus: "PAUSED";
  createdAdGroups: number;
  createdAds: number;
  googleAdsReviewLink: string;
}

export interface MediaPlanApproveAndCreateFailureResponse {
  success: false;
  source?: "media-plan";
  batchId?: string;
  error: string;
  issues?: Array<{ path: string; message: string }>;
  failedStep?: string;
  notionPageUrls?: string[];
  duplicate?: boolean;
}

export type MediaPlanApproveAndCreateResponse =
  | MediaPlanApproveAndCreateSuccessResponse
  | MediaPlanApproveAndCreateFailureResponse;

export const DEFAULT_MEDIA_PLAN_FORM: MediaPlanFormData = {
  websiteUrl: "",
  adBudget: "",
  googleCid: "",
  campaignType: SUPPORTED_CAMPAIGN_TYPE,
  specialRemarks: "",
  targetLocation: DEFAULT_TARGET_LOCATION,
  language: DEFAULT_MEDIA_PLAN_LANGUAGE,
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
