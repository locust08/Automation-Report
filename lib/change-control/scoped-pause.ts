import { z } from "zod";
import { canonicalM03Hash, m03BaselineKey, type M03ProviderAdapter, type M03ProviderOperation } from "./provider-contract";
import { ProviderExecutionLockedError } from "./provider-execution-lock";
import type { M03ChangeRequestDetail, TrustedRequestContext } from "./types";

const target = z.object({ actor_id: z.string().uuid(), platform: z.enum(["google", "meta"]), account_identity: z.string().regex(/^\d+$/), campaign_identity: z.string().regex(/^\d+$/) }).strict();
export type PauseTarget = z.infer<typeof target>;
export interface PauseTransport {
  read(): Promise<{ account_id: string; campaign_id: string; status: string }>;
  pause(): Promise<void>;
}

// Independent narrow rollout gate: enabling it cannot unlock general publishing.
export function assertScopedPause(detail: M03ChangeRequestDetail, context: TrustedRequestContext, env: Record<string, string | undefined> = process.env): PauseTarget {
  let targets: PauseTarget[] = [];
  try { targets = z.array(target).max(20).parse(JSON.parse(env.M03_PAUSE_ALLOWLIST ?? "[]")); } catch { throw new ProviderExecutionLockedError(); }
  const r = detail.request;
  const selected = targets.find(t => t.actor_id === context.actor_id && t.platform === r.platform && t.account_identity === r.account_identity && t.campaign_identity === r.campaign_identity);
  if (env.M03_PAUSE_ENABLED !== "approved-test-pilot" || context.actor_role !== "admin" || !selected || detail.items.length !== 1
    || !detail.source_verification || detail.source_verification.platform !== r.platform
    || detail.source_verification.provider_account_identity !== r.account_identity || detail.source_verification.provider_campaign_identity !== r.campaign_identity) throw new ProviderExecutionLockedError();
  const item = detail.items[0]!;
  if (item.entity_type !== "campaign" || item.entity_identity !== r.campaign_identity || item.field_path !== "campaign.status"
    || item.value_type !== "string" || item.proposed_value !== "PAUSED" || !["ACTIVE", "ENABLED", "PAUSED"].includes(String(item.baseline_value))) throw new ProviderExecutionLockedError();
  return selected;
}

export function createScopedPauseAdapter(scope: PauseTarget, transport: PauseTransport, recheck: () => Promise<void>): M03ProviderAdapter {
  let compiled: M03ProviderOperation | undefined;
  function exact(op: M03ProviderOperation) {
    if (!compiled || canonicalM03Hash(compiled) !== canonicalM03Hash(op)) throw new Error("Pause operation differs from the reviewed plan.");
  }
  async function read() {
    const row = await transport.read();
    if (row.account_id !== scope.account_identity || row.campaign_id !== scope.campaign_identity || !["ACTIVE", "ENABLED", "PAUSED"].includes(row.status)) throw new Error("Official campaign identity or status does not match.");
    return row;
  }
  return {
    platform: scope.platform, capabilityRegistryVersion: 1,
    validateCapabilities: items => items.length === 1 && items.every(i => i.entity_type === "campaign" && i.entity_identity === scope.campaign_identity && i.field_path === "campaign.status" && i.value_type === "string" && i.proposed_value === "PAUSED") ? [] : [{ path: "items", message: "This pilot permits only the exact campaign pause.", severity: "error" }],
    retrieveBaseline: async input => {
      if (input.accountIdentity !== scope.account_identity || input.campaignIdentity !== scope.campaign_identity || input.items.length !== 1) throw new Error("Invalid pause baseline scope.");
      const row = await read(); const canonical_payload = { [m03BaselineKey(input.items[0]!)]: row.status };
      return { platform: scope.platform, account_identity: row.account_id, campaign_identity: row.campaign_id, source: "provider", captured_at: new Date().toISOString(), canonical_payload, payload_hash: canonicalM03Hash(canonical_payload) };
    },
    planMutation: input => {
      if (input.items.length !== 1 || input.items[0]!.proposed_value !== "PAUSED" || input.items[0]!.entity_identity !== scope.campaign_identity || input.items[0]!.field_path !== "campaign.status") throw new Error("Invalid pause plan.");
      const item = input.items[0]!; const key = `${input.requestId}:${input.revisionHash}:${item.id}:pause`;
      compiled = { operation_key: key, idempotency_key: canonicalM03Hash(key), item_id: item.id, platform: scope.platform, provider_resource: "campaign", field_path: "campaign.status", mode: "direct_update", action: "update", resource_identity: scope.campaign_identity,
        payload: { account_id: scope.account_identity, campaign_id: scope.campaign_identity, status: "PAUSED", baseline_status: item.baseline_value, revision_hash: input.revisionHash }, expected_result: { account_id: scope.account_identity, campaign_id: scope.campaign_identity, status: "PAUSED" }, depends_on: [] };
      return { platform: scope.platform, capability_registry_version: 1, operations: [structuredClone(compiled)], issues: [], replacement_items: [] };
    },
    executeOperation: async op => {
      exact(op); await recheck(); const baseline = await read();
      if (baseline.status !== op.payload.baseline_status) throw new Error("Campaign status changed after approval.");
      await recheck();
      await transport.pause();
      return { operation_key: op.operation_key, outcome: "succeeded", provider_resource_id: scope.campaign_identity, provider_response: {} };
    },
    readback: async op => {
      exact(op); await recheck(); const canonical_payload = await read();
      if (canonical_payload.status !== "PAUSED") throw new Error("Official campaign is not paused; reconciliation remains required.");
      return { resource_identity: scope.campaign_identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() };
    },
    normalizeError: () => ({ code: "pause_reconciliation_required", message: "Pause outcome requires official readback; no mutation retry is permitted.", retryable: false }),
  };
}
