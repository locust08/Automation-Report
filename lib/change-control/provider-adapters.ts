import type { M03ChangeItem, M03Platform, M03ValidationIssue } from "@/lib/change-control/types";
import {
  M03_CAPABILITY_REGISTRY_VERSION, canonicalM03Hash, m03BaselineKey, resolveM03Capability,
  type M03MutationPlan, type M03ProviderAdapter, type M03ProviderBaseline,
  type M03ProviderExecutionResult, type M03ProviderOperation, type M03ProviderReadback,
} from "@/lib/change-control/provider-contract";
import { PROVIDER_EXECUTION_LOCKED } from "@/lib/change-control/types";

type AdapterHooks = {
  retrieveBaseline?: M03ProviderAdapter["retrieveBaseline"];
  executeOperation?: M03ProviderAdapter["executeOperation"];
  readback?: M03ProviderAdapter["readback"];
};

class ProviderReadyAdapter implements M03ProviderAdapter {
  readonly capabilityRegistryVersion = M03_CAPABILITY_REGISTRY_VERSION;
  constructor(readonly platform: M03Platform, private readonly hooks: AdapterHooks = {}) {}

  async retrieveBaseline(input: { accountIdentity: string; campaignIdentity: string; items: M03ChangeItem[] }): Promise<M03ProviderBaseline> {
    if (this.hooks.retrieveBaseline) return this.hooks.retrieveBaseline(input);
    const canonical_payload = Object.fromEntries(input.items.map((item) => [m03BaselineKey(item), item.baseline_value]));
    return {
      platform: this.platform, account_identity: input.accountIdentity, campaign_identity: input.campaignIdentity,
      captured_at: new Date().toISOString(), canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), source: "stored_snapshot",
    };
  }

  validateCapabilities(items: M03ChangeItem[]): M03ValidationIssue[] {
    return items.flatMap((item) => {
      const capability = resolveM03Capability(this.platform, item.field_path);
      return capability.mode === "unsupported" ? [{ path: `items.${item.id}.field_path`, message: capability.note, severity: "error" as const }] : [];
    });
  }

  planMutation(input: { requestId: string; revisionHash: string; items: M03ChangeItem[] }): M03MutationPlan {
    const issues = this.validateCapabilities(input.items);
    const operations: M03ProviderOperation[] = [];
    const replacementItems: string[] = [];
    for (const item of input.items) {
      const capability = resolveM03Capability(this.platform, item.field_path);
      if (capability.mode === "unsupported" || !capability.provider_resource) continue;
      const base = `${input.requestId}:${input.revisionHash}:${item.id}`;
      if (capability.mode === "direct_update") {
        operations.push(operation(item, this.platform, capability.provider_resource, "direct_update", "update", `${base}:update`, [], input.revisionHash));
        continue;
      }
      replacementItems.push(item.id);
      const createKey = `${base}:replacement:create`;
      const verifyKey = `${base}:replacement:verify`;
      const activateKey = `${base}:replacement:activate`;
      operations.push(operation(item, this.platform, capability.provider_resource, "creative_replacement", "create_inactive_replacement", createKey, [], input.revisionHash));
      operations.push(operation(item, this.platform, capability.provider_resource, "creative_replacement", "verify_replacement", verifyKey, [createKey], input.revisionHash));
      operations.push(operation(item, this.platform, capability.provider_resource, "creative_replacement", "activate_replacement", activateKey, [verifyKey], input.revisionHash));
      operations.push(operation(item, this.platform, capability.provider_resource, "creative_replacement", "disable_previous", `${base}:replacement:disable-previous`, [activateKey], input.revisionHash));
    }
    return { platform: this.platform, capability_registry_version: this.capabilityRegistryVersion, operations, issues, replacement_items: replacementItems };
  }

  async executeOperation(operation: M03ProviderOperation): Promise<M03ProviderExecutionResult> {
    if (this.hooks.executeOperation) return this.hooks.executeOperation(operation);
    throw new ProviderExecutionLockedError();
  }

  async readback(operation: M03ProviderOperation, result: M03ProviderExecutionResult): Promise<M03ProviderReadback> {
    if (this.hooks.readback) return this.hooks.readback(operation, result);
    throw new ProviderExecutionLockedError();
  }

  normalizeError(error: unknown) {
    if (error instanceof ProviderExecutionLockedError) return { code: PROVIDER_EXECUTION_LOCKED.error, message: PROVIDER_EXECUTION_LOCKED.message, retryable: false };
    const message = error instanceof Error ? error.message : "Unknown provider error.";
    return { code: `${this.platform}_provider_error`, message, retryable: false };
  }
}

export class ProviderExecutionLockedError extends Error {
  readonly code = PROVIDER_EXECUTION_LOCKED.error;
  readonly status = 423;
  constructor() { super(PROVIDER_EXECUTION_LOCKED.message); this.name = "ProviderExecutionLockedError"; }
}

export function createM03ProviderAdapter(platform: M03Platform, hooks: AdapterHooks = {}): M03ProviderAdapter {
  return new ProviderReadyAdapter(platform, hooks);
}

export const googleM03Adapter = createM03ProviderAdapter("google");
export const metaM03Adapter = createM03ProviderAdapter("meta");
export const tiktokM03Adapter = createM03ProviderAdapter("tiktok");

function operation(item: M03ChangeItem, platform: M03Platform, providerResource: string, mode: "direct_update" | "creative_replacement", action: M03ProviderOperation["action"], key: string, dependsOn: string[], revisionHash: string): M03ProviderOperation {
  return {
    operation_key: key, item_id: item.id, platform, provider_resource: providerResource, field_path: item.field_path, mode, action,
    resource_identity: item.entity_identity, payload: { proposed_value: item.proposed_value, baseline_value: item.baseline_value, revision_hash: revisionHash, intended_initial_state: mode === "creative_replacement" ? "inactive" : undefined },
    depends_on: dependsOn, idempotency_key: canonicalM03Hash(key),
  };
}
