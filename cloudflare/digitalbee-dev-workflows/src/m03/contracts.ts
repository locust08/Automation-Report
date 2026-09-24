import {z} from 'zod';
const item=z.object({entity_type:z.string().trim().min(1).max(100),entity_identity:z.string().trim().min(1).max(500),field_path:z.string().trim().min(1).max(500),value_type:z.enum(['string','number','boolean','json','null']),baseline_value:z.unknown(),proposed_value:z.unknown()}).strict();
const fields={title:z.string().trim().min(1).max(200),reason:z.string().trim().min(1).max(5000),campaign_identity:z.string().trim().min(1).max(500),items:z.array(item).min(1).max(500),idempotency_key:z.string().trim().min(8).max(200)};
export const m03Payloads={
  changes_list:z.object({page:z.number().int().positive().default(1),page_size:z.union([z.literal(10),z.literal(25),z.literal(50)]).default(10)}).strict(),
  changes_get:z.object({id:z.string().uuid()}).strict(),
  changes_create_draft:z.object(fields).strict(),
  changes_revise_draft:z.object({id:z.string().uuid(),expected_lock_version:z.number().int().nonnegative(),...fields}).strict(),
  changes_validate:z.object({id:z.string().uuid(),idempotency_key:z.string().trim().min(8).max(200)}).strict(),
} as const;
export type M03Action=keyof typeof m03Payloads;
export const M03_ACTIONS=Object.keys(m03Payloads) as M03Action[];
