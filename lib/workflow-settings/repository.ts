import "server-only";

import { jsonBody, supabaseRest } from "@/lib/optimization/supabase-rest";
import {
  WORKFLOW_POLICY_KEYS,
  policyListToMap,
  type WorkflowPolicy,
  type WorkflowPolicyKey,
  type WorkflowPolicyMap,
} from "@/lib/workflow-settings/policy";

type PolicyRow = {
  policy_key: WorkflowPolicyKey;
  approval_required: boolean;
  lock_version: number;
  updated_at: string | null;
  updated_by_name: string | null;
};

export type WorkflowPolicyActor = {
  id: string;
  name: string;
  email: string;
  trustedIp: string | null;
  userAgent: string | null;
};

export async function listWorkflowPolicies(): Promise<WorkflowPolicy[]> {
  const rows = await supabaseRest<PolicyRow[]>(
    "ads_dashboard_workflow_policies?select=*&order=policy_key.asc",
  );
  const policies = rows.map(mapPolicy);
  const returnedKeys = new Set(policies.map((policy) => policy.key));
  if (WORKFLOW_POLICY_KEYS.some((key) => !returnedKeys.has(key))) {
    throw new Error("Workflow approval policies are incomplete in Supabase.");
  }
  return policies;
}

export async function loadWorkflowPolicyMap(): Promise<WorkflowPolicyMap> {
  return policyListToMap(await listWorkflowPolicies());
}

export async function isWorkflowApprovalRequired(key: WorkflowPolicyKey): Promise<boolean> {
  try {
    const policies = await loadWorkflowPolicyMap();
    return policies[key];
  } catch {
    return true;
  }
}

export async function setWorkflowPolicy(input: {
  key: WorkflowPolicyKey;
  approvalRequired: boolean;
  expectedLockVersion: number;
  idempotencyKey: string;
  actor: WorkflowPolicyActor;
}): Promise<WorkflowPolicy> {
  if (input.key === "m03_change_control_approval" && !input.approvalRequired) {
    throw new Error("M03 change control always requires a separate approval.");
  }
  const row = await supabaseRest<PolicyRow>("rpc/ads_set_dashboard_workflow_policy_v1", {
    method: "POST",
    body: jsonBody({
      p_policy_key: input.key,
      p_approval_required: input.approvalRequired,
      p_expected_lock_version: input.expectedLockVersion,
      p_actor_id: input.actor.id,
      p_actor_name: input.actor.name,
      p_actor_email: input.actor.email,
      p_trusted_ip: input.actor.trustedIp,
      p_trusted_user_agent: input.actor.userAgent,
      p_idempotency_key: input.idempotencyKey,
    }),
  });
  return mapPolicy(row);
}

function mapPolicy(row: PolicyRow): WorkflowPolicy {
  if (!WORKFLOW_POLICY_KEYS.includes(row.policy_key)) throw new Error("Unknown workflow policy returned by Supabase.");
  return {
    key: row.policy_key,
    approvalRequired: row.policy_key === "m03_change_control_approval" ? true : row.approval_required,
    lockVersion: row.lock_version,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}
