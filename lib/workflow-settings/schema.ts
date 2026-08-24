import { z } from "zod";

import { WORKFLOW_POLICY_KEYS } from "@/lib/workflow-settings/policy";

export const workflowPolicyMutationSchema = z.object({
  key: z.enum(WORKFLOW_POLICY_KEYS),
  approvalRequired: z.boolean(),
  expectedLockVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
