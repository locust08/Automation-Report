import type { M03ChangeRequestDetail, M03Platform, M03ValidationIssue } from "@/lib/change-control/types";
import type { M03MutationPlan, M03ProviderAdapter, M03ProviderBaseline, M03ProviderExecutionResult, M03ProviderReadback } from "@/lib/change-control/provider-contract";
import { canonicalM03Hash, m03BaselineKey } from "@/lib/change-control/provider-contract";
import { ProviderExecutionLockedError } from "@/lib/change-control/provider-adapters";

export const M03_BASELINE_MAX_AGE_MS = 15 * 60 * 1000;

export type M03ProviderWorkflowPreview = {
  baseline: M03ProviderBaseline;
  baseline_fresh: boolean;
  baseline_matches_reviewed_values: boolean;
  conflict_issues: M03ValidationIssue[];
  capability_issues: M03ValidationIssue[];
  mutation_plan: M03MutationPlan;
  approved_revision_exact: boolean;
  provider_execution_locked: boolean;
};

export type M03ExecutionGate = {
  deployment_enabled: boolean;
  platform_allowlisted: boolean;
  account_allowlisted: boolean;
  exact_revision_selected: boolean;
};

export async function buildM03ProviderWorkflowPreview(detail: M03ChangeRequestDetail, adapter: M03ProviderAdapter, now = Date.now()): Promise<M03ProviderWorkflowPreview> {
  const revision = detail.revisions[0];
  const approval = detail.approvals.find((entry) => entry.revision_id === revision?.id);
  const baseline = await adapter.retrieveBaseline({ accountIdentity: detail.request.account_identity, campaignIdentity: detail.request.campaign_identity, items: detail.items });
  const reviewedBaseline = Object.fromEntries(detail.items.map((item) => [m03BaselineKey(item), item.baseline_value]));
  const matches = baseline.payload_hash === canonicalM03Hash(reviewedBaseline);
  const fresh = now - new Date(baseline.captured_at).getTime() <= M03_BASELINE_MAX_AGE_MS;
  const conflictIssues: M03ValidationIssue[] = [];
  if (!fresh) conflictIssues.push({ path: "baseline.captured_at", message: "The provider baseline is older than 15 minutes. Refresh before publishing.", severity: "error" });
  if (!matches) conflictIssues.push({ path: "baseline.payload_hash", message: "The latest provider state no longer matches the reviewed baseline.", severity: "error" });
  const revisionHash = revision?.payload_hash ?? "unvalidated";
  return {
    baseline, baseline_fresh: fresh, baseline_matches_reviewed_values: matches, conflict_issues: conflictIssues,
    capability_issues: adapter.validateCapabilities(detail.items),
    mutation_plan: adapter.planMutation({ requestId: detail.request.id, revisionHash, items: detail.items }),
    approved_revision_exact: Boolean(revision && approval?.revision_hash === revision.payload_hash),
    provider_execution_locked: true,
  };
}

export function executionGateFromEnv(platform: M03Platform, accountIdentity: string, exactRevisionSelected: boolean): M03ExecutionGate {
  const platforms = csv(process.env.M03_PROVIDER_EXECUTION_PLATFORMS);
  const accounts = csv(process.env.M03_PROVIDER_EXECUTION_ACCOUNTS);
  return {
    deployment_enabled: process.env.M03_PROVIDER_EXECUTION_ENABLED === "approved-test-pilot",
    platform_allowlisted: platforms.includes(platform),
    account_allowlisted: accounts.includes(accountIdentity),
    exact_revision_selected: exactRevisionSelected,
  };
}

export function assertM03ExecutionGate(gate: M03ExecutionGate) {
  if (!gate.deployment_enabled || !gate.platform_allowlisted || !gate.account_allowlisted || !gate.exact_revision_selected) throw new ProviderExecutionLockedError();
}

export async function executeM03MutationPlan(adapter: M03ProviderAdapter, plan: M03MutationPlan, gate: M03ExecutionGate): Promise<Array<{ result: M03ProviderExecutionResult; readback: M03ProviderReadback }>> {
  assertM03ExecutionGate(gate);
  if (plan.issues.some((issue) => issue.severity !== "warning")) throw new Error("The mutation plan has unresolved capability issues.");
  const completed = new Set<string>();
  const outcomes: Array<{ result: M03ProviderExecutionResult; readback: M03ProviderReadback }> = [];
  for (const operation of plan.operations) {
    if (!operation.depends_on.every((key) => completed.has(key))) throw new Error(`Operation dependency is incomplete: ${operation.operation_key}`);
    const result = await adapter.executeOperation(operation);
    if (result.outcome !== "succeeded") throw new Error(result.error?.message ?? `Provider operation ${operation.operation_key} did not succeed.`);
    const readback = await adapter.readback(operation, result);
    outcomes.push({ result, readback }); completed.add(operation.operation_key);
  }
  return outcomes;
}

export function buildM03RollbackDraft(detail: M03ChangeRequestDetail) {
  if (detail.request.status !== "verified") throw new Error("Only a verified request can produce a rollback draft.");
  return {
    platform: detail.request.platform,
    workflow_mode: "mock" as const,
    title: `Rollback: ${detail.request.title}`,
    reason: `Compensating rollback for verified request ${detail.request.id}.`,
    account_identity: detail.request.account_identity,
    campaign_identity: detail.request.campaign_identity,
    rollback_of_request_id: detail.request.id,
    items: detail.items.map((item) => ({ ...item, baseline_value: item.proposed_value, proposed_value: item.baseline_value })),
  };
}

function csv(value: string | undefined) { return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean); }
