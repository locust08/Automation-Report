import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const createCampaignPlanSchema = z.object({
  clientName: z.string().trim().min(1).max(120),
  platform: z.enum(["google", "meta", "tiktok"]),
  accountId: z.coerce.number().int().positive(),
  packageId: z.coerce.number().int().positive(),
  campaignName: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(120),
  destination: z.string().trim().url(),
  startDate: date,
  endDate: date,
  allocationMicros: z.coerce.number().int().positive(),
}).superRefine((value, context) => {
  if (value.endDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date." });
  }
});

export const campaignPlanActionSchema = z.object({
  action: z.enum(["save_revision", "submit", "approve", "simulate_gate_1", "simulate_gate_2", "create_handoff"]),
  lockVersion: z.coerce.number().int().nonnegative(),
});

