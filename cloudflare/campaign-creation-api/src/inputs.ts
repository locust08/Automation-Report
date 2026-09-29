import {z} from 'zod';
const service = {service_id: z.uuid()}, mutation = {...service, idempotency_key: z.uuid()};
const revision = {workflow_id: z.uuid(), revision_id: z.uuid()};
const bound = {...mutation, ...revision, challenge: z.string().min(16).max(8192), confirmation_hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/)};
const fields = z.record(z.string().min(1).max(100), z.unknown());
export const inputs: Record<string, z.ZodType> = {
  campaign_templates_list: z.object({...service, limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(8192).optional()}).strict(),
  campaign_workflows_list: z.object({...service, limit:z.number().int().min(1).max(50).default(20)}).strict(),
  campaign_workflow_get: z.object({...service, workflow_id: z.uuid()}).strict(),
  campaign_operation_get: z.object({...service, idempotency_key: z.uuid()}).strict(),
  campaign_draft_save: z.object({...mutation, workflow_id: z.uuid().optional(), revision_id: z.uuid().optional(), source: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('brief'), fields}).strict(),
    z.object({kind: z.literal('template'), template_id: z.string().min(1).max(200), overrides: fields}).strict(),
    z.object({kind: z.literal('campaign_clone'), source_service_id: z.uuid(), source_campaign_id: z.string().min(1).max(200), overrides: fields}).strict(),
  ])}).strict(),
  campaign_draft_validate: z.object({...mutation, ...revision}).strict(),
  campaign_action_prepare: z.object({...mutation, ...revision, action: z.enum(['approve', 'gate1', 'resume', 'gate2']), schedule: z.object({mode: z.enum(['now', 'scheduled']), scheduled_at: z.string().datetime().optional(), timezone: z.string().optional()}).strict().optional()}).strict(),
  campaign_revision_approve: z.object(bound).strict(),
  campaign_gate1_create: z.object(bound).strict(),
  campaign_creation_resume: z.object({...bound, operation_refs: z.array(z.string().min(1).max(200)).min(1).max(100)}).strict(),
  campaign_gate2_activate: z.object({...bound, schedule: z.discriminatedUnion('mode', [z.object({mode: z.literal('now')}).strict(),
    z.object({mode: z.literal('scheduled'), scheduled_at: z.string().datetime(), timezone: z.string().min(1)}).strict()])}).strict(),
};
