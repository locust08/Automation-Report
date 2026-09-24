import {z} from 'zod';
const id=z.string().uuid(),key=z.string().trim().min(8).max(200),payload=z.record(z.string(),z.unknown());
export const m04Payloads={
  campaign_templates_list:z.object({}).strict(),
  campaign_workflow_get:z.object({id}).strict(),
  campaign_operation_get:z.object({id}).strict(),
  campaign_draft_save:z.object({id:id.optional(),expected_lock_version:z.number().int().nonnegative().optional(),idempotency_key:key,payload}).strict(),
  campaign_draft_validate:z.object({id,idempotency_key:key}).strict(),
  campaign_action_prepare:z.object({id}).strict(),
} as const;
export type M04Action=keyof typeof m04Payloads;export const M04_ACTIONS=Object.keys(m04Payloads) as M04Action[];
