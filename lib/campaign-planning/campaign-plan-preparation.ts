import { createHash } from "node:crypto";

import {
  calculateCampaignBudget,
  campaignPlanDraftInputSchema,
  campaignPlanSchema,
  canonicalJson,
  normalizeCampaignPlan,
  type CampaignPlan,
} from "./domain";

export type PreparedCampaignPlanDraft = {
  plan: CampaignPlan;
  canonical_json: string;
  payload_hash: string;
};

export function prepareCampaignPlanDraft(input: unknown): PreparedCampaignPlanDraft {
  const draft = campaignPlanDraftInputSchema.parse(input);
  const budget = calculateCampaignBudget(draft);
  const plan = campaignPlanSchema.parse({
    ...draft,
    increment_amount: budget.increment_amount,
    daily_budget: budget.daily_budget,
    projected_total: budget.projected_total,
  });
  const normalizedPlan = normalizeCampaignPlan(plan) as CampaignPlan;
  const canonicalJsonValue = canonicalJson(normalizedPlan);

  return {
    plan: normalizedPlan,
    canonical_json: canonicalJsonValue,
    payload_hash: sha256Hex(canonicalJsonValue),
  };
}

export function sha256Hex(canonicalJsonValue: string): string {
  return createHash("sha256").update(canonicalJsonValue, "utf8").digest("hex");
}
