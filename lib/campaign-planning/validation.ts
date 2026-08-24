import { z } from "zod";

import { campaignPlanDraftInputSchema } from "./domain";

export { campaignPlanDraftInputSchema as createCampaignPlanSchema } from "./domain";

export const campaignWizardDraftInputSchema = z.object({
  platform: z.enum(["google", "meta", "tiktok"]),
  current_step: z.number().int().min(0).max(4),
  highest_reached_step: z.number().int().min(0).max(4),
  form_data: z.record(z.string(), z.unknown()),
}).refine((draft) => draft.current_step <= draft.highest_reached_step, {
  message: "Current step cannot be beyond the highest reached step.",
  path: ["current_step"],
});

export const updateCampaignPlanSchema = z.object({
  expected_lock_version: z.number().int().nonnegative(),
  campaign: campaignPlanDraftInputSchema,
});

export const campaignEditDraftInputSchema = z.object({
  base_revision_id: z.number().int().positive(),
  base_lock_version: z.number().int().nonnegative(),
  platform: z.enum(["google", "meta", "tiktok"]),
  current_step: z.number().int().min(0).max(4),
  highest_reached_step: z.number().int().min(0).max(4),
  form_data: z.record(z.string(), z.unknown()),
}).refine((draft) => draft.current_step <= draft.highest_reached_step, {
  message: "Current step cannot be beyond the highest reached step.",
  path: ["current_step"],
});
