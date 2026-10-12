import type { M03MutationPlan, M03ProviderAdapter, M03ProviderExecutionResult, M03ProviderOperation, M03ProviderReadback } from "./provider-contract";
import { canonicalM03Hash } from "./provider-contract";
import { assertM03ExecutionGate, M03_BASELINE_MAX_AGE_MS, type M03ExecutionGate } from "./provider-workflow";

export type M03OperationReceipt = { operation_hash: string; claim_token: string; state: "started" | "succeeded" | "failed" | "ambiguous" | "verified"; result?: M03ProviderExecutionResult; readback?: M03ProviderReadback };
export interface M03ExecutionStore {
  claim(operation: M03ProviderOperation): Promise<{ acquired: boolean; receipt: M03OperationReceipt }>;
  recordResult(operation: M03ProviderOperation, token: string, result: M03ProviderExecutionResult): Promise<void>;
  recordReadback(operation: M03ProviderOperation, token: string, readback: M03ProviderReadback): Promise<void>;
}
export async function executeDurableM03Plan(adapter: M03ProviderAdapter, plan: M03MutationPlan, gate: M03ExecutionGate, store: M03ExecutionStore) {
  assertM03ExecutionGate(gate);
  if (adapter.platform !== plan.platform || plan.issues.some((issue) => issue.severity !== "warning")) throw new Error("The mutation plan has unresolved platform or capability issues.");
  const keys = new Set<string>(); const idempotencyKeys = new Set<string>();
  for (const operation of plan.operations) {
    if (operation.platform !== plan.platform || !operation.operation_key || keys.has(operation.operation_key) || !operation.idempotency_key || idempotencyKeys.has(operation.idempotency_key)
      || !operation.expected_result || !Object.keys(operation.expected_result).length || Object.hasOwn(operation.expected_result, "approved_value")
      || !operation.depends_on.every((key) => keys.has(key))) throw new Error("Every operation requires unique keys, compiled expectations and ordered dependencies.");
    keys.add(operation.operation_key); idempotencyKeys.add(operation.idempotency_key);
  }
  const outcomes: Array<{ result: M03ProviderExecutionResult; readback: M03ProviderReadback }> = [];
  for (const operation of plan.operations) {
    const { acquired, receipt } = await store.claim(operation);
    if (receipt.operation_hash !== canonicalM03Hash(operation) || !receipt.claim_token) throw new Error("The durable operation no longer matches the approved plan.");
    let result = receipt.result;
    if (acquired) {
      if (receipt.state !== "started") throw new Error("Invalid execution claim state.");
      try { result = await adapter.executeOperation(operation); }
      catch {
        // Unknown transport outcomes must never be treated as safe failures.
        result = { operation_key: operation.operation_key, outcome: "ambiguous", provider_response: {}, error: { code: "unknown_transport_outcome", message: "Provider outcome is ambiguous; official reconciliation is required.", retryable: false } };
      }
      if (result.operation_key !== operation.operation_key) result = { operation_key: operation.operation_key, outcome: "ambiguous", provider_response: {} };
      // The durable receipt intentionally excludes raw provider responses/errors.
      // Native identity plus official readback suffice for safe verification.
      result = { operation_key: result.operation_key, outcome: result.outcome, provider_resource_id: result.provider_resource_id, provider_response: {} };
      await store.recordResult(operation, receipt.claim_token, result);
    } else if (receipt.state === "started" || receipt.state === "ambiguous" || receipt.state === "failed") {
      throw new Error("Official reconciliation is required before another mutation attempt.");
    }
    if (!result || result.operation_key !== operation.operation_key || result.outcome !== "succeeded") throw new Error("Provider outcome is ambiguous or failed; official reconciliation is required.");
    let readback = receipt.state === "verified" ? receipt.readback : undefined;
    if (!readback || !validReadback(operation, result, readback)) {
      readback = await adapter.readback(operation, result);
      if (!validReadback(operation, result, readback)) throw new Error("Provider readback does not match the approved operation or resource.");
      const canonical_payload = Object.fromEntries(Object.keys(operation.expected_result!).map((key) => [key, readback!.canonical_payload[key]]));
      if (operation.transport?.readback_fields.includes("resourceName")) {
        if (readback.canonical_payload.resourceName !== readback.resource_identity) throw new Error("The requested native readback identity does not match.");
        canonical_payload.resourceName = readback.canonical_payload.resourceName;
      }
      readback = { ...readback, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload) };
      await store.recordReadback(operation, receipt.claim_token, readback);
    }
    outcomes.push({ result, readback });
  }
  return outcomes;
}

function validReadback(operation: M03ProviderOperation, result: M03ProviderExecutionResult, readback: M03ProviderReadback) {
  const identity = operation.action.startsWith("create_") ? result.provider_resource_id : operation.resource_identity;
  const age = Date.now() - Date.parse(readback.verified_at);
  return Boolean(identity && readback.resource_identity === identity && readback.payload_hash === canonicalM03Hash(readback.canonical_payload)
    && Number.isFinite(age) && age >= 0 && age <= M03_BASELINE_MAX_AGE_MS
    && Object.entries(operation.expected_result!).every(([key, value]) => Object.hasOwn(readback.canonical_payload, key) && canonicalM03Hash(value) === canonicalM03Hash(readback.canonical_payload[key])));
}
