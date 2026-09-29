import {z} from 'zod';

// Matches the DigitalBee/M04 CampaignResult envelope. The dashboard only transports it.
export const campaignResultSchema=z.object({
  outcome:z.enum(['success','partial','clarification_required','access_denied','conflict','locked','unavailable','unknown']),
  workflow_ref:z.string().nullable(),revision_ref:z.string().nullable(),
  validation_issues:z.array(z.object({field:z.string(),code:z.string(),message:z.string()})),
  allowed_next_actions:z.array(z.string()),
  evidence:z.array(z.object({kind:z.string(),reference:z.string(),captured_at:z.string()})),
  correlation_id:z.string(),caveats:z.array(z.string()),receipt_ref:z.string().nullable(),
  confirmation:z.record(z.string(),z.unknown()).nullable().optional(),
  data:z.record(z.string(),z.unknown()).optional(),
}).strict();
export type CampaignResult=z.infer<typeof campaignResultSchema>;

export const bridgeEnvelopeSchema=z.object({result:campaignResultSchema,confirmation_capability:z.string().optional()}).strict();
