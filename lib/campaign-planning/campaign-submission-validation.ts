import type { ZodError, ZodIssue } from "zod";

import { campaignPlanDraftInputSchema, type CampaignPlanDraftInput } from "./domain";
import { buildCampaignDraftRequest } from "./campaign-wizard-payload";
import type { CampaignWizardForm } from "./campaign-wizard";
import type { CampaignAccountOption } from "./types";

export type CampaignApiValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export type CampaignValidationPayload = {
  error: string;
  issues: CampaignApiValidationIssue[];
};

export type CampaignWizardIssue = CampaignApiValidationIssue & {
  field: keyof CampaignWizardForm;
  step: number;
};

export type CampaignSubmissionValidationResult =
  | { success: true; campaign: CampaignPlanDraftInput }
  | { success: false; error: string; issues: CampaignWizardIssue[] };

export function validateCampaignSubmission(form: CampaignWizardForm, account: CampaignAccountOption): CampaignSubmissionValidationResult {
  const campaign = buildCampaignDraftRequest(form, account);
  const parsed = campaignPlanDraftInputSchema.safeParse(campaign);
  if (parsed.success) return { success: true, campaign };
  const formatted = formatCampaignValidationError(parsed.error);
  return {
    success: false,
    error: formatted.error,
    issues: formatted.issues.map((issue) => ({ ...issue, ...mapCampaignIssueToWizardField(issue.path) })),
  };
}

export function formatCampaignValidationError(error: ZodError): CampaignValidationPayload {
  return {
    error: "Some campaign fields need attention.",
    issues: error.issues.map((issue) => ({
      path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"),
      message: friendlyIssueMessage(issue),
    })),
  };
}

export function mapCampaignIssueToWizardField(path: Array<string | number>): { field: keyof CampaignWizardForm; step: number } {
  const keys = path.filter((part): part is string => typeof part === "string");
  if (keys.includes("campaign_name")) return { field: "campaignName", step: 1 };
  if (keys.includes("objective")) return { field: "objective", step: 1 };
  if (keys.includes("campaign_type")) return { field: "campaignType", step: 1 };
  if (keys.includes("destination")) return { field: "destination", step: 2 };
  if (keys.includes("start_date")) return { field: "startDate", step: 2 };
  if (keys.includes("end_date")) return { field: "endDate", step: 2 };
  if (keys.includes("allocated_budget")) return { field: "allocatedBudget", step: 2 };
  if (keys.includes("tracking")) return { field: "trackingTemplate", step: 2 };
  if (keys.includes("bidding_strategy")) return { field: "biddingStrategy", step: 2 };
  if (keys.includes("bid_targets")) return { field: keys.includes("target_roas") ? "targetRoas" : "targetCpa", step: 2 };
  if (keys.includes("locations") || keys.includes("countries")) return { field: keys.includes("countries") ? "countries" : "locations", step: 2 };
  if (keys.includes("languages")) return { field: "languages", step: 2 };
  if (keys.includes("conversion")) return { field: "conversionActionId", step: 2 };
  if (keys.includes("optimization_goal")) return { field: "optimizationGoal", step: 2 };
  if (keys.includes("conversion_event")) return { field: "conversionEvent", step: 2 };
  if (keys.includes("pixel_id")) return { field: "pixelId", step: 2 };
  if (keys.includes("headlines") || keys.includes("long_headlines")) return { field: "headline", step: 3 };
  if (keys.includes("descriptions")) return { field: "descriptions", step: 3 };
  if (keys.includes("business_name")) return { field: "businessName", step: 3 };
  if (keys.some((key) => key.endsWith("asset_ids") || key.endsWith("asset_id")) || keys.includes("video_id") || keys.includes("post_id")) return { field: "assetIds", step: 3 };
  if (keys.includes("primary_text") || keys.includes("ad_text")) return { field: "primaryText", step: 3 };
  if (keys.includes("call_to_action")) return { field: "callToAction", step: 3 };
  if (keys.includes("display_name")) return { field: "identityName", step: 3 };
  if (keys.includes("groups") && keys.includes("keywords")) return { field: "keywords", step: 3 };
  if (keys.includes("groups")) return { field: "groupName", step: 3 };
  return { field: "campaignName", step: 1 };
}

function friendlyIssueMessage(issue: ZodIssue): string {
  const keys = issue.path.filter((part): part is string => typeof part === "string");
  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    if (keys.includes("headlines") || keys.includes("long_headlines")) return `Headline must be ${issue.maximum} characters or fewer.`;
    if (keys.includes("descriptions")) return `Description must be ${issue.maximum} characters or fewer.`;
    if (keys.includes("business_name")) return `Business name must be ${issue.maximum} characters or fewer.`;
  }
  if (issue.message === "Invalid input") return "The selected value is not supported for this campaign.";
  return issue.message;
}
