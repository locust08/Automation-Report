export const WORKFLOW_POLICY_KEYS = [
  "search_term_approval",
  "placement_exclusion_approval",
  "m03_change_control_approval",
  "m04_campaign_readiness_approval",
] as const;

export type WorkflowPolicyKey = (typeof WORKFLOW_POLICY_KEYS)[number];
export type WorkflowPolicyMap = Record<WorkflowPolicyKey, boolean>;

export const DEFAULT_WORKFLOW_POLICIES: WorkflowPolicyMap = {
  search_term_approval: false,
  placement_exclusion_approval: false,
  m03_change_control_approval: true,
  m04_campaign_readiness_approval: false,
};

export type WorkflowPolicy = {
  key: WorkflowPolicyKey;
  approvalRequired: boolean;
  lockVersion: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

export function approvalRequired(
  policies: Partial<WorkflowPolicyMap> | undefined,
  key: WorkflowPolicyKey,
): boolean {
  if (key === "m03_change_control_approval") return true;
  return policies?.[key] ?? true;
}

export function nextWorkflowAction(required: boolean): "await_approval" | "auto_approve" {
  return required ? "await_approval" : "auto_approve";
}

export function policyListToMap(policies: WorkflowPolicy[]): WorkflowPolicyMap {
  const mapped: Partial<WorkflowPolicyMap> = {};
  for (const policy of policies) mapped[policy.key] = policy.key === "m03_change_control_approval" ? true : policy.approvalRequired;
  return Object.fromEntries(
    WORKFLOW_POLICY_KEYS.map((key) => [key, mapped[key] ?? true]),
  ) as WorkflowPolicyMap;
}
