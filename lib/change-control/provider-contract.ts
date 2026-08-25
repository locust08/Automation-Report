import { createHash } from "node:crypto";
import type { M03ChangeItem, M03Platform, M03ValidationIssue } from "@/lib/change-control/types";

export const M03_CAPABILITY_REGISTRY_VERSION = 1 as const;

export type M03MutationMode = "direct_update" | "creative_replacement" | "unsupported";
export type M03ReplacementStage =
  | "not_required"
  | "replacement_planned"
  | "replacement_created_inactive"
  | "replacement_verified"
  | "replacement_activated"
  | "previous_resource_disabled"
  | "completed"
  | "compensation_required";

export type M03CapabilityRule = {
  field_pattern: string;
  mode: Exclude<M03MutationMode, "unsupported">;
  provider_resource: string;
  note?: string;
};

export type M03ResolvedCapability = {
  registry_version: typeof M03_CAPABILITY_REGISTRY_VERSION;
  platform: M03Platform;
  field_path: string;
  mode: M03MutationMode;
  provider_resource: string | null;
  note: string;
};

export type M03ProviderBaseline = {
  platform: M03Platform;
  account_identity: string;
  campaign_identity: string;
  captured_at: string;
  canonical_payload: Record<string, unknown>;
  payload_hash: string;
  source: "provider" | "legacy_google_compat" | "stored_snapshot";
};

export type M03ProviderOperation = {
  operation_key: string;
  item_id: string;
  platform: M03Platform;
  provider_resource: string;
  field_path: string;
  mode: Exclude<M03MutationMode, "unsupported">;
  action: "update" | "create_inactive_replacement" | "verify_replacement" | "activate_replacement" | "disable_previous";
  resource_identity: string;
  payload: Record<string, unknown>;
  depends_on: string[];
  idempotency_key: string;
};

export type M03MutationPlan = {
  platform: M03Platform;
  capability_registry_version: number;
  operations: M03ProviderOperation[];
  issues: M03ValidationIssue[];
  replacement_items: string[];
};

export type M03ProviderExecutionResult = {
  operation_key: string;
  outcome: "succeeded" | "failed" | "ambiguous";
  provider_resource_id?: string;
  provider_response: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
};

export type M03ProviderReadback = {
  resource_identity: string;
  canonical_payload: Record<string, unknown>;
  payload_hash: string;
  verified_at: string;
};

export interface M03ProviderAdapter {
  readonly platform: M03Platform;
  readonly capabilityRegistryVersion: number;
  retrieveBaseline(input: { accountIdentity: string; campaignIdentity: string; items: M03ChangeItem[] }): Promise<M03ProviderBaseline>;
  validateCapabilities(items: M03ChangeItem[]): M03ValidationIssue[];
  planMutation(input: { requestId: string; revisionHash: string; items: M03ChangeItem[] }): M03MutationPlan;
  executeOperation(operation: M03ProviderOperation): Promise<M03ProviderExecutionResult>;
  readback(operation: M03ProviderOperation, result: M03ProviderExecutionResult): Promise<M03ProviderReadback>;
  normalizeError(error: unknown): { code: string; message: string; retryable: boolean };
}

const GOOGLE_RULES: M03CapabilityRule[] = [
  direct("campaign.status", "campaign"), direct("campaign.name", "campaign"), direct("campaign.budget.*", "campaign_budget"),
  direct("campaign.schedule.*", "campaign"), direct("campaign.bidding.*", "campaign"), direct("campaign.targeting.*", "campaign_criterion"),
  direct("campaign.placements.*", "campaign_criterion"), direct("campaign.conversion.*", "campaign"),
  direct("ad_group.status", "ad_group"), direct("ad_group.name", "ad_group"), direct("ad_group.bid.*", "ad_group"), direct("ad_group.targeting.*", "ad_group_criterion"),
  direct("keyword.*", "ad_group_criterion"), replacement("ad.copy.*", "ad_group_ad"), replacement("ad.creative.*", "ad_group_ad"),
];
const META_RULES: M03CapabilityRule[] = [
  direct("campaign.status", "campaign"), direct("campaign.name", "campaign"), direct("campaign.budget.*", "campaign"),
  direct("campaign.schedule.*", "campaign"), direct("campaign.bid.*", "campaign"), direct("campaign.targeting.*", "adset"), direct("campaign.placements.*", "adset"),
  direct("campaign.conversion.*", "adset"), direct("ad_set.*", "adset"), replacement("ad.copy.*", "adcreative"), replacement("ad.creative.*", "adcreative"),
];
const TIKTOK_RULES: M03CapabilityRule[] = [
  direct("campaign.status", "campaign"), direct("campaign.name", "campaign"), direct("campaign.budget.*", "campaign"),
  direct("campaign.schedule.*", "adgroup"), direct("campaign.bid.*", "adgroup"), direct("campaign.targeting.*", "adgroup"),
  direct("campaign.placements.*", "adgroup"), direct("campaign.conversion.*", "adgroup"), direct("ad_group.*", "adgroup"),
  replacement("ad.copy.*", "ad"), replacement("ad.creative.*", "ad"),
];

export const M03_CAPABILITY_REGISTRY: Record<M03Platform, readonly M03CapabilityRule[]> = {
  google: GOOGLE_RULES,
  meta: META_RULES,
  tiktok: TIKTOK_RULES,
};

export function resolveM03Capability(platform: M03Platform, fieldPath: string): M03ResolvedCapability {
  const normalized = fieldPath.trim().toLowerCase();
  const rule = M03_CAPABILITY_REGISTRY[platform].find((candidate) => matches(candidate.field_pattern, normalized));
  return {
    registry_version: M03_CAPABILITY_REGISTRY_VERSION,
    platform,
    field_path: fieldPath,
    mode: rule?.mode ?? "unsupported",
    provider_resource: rule?.provider_resource ?? null,
    note: rule?.note ?? "This field is not in the reviewed M03 capability registry and will not be ignored.",
  };
}

export function canonicalM03Hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function m03BaselineKey(item: Pick<M03ChangeItem, "entity_type" | "entity_identity" | "field_path">): string {
  return `${item.entity_type}:${item.entity_identity}:${item.field_path}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function direct(field_pattern: string, provider_resource: string): M03CapabilityRule {
  return { field_pattern, mode: "direct_update", provider_resource };
}
function replacement(field_pattern: string, provider_resource: string): M03CapabilityRule {
  return { field_pattern, mode: "creative_replacement", provider_resource, note: "Provider-native replacement: create inactive, verify, activate, then disable the previous resource." };
}
function matches(pattern: string, fieldPath: string) {
  return pattern.endsWith(".*") ? fieldPath === pattern.slice(0, -2) || fieldPath.startsWith(pattern.slice(0, -1)) : fieldPath === pattern;
}
