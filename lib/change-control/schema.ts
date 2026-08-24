import { z } from "zod";

export const m03ChangeItemSchema = z.object({
  entity_type: z.string().trim().min(1).max(100),
  entity_identity: z.string().trim().min(1).max(500),
  field_path: z.string().trim().min(1).max(500),
  baseline_value: z.unknown(),
  proposed_value: z.unknown(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export const m03MockChangeRequestSchema = z.object({
  platform: z.enum(["google", "meta", "tiktok"]),
  workflow_mode: z.literal("mock"),
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(5_000),
  client_id: z.string().uuid().nullable().optional(),
  account_identity: z.string().trim().min(1).max(500),
  campaign_identity: z.string().trim().min(1).max(500),
  source_m04_plan_id: z.number().int().positive().nullable().optional(),
  source_m04_revision_id: z.number().int().positive().nullable().optional(),
  items: z.array(m03ChangeItemSchema).min(1).max(500),
  idempotency_key: z.string().trim().min(8).max(200),
});

export const m03MutationSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(200),
  comment: z.string().trim().max(5_000).optional(),
});
