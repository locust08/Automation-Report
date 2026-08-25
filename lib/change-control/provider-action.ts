import { getMockChangeRequest, M03RepositoryError, recordM03ProviderBaseline, recordM03ResourceMapping } from "@/lib/change-control/repository";
import { createM03OfficialProviderAdapter } from "@/lib/change-control/provider-baselines";
import { buildM03ProviderWorkflowPreview, executionGateFromEnv, assertM03ExecutionGate } from "@/lib/change-control/provider-workflow";
import type { TrustedRequestContext } from "@/lib/change-control/types";

export async function getM03ProviderPreview(requestId: string) {
  const detail = await getMockChangeRequest(requestId);
  const adapter = createM03OfficialProviderAdapter(detail.request.platform);
  return buildM03ProviderWorkflowPreview(detail, adapter);
}

export async function assertM03ProviderAction(input: { requestId: string; revisionId: string; revisionHash: string; context: TrustedRequestContext }) {
  const detail = await getMockChangeRequest(input.requestId);
  if (!detail.source_verification) throw new M03RepositoryError("This request has no verified M04 launch or audited legacy adoption boundary.", 409);
  const latestRevision = detail.revisions[0];
  const revision = latestRevision?.id === input.revisionId && latestRevision.payload_hash === input.revisionHash ? latestRevision : undefined;
  const approval = detail.approvals.find((entry) => entry.revision_id === input.revisionId && entry.revision_hash === input.revisionHash);
  const exact = Boolean(revision && approval);
  if (!exact) throw new M03RepositoryError("Select the exact latest approved revision before a provider action.", 409);
  if (!(["approved", "ready_to_publish", "provider_execution_locked"] as string[]).includes(detail.request.status)) {
    throw new M03RepositoryError("This request is not in an approved provider-action state.", 409);
  }
  const adapter = createM03OfficialProviderAdapter(detail.request.platform);
  const preview = await buildM03ProviderWorkflowPreview(detail, adapter);
  await recordM03ProviderBaseline({
    request_id: detail.request.id, revision_id: revision!.id, baseline: preview.baseline,
    context: input.context, idempotency_key: `${detail.request.id}:${revision!.payload_hash}:${preview.baseline.payload_hash}`,
  });
  if (preview.conflict_issues.length) throw new M03RepositoryError(preview.conflict_issues.map((issue) => issue.message).join(" "), 409);
  if (preview.capability_issues.some((issue) => issue.severity !== "warning")) throw new M03RepositoryError(preview.capability_issues.map((issue) => issue.message).join(" "), 400);
  for (const item of detail.items) {
    const operations = preview.mutation_plan.operations.filter((operation) => operation.item_id === item.id || operation.affected_item_ids?.includes(item.id));
    if (!operations.length) continue;
    const first = operations[0]!;
    await recordM03ResourceMapping({
      request_id: detail.request.id, item_id: item.id, platform: detail.request.platform,
      provider_resource_type: first.provider_resource, previous_resource_identity: item.entity_identity,
      replacement_stage: first.mode === "creative_replacement" ? "replacement_planned" : "not_required",
      capability_registry_version: preview.mutation_plan.capability_registry_version,
      operation_plan: operations.map((operation) => Object.fromEntries(Object.entries(operation))),
      context: input.context,
      idempotency_key: `${detail.request.id}:${revision!.payload_hash}:${item.id}:plan`,
    });
  }
  assertM03ExecutionGate(executionGateFromEnv(detail.request.platform, detail.request.account_identity, exact));
  return { detail, revision: revision!, approval: approval!, preview };
}
