import assert from "node:assert/strict";
import test from "node:test";
import { assertScopedPause, createScopedPauseAdapter, type PauseTarget } from "./scoped-pause";
import { canonicalM03Hash, type M03ProviderOperation } from "./provider-contract";
import { executeDurableM03Plan, type M03ExecutionStore, type M03OperationReceipt } from "./durable-execution";
import type { M03ChangeRequestDetail, TrustedRequestContext } from "./types";

const scope: PauseTarget = { actor_id: "00000000-0000-4000-8000-000000000001", platform: "google", account_identity: "2315114913", campaign_identity: "123" };
const context: TrustedRequestContext = { actor_id: scope.actor_id, actor_role: "admin", actor_name: "Fixture", actor_email: "fixture@example.test", trusted_ip: "127.0.0.1", user_agent: "fixture" };
const env = { M03_PAUSE_ENABLED: "approved-test-pilot", M03_PAUSE_ALLOWLIST: JSON.stringify([scope]) };
function detail(): M03ChangeRequestDetail {
  return { request: { id: "request", platform: scope.platform, account_identity: scope.account_identity, campaign_identity: scope.campaign_identity },
    items: [{ id: "item", entity_type: "campaign", entity_identity: scope.campaign_identity, field_path: "campaign.status", value_type: "string", baseline_value: "ENABLED", proposed_value: "PAUSED" }],
    source_verification: { platform: scope.platform, provider_account_identity: scope.account_identity, provider_campaign_identity: scope.campaign_identity },
  } as M03ChangeRequestDetail;
}
test("pause rollout is exact actor/platform/account/campaign and fails closed", () => {
  assert.deepEqual(assertScopedPause(detail(), context, env), scope);
  for (const key of ["actor_id", "account_identity", "campaign_identity", "platform"] as const) {
    const foreign = { ...scope, [key]: key === "platform" ? "meta" : "999" };
    assert.throws(() => assertScopedPause(detail(), context, { ...env, M03_PAUSE_ALLOWLIST: JSON.stringify([foreign]) }));
  }
  for (const flags of [{}, { ...env, M03_PAUSE_ENABLED: "true" }, { ...env, M03_PAUSE_ALLOWLIST: "[" }, { ...env, M03_PAUSE_ALLOWLIST: "[]" }]) assert.throws(() => assertScopedPause(detail(), context, flags));
  assert.throws(() => assertScopedPause(detail(), { ...context, actor_role: "approver" }, env));
});
test("every field, second item, source mismatch and activation remains locked", () => {
  for (const change of [{ field_path: "campaign.name" }, { proposed_value: "ENABLED" }, { entity_identity: "456" }, { entity_type: "ad" }, { value_type: "number" }]) {
    const d = detail(); Object.assign(d.items[0]!, change); assert.throws(() => assertScopedPause(d, context, env));
  }
  const d = detail(); d.items.push(d.items[0]!); assert.throws(() => assertScopedPause(d, context, env));
  const source = detail(); source.source_verification!.provider_account_identity = "foreign"; assert.throws(() => assertScopedPause(source, context, env));
});
function fixture(platform: "google" | "meta" = "google") {
  const selected = { ...scope, platform }; let writes = 0; let checks = 0; let row = { account_id: selected.account_identity, campaign_id: selected.campaign_identity, status: platform === "google" ? "ENABLED" : "ACTIVE" };
  let lost = false; let failRead = false; let revoked = false;
  const adapter = createScopedPauseAdapter(selected, { read: async () => { if (failRead) throw new Error("read failed"); return row; }, pause: async () => { writes++; row = { ...row, status: "PAUSED" }; if (lost) throw new Error("lost response"); } }, async () => { checks++; if (revoked) throw new Error("revoked"); });
  const item = { ...detail().items[0]!, baseline_value: row.status };
  const plan = adapter.planMutation({ requestId: "request", revisionHash: "hash", items: [item] });
  const rows = new Map<string, M03OperationReceipt>();
  const store: M03ExecutionStore = {
    claim: async op => { const existing = rows.get(op.operation_key); if (existing) return { acquired: false, receipt: existing }; const receipt: M03OperationReceipt = { operation_hash: canonicalM03Hash(op), claim_token: "token", state: "started" }; rows.set(op.operation_key, receipt); return { acquired: true, receipt }; },
    recordResult: async (op, _token, result) => { const receipt = rows.get(op.operation_key)!; receipt.result = result; receipt.state = result.outcome; },
    recordReadback: async (op, _token, readback) => { const receipt = rows.get(op.operation_key)!; receipt.readback = readback; receipt.state = "verified"; },
  };
  return { adapter, plan, store, rows, writes: () => writes, checks: () => checks, setRow: (next: typeof row) => { row = next; }, lost: () => { lost = true; }, revoke: () => { revoked = true; }, failRead: () => { failRead = true; } };
}
const gate = { deployment_enabled: true, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true };
for (const platform of ["google", "meta"] as const) test(`${platform} pauses once, verifies exact state and never republishes a verified receipt`, async () => {
  const f = fixture(platform); await executeDurableM03Plan(f.adapter, f.plan, gate, f.store); await executeDurableM03Plan(f.adapter, f.plan, gate, f.store);
  assert.equal(f.writes(), 1); assert.ok(f.checks() >= 3); assert.equal([...f.rows.values()][0]!.state, "verified");
});
test("lost POST response remains ambiguous and second invocation makes zero new writes", async () => {
  const f = fixture("meta"); f.lost(); await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store));
  await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store), /reconciliation/); assert.equal(f.writes(), 1);
  const read = await f.adapter.readback(f.plan.operations[0]!, { operation_key: f.plan.operations[0]!.operation_key, outcome: "succeeded", provider_response: {} });
  assert.equal(read.canonical_payload.status, "PAUSED"); assert.equal([...f.rows.values()][0]!.state, "ambiguous");
});
test("ownership, revoked access and latest baseline drift prevent dispatch", async () => {
  for (const mode of ["ownership", "revoked", "baseline"] as const) {
    const f = fixture(); if (mode === "revoked") f.revoke(); else f.setRow({ account_id: mode === "ownership" ? "foreign" : scope.account_identity, campaign_id: scope.campaign_identity, status: "PAUSED" });
    await assert.rejects(() => executeDurableM03Plan(f.adapter, f.plan, gate, f.store)); assert.equal(f.writes(), 0);
  }
});
test("a modified compiled operation and a non-paused readback cannot pass", async () => {
  const f = fixture(); const operation = structuredClone(f.plan.operations[0]!) as M03ProviderOperation; operation.payload.status = "ACTIVE";
  await assert.rejects(() => f.adapter.executeOperation(operation)); assert.equal(f.writes(), 0);
  await assert.rejects(() => f.adapter.readback(f.plan.operations[0]!, { operation_key: "op", outcome: "succeeded", provider_response: {} }), /not paused/);
});
