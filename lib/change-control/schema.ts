import { z } from "zod";
import { M03_PLATFORMS, M03_STATUSES } from "@/lib/change-control/types";

const jsonRecord = z.record(z.string(), z.unknown());
export const m03ChangeItemSchema = z.object({
  entity_type: z.string().trim().min(1).max(100),
  entity_identity: z.string().trim().min(1).max(500),
  field_path: z.string().trim().min(1).max(500),
  value_type: z.enum(["string", "number", "boolean", "json", "null"]),
  baseline_value: z.unknown(), proposed_value: z.unknown(),
  evidence: jsonRecord.optional(), platform_resource_mapping: jsonRecord.optional(),
});

const requestFields = {
  title: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(5_000),
  source_m04_plan_id: z.number().int().positive().nullable().optional(),
  source_m04_revision_id: z.number().int().positive().nullable().optional(),
  rollback_of_request_id: z.string().uuid().nullable().optional(), supersedes_request_id: z.string().uuid().nullable().optional(),
  items: z.array(m03ChangeItemSchema).min(1).max(500), idempotency_key: z.string().trim().min(8).max(200),
};
function requireCompleteM04Source(value: { source_m04_plan_id?: number | null; source_m04_revision_id?: number | null }, context: z.RefinementCtx) {
  if ((value.source_m04_plan_id != null) !== (value.source_m04_revision_id != null)) {
    context.addIssue({ code: "custom", path: ["source_m04_plan_id"], message: "Enter both the M04 plan ID and revision ID, or leave both blank for audited legacy adoption." });
  }
}

export const m03MockChangeRequestSchema = z.object({
  platform: z.enum(M03_PLATFORMS), workflow_mode: z.literal("mock"), ...requestFields,
  client_id: z.string().uuid().nullable().optional(), account_identity: z.string().trim().min(1).max(500),
  campaign_identity: z.string().trim().min(1).max(500),
}).strict().superRefine(requireCompleteM04Source);
export const m03MockChangeRequestEditSchema = z.object({ ...requestFields, expected_lock_version: z.number().int().nonnegative() }).strict().superRefine(requireCompleteM04Source);
export const m03MutationSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(200), comment: z.string().trim().max(5_000).optional(),
});
export const m03ApprovalMutationSchema = m03MutationSchema.extend({
  revision_hash: z.string().regex(/^[a-f0-9]{64}$/i),
});
export const m03ProviderActionSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(200),
  revision_id: z.string().uuid(),
  revision_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  comment: z.string().trim().max(5_000).optional(),
});
export const m03ListQuerySchema = z.object({
  platform: z.enum(M03_PLATFORMS).optional(), status: z.enum(M03_STATUSES).optional(),
  account_identity: z.string().trim().min(1).max(500).optional(),
  campaign_identity: z.string().trim().min(1).max(500).optional(),
  page: z.coerce.number().int().positive(),
  page_size: z.coerce.number().pipe(z.union([z.literal(10), z.literal(25), z.literal(50)])).default(10),
});

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const cidrPattern = /^(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}|[0-9a-f:]+\/\d{1,3})$/i;
export const workflowSettingMutationSchema = z.object({
  module: z.enum(["m03", "m04"]), kind: z.enum(["operator_domain", "destination_domain", "trusted_network"]),
  value: z.string().trim().min(1).max(500), label: z.string().trim().max(200).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(), is_active: z.boolean(),
  idempotency_key: z.string().trim().min(8).max(200),
}).superRefine((value, context) => {
  if (value.kind === "operator_domain" && value.module !== "m03") context.addIssue({ code: "custom", path: ["kind"], message: "Operator domains belong to M03." });
  if (value.kind === "destination_domain" && (value.module !== "m04" || !value.client_id)) context.addIssue({ code: "custom", path: ["client_id"], message: "M04 destination domains require a client." });
  if (value.kind === "trusted_network" && value.module === "m03") context.addIssue({ code: "custom", path: ["kind"], message: "M03 trusted-network controls are planned, not active." });
  if (value.kind !== "trusted_network" && !domainPattern.test(value.value.toLowerCase())) context.addIssue({ code: "custom", path: ["value"], message: "Enter a valid domain." });
  if (value.kind === "trusted_network" && !cidrPattern.test(value.value)) context.addIssue({ code: "custom", path: ["value"], message: "Enter a valid IPv4 or IPv6 CIDR network." });
});
