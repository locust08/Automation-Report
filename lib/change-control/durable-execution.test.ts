import assert from "node:assert/strict";
import test from "node:test";
import { executeDurableM03Plan, type M03ExecutionStore, type M03OperationReceipt } from "./durable-execution";
import { canonicalM03Hash, type M03MutationPlan, type M03ProviderOperation } from "./provider-contract";
import { createM03ProviderAdapter } from "./provider-adapters";

const gate = { deployment_enabled: true, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true };
function fixture() {
  const operation: M03ProviderOperation = { operation_key: "op", idempotency_key: "stable-key", item_id: "item", platform: "google", provider_resource: "campaign", field_path: "campaign.name", mode: "direct_update", action: "update", resource_identity: "campaign-1", payload: { name: "New" }, expected_result: { name: "New" }, depends_on: [] };
  const plan: M03MutationPlan = { platform: "google", capability_registry_version: 1, operations: [operation], issues: [], replacement_items: [] };
  const rows = new Map<string, M03OperationReceipt>(); let writes = 0; let reads = 0; let readFails = false; let writeThrows = false;
  const store: M03ExecutionStore = {
    claim: async (op) => {
      const existing = rows.get(op.operation_key);
      if (existing) { assert.equal(existing.operation_hash, canonicalM03Hash(op)); return { acquired: false, receipt: existing }; }
      const receipt: M03OperationReceipt = { operation_hash: canonicalM03Hash(op), claim_token: "token", state: "started" };
      rows.set(op.operation_key, receipt); return { acquired: true, receipt };
    },
    recordResult: async (op, token, result) => { const row = rows.get(op.operation_key)!; assert.equal(row.claim_token, token); row.result = result; row.state = result.outcome; },
    recordReadback: async (op, token, readback) => { const row = rows.get(op.operation_key)!; assert.equal(row.claim_token, token); row.readback = readback; row.state = "verified"; },
  };
  const adapter = createM03ProviderAdapter("google", {
    executeOperation: async (op) => { writes++; if (writeThrows) throw new Error("socket disconnected"); return { operation_key: op.operation_key, outcome: "succeeded", provider_response: {} }; },
    readback: async (op) => { reads++; if (readFails) throw new Error("read unavailable"); const canonical_payload = { name: "New" }; return { resource_identity: op.resource_identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() }; },
  });
  return { plan, operation, rows, store, adapter, writes: () => writes, reads: () => reads, failRead: (v: boolean) => { readFails = v; }, failWrite: () => { writeThrows = true; } };
}
test("durable execution resumes readback after failure without repeating a successful mutation", async () => {
  const f = fixture(); f.failRead(true);
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /read unavailable/);
  assert.equal(f.rows.get("op")?.state, "succeeded");
  f.failRead(false); await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  assert.equal(f.writes(), 1); assert.equal(f.reads(), 2);
});
test("a transport exception is durably ambiguous and cannot trigger a blind retry", async () => {
  const f = fixture(); f.failWrite();
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /ambiguous/i);
  assert.equal(f.rows.get("op")?.state, "ambiguous");
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /reconciliation/i);
  assert.equal(f.writes(), 1);
});
test("an interrupted started claim blocks mutation, and the master gate precedes every claim", async () => {
  const f = fixture(); await f.store.claim(f.operation);
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /reconciliation/i);
  assert.equal(f.writes(), 0);
  const locked = fixture();
  await assert.rejects(() => executeDurableM03Plan(locked.adapter, locked.plan, { ...gate, deployment_enabled: false }, locked.store));
  assert.equal(locked.rows.size, 0);
});
test("partial recovery retains verified dependencies and blocks changed operation payloads", async () => {
  const f = fixture(); await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  f.plan.operations.push({ ...f.operation, operation_key: "next", idempotency_key: "next-key", depends_on: ["op"] });
  await executeDurableM03Plan(f.adapter, f.plan, gate, f.store); assert.equal(f.writes(), 2);
  f.operation.payload.name = "Altered";
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store));
  assert.equal(f.writes(), 2);
});

test("failure to persist a provider response cannot cause another write", async () => {
  const f = fixture(); f.store.recordResult = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /database unavailable/);
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /reconciliation/i);
  assert.equal(f.writes(), 1);
});
test("durable evidence excludes raw provider credentials and unrequested readback fields", async () => {
  const f = fixture();
  f.adapter.executeOperation = async (op) => ({ operation_key: op.operation_key, outcome: "succeeded", provider_response: { access_token: "secret" } });
  f.adapter.readback = async (op) => {
    const canonical_payload = { name: "New", access_token: "secret" };
    return { resource_identity: op.resource_identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() };
  };
  await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  assert.equal(JSON.stringify([...f.rows.values()]).includes("secret"), false);
});
test("requested native resource identity is retained for downstream verified reports", async () => {
  const f = fixture();
  f.operation.transport = { method: "POST", endpoint: "campaigns:mutate", body: {}, readback_fields: ["name", "resourceName"], safe_to_retry: false };
  f.adapter.readback = async (op) => { const canonical_payload = { name: "New", resourceName: op.resource_identity }; return { resource_identity: op.resource_identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() }; };
  await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  assert.equal(f.rows.get("op")?.readback?.canonical_payload.resourceName, f.operation.resource_identity);
});
