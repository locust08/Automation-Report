import { assertScopedPause, createScopedPauseAdapter } from "./scoped-pause";
import { officialPauseTransport } from "./pause-transport";
import { buildM03ProviderWorkflowPreview } from "./provider-workflow";
import { assertM03ReviewedItems, assertM03RevisionIntegrity } from "./revision-integrity";
import { executeDurableM03Plan } from "./durable-execution";
import { canonicalM03Hash } from "./provider-contract";
import { assertM03Operator, createM03ExecutionStore, finalizeM03Pause, getM03ExecutionReceipts, getM03RevisionIntegrityReceipt, getMockChangeRequest, M03RepositoryError, reconcileM03PauseReceipt, recordM03ProviderBaseline, recordM03ResourceMapping } from "./repository";
import type { TrustedRequestContext } from "./types";

export async function executeScopedPause(input: { requestId: string; revisionId: string; revisionHash: string; context: TrustedRequestContext; reconcileOnly: boolean; reauthorize: () => Promise<void>; env?: Record<string, string | undefined> }) {
  const env = input.env ?? process.env;
  async function current() {
    await input.reauthorize(); await assertM03Operator(input.context);
    const detail = await getMockChangeRequest(input.requestId);
    assertScopedPause(detail, input.context, env);
    const revision = detail.revisions[0];
    if (!revision || revision.id !== input.revisionId || revision.payload_hash !== input.revisionHash || !detail.approvals.some(a => a.revision_id === revision.id && a.revision_hash === revision.payload_hash)
      || !["approved", "ready_to_publish", "publishing", "partially_completed", "provider_execution_locked", "verified"].includes(detail.request.status)) throw new M03RepositoryError("The latest exact approved pause revision is required.", 409);
    assertM03RevisionIntegrity(revision, await getM03RevisionIntegrityReceipt(input.requestId, revision.id, revision.payload_hash));
    assertM03ReviewedItems(detail, revision);
    return detail;
  }
  const detail = await current(); const scope = assertScopedPause(detail, input.context, env);
  const existingReceipts = await getM03ExecutionReceipts(input.requestId, input.revisionId);
  // A prior request can time out after the official readback was durably verified.
  // Finalization revalidates that stored receipt and never dispatches a pause.
  if (existingReceipts.length === 1 && existingReceipts[0]?.state === "verified") {
    return finalizeM03Pause(input);
  }
  const transport = await officialPauseTransport(scope, env);
  const recheck = async () => { await current(); };
  const adapter = createScopedPauseAdapter(scope, transport, recheck);
  const plan = adapter.planMutation({ requestId: input.requestId, revisionHash: input.revisionHash, items: detail.items });
  const receipts = existingReceipts;
  if (receipts.length || input.reconcileOnly) {
    if (receipts.length !== plan.operations.length) throw new M03RepositoryError("No complete attempted pause receipt exists; verification cannot publish.", 409);
    for (const operation of plan.operations) {
      const receipt = receipts.find(r => r.operation_key === operation.operation_key && r.operation_hash === canonicalM03Hash(operation));
      if (!receipt) throw new M03RepositoryError("The execution receipt differs from the approved pause.", 409);
      const readback = await adapter.readback(operation, { operation_key: operation.operation_key, outcome: "succeeded", provider_response: {} });
      await recheck();
      await reconcileM03PauseReceipt({ ...input, operationKey: receipt.operation_key, token: receipt.claim_token, readback });
    }
  } else {
    const gate = { deployment_enabled: true, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true };
    const preview = await buildM03ProviderWorkflowPreview(detail, adapter);
    if (preview.conflict_issues.length || preview.capability_issues.length) throw new M03RepositoryError("Current official values or pause capabilities differ from the approved revision.", 409);
    await recordM03ProviderBaseline({ request_id: input.requestId, revision_id: input.revisionId, baseline: preview.baseline, context: input.context, idempotency_key: `${input.requestId}:${input.revisionHash}:${preview.baseline.payload_hash}` });
    const operation = plan.operations[0]!;
    await recordM03ResourceMapping({ request_id: input.requestId, item_id: operation.item_id, platform: scope.platform, provider_resource_type: "campaign", previous_resource_identity: scope.campaign_identity, replacement_stage: "not_required", capability_registry_version: 1, operation_plan: [Object.fromEntries(Object.entries(operation))], context: input.context, idempotency_key: `${input.requestId}:${input.revisionHash}:${operation.item_id}:pause-plan` });
    await recheck();
    await executeDurableM03Plan(adapter, plan, gate, createM03ExecutionStore(input));
  }
  await recheck();
  return finalizeM03Pause(input);
}
