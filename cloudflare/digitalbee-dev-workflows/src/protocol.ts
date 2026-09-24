import {z} from 'zod';

export const WORKFLOW_PROTOCOL='digitalbee.dev-workflow.v1' as const;
export const platforms=['google','meta','tiktok'] as const;
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),account=z.string().regex(/^\d{1,30}$/);
export const workflowRequestSchema=z.object({
  protocol:z.literal(WORKFLOW_PROTOCOL),action:z.string().min(1).max(100),subject:z.string().min(1).max(255),employeeRevision:z.number().int().nonnegative(),
  serviceId:uuid,platform:z.enum(platforms),providerAccountId:account,mappingRevision:z.string().min(1).max(200),requestHash:hash,
  delegation:z.string().min(20).max(4096),payload:z.record(z.string(),z.unknown()),
}).strict();
export type WorkflowRequest=z.infer<typeof workflowRequestSchema>;
export const parseWorkflowRequest=(value:unknown)=>workflowRequestSchema.parse(value);
