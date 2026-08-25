import {
  canonicalM03Hash,
  m03BaselineKey,
  type M03MutationPlan,
  type M03ProviderAdapter,
  type M03ProviderBaseline,
  type M03ProviderExecutionResult,
  type M03ProviderOperation,
} from "@/lib/change-control/provider-contract";
import { ProviderExecutionLockedError } from "@/lib/change-control/provider-execution-lock";
import type { M03ChangeItem, M03ValidationIssue } from "@/lib/change-control/types";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import { TikTokAdsApiError, createTikTokAdsClient, type TikTokAdsClient } from "@/lib/tiktok/ads-client";
import { prepareTikTokMutationPayload } from "@/lib/tiktok/ads-operations";
import { redactTikTokSecrets } from "@/lib/tiktok/ads-schemas";

export const M03_TIKTOK_CAPABILITY_REGISTRY_VERSION = 2 as const;

type TikTokMode = "direct_update" | "creative_replacement" | "unsupported";
type TikTokResource = "campaign" | "adgroup" | "ad";
type TikTokRule = {
  pattern: string;
  mode: TikTokMode;
  providerResource: TikTokResource | null;
  providerField?: string;
  note?: string;
};

export type TikTokM03TransportResponse = { data: unknown; requestId?: string };
export interface TikTokM03Transport {
  request(action: TikTokAdsActionName, advertiserId: string, input: Record<string, unknown>): Promise<TikTokM03TransportResponse>;
}

const TIKTOK_RULES: TikTokRule[] = [
  direct("campaign.name", "campaign", "campaign_name"),
  direct("campaign.status", "campaign", "operation_status"),
  direct("campaign.budget.amount", "campaign", "budget"),
  direct("campaign.budget.daily", "campaign", "budget"),
  unsupported("campaign.budget.mode", "TikTok does not allow a live campaign budget type to be changed."),
  unsupported("campaign.objective", "TikTok campaign objectives cannot be changed after creation."),
  direct("ad_group.name", "adgroup", "adgroup_name"),
  direct("ad_group.status", "adgroup", "operation_status"),
  direct("ad_group.budget.amount", "adgroup", "budget"),
  direct("ad_group.budget.daily", "adgroup", "budget"),
  unsupported("ad_group.budget.mode", "TikTok does not allow a live ad-group budget type to be changed."),
  direct("ad_group.schedule.start_time", "adgroup", "schedule_start_time"),
  direct("ad_group.schedule.end_time", "adgroup", "schedule_end_time"),
  direct("ad_group.bid.type", "adgroup", "bid_type"),
  direct("ad_group.bid.amount", "adgroup", "bid_price"),
  direct("ad_group.optimization_goal", "adgroup", "optimization_goal"),
  direct("ad_group.billing_event", "adgroup", "billing_event"),
  direct("ad_group.targeting.*", "adgroup"),
  direct("ad_group.placements.*", "adgroup"),
  direct("ad_group.conversion.*", "adgroup"),
  direct("ad.name", "ad", "ad_name"),
  direct("ad.status", "ad", "operation_status"),
  direct("ad.copy.primary_text", "ad", "ad_text"),
  direct("ad.creative.call_to_action", "ad", "call_to_action"),
  direct("ad.creative.destination_url", "ad", "landing_page_url"),
  direct("ad.creative.tracking_url", "ad", "tracking_url"),
  replacement("ad.creative.video_reference"),
  replacement("ad.creative.identity_reference"),
  replacement("ad.creative.format"),
];

export type TikTokM03AdapterOptions = {
  retrieveBaseline?: M03ProviderAdapter["retrieveBaseline"];
  transport?: TikTokM03Transport;
};

export function createTikTokM03Adapter(options: TikTokM03AdapterOptions = {}): M03ProviderAdapter {
  const transport = options.transport;
  return {
    platform: "tiktok",
    capabilityRegistryVersion: M03_TIKTOK_CAPABILITY_REGISTRY_VERSION,
    async retrieveBaseline(input) {
      if (options.retrieveBaseline) return options.retrieveBaseline(input);
      const canonical_payload = Object.fromEntries(input.items.map((item) => [m03BaselineKey(item), item.baseline_value]));
      return {
        platform: "tiktok",
        account_identity: input.accountIdentity,
        campaign_identity: input.campaignIdentity,
        captured_at: new Date().toISOString(),
        canonical_payload,
        payload_hash: canonicalM03Hash(canonical_payload),
        source: "stored_snapshot",
      } satisfies M03ProviderBaseline;
    },
    validateCapabilities: validateTikTokM03Capabilities,
    planMutation: planTikTokM03Mutation,
    async executeOperation(operation) {
      if (!transport) throw new ProviderExecutionLockedError();
      if (!operation.transport) throw new Error(`TikTok operation ${operation.operation_key} has no transport description.`);
      const advertiserId = String(operation.payload.advertiser_id ?? "");
      const action = operation.transport.endpoint as TikTokAdsActionName;
      try {
        const response = await transport.request(action, advertiserId, operation.transport.body);
        return {
          operation_key: operation.operation_key,
          outcome: "succeeded",
          provider_resource_id: findTikTokProviderId(response.data),
          provider_response: sanitizeTikTokEvidence(response.data),
        };
      } catch (error) {
        return { operation_key: operation.operation_key, outcome: "failed", provider_response: {}, error: normalizeTikTokM03Error(error) };
      }
    },
    async readback(operation, result) {
      if (!transport) throw new ProviderExecutionLockedError();
      const identity = result.provider_resource_id || replacementIdentity(operation) || operation.resource_identity;
      const advertiserId = String(operation.payload.advertiser_id ?? "");
      const resource = operation.provider_resource as TikTokResource;
      const action = readAction(resource);
      const response = await transport.request(action, advertiserId, {
        filtering: { [filterKey(resource)]: [identity] }, page: 1, page_size: 1,
      });
      const canonical_payload = canonicalizeTikTokPayload(response.data);
      return { resource_identity: identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() };
    },
    normalizeError: normalizeTikTokM03Error,
  };
}

export function validateTikTokM03Capabilities(items: M03ChangeItem[]): M03ValidationIssue[] {
  const issues: M03ValidationIssue[] = [];
  for (const item of items) {
    const rule = resolveTikTokRule(item.field_path);
    if (!rule || rule.mode === "unsupported") {
      issues.push(issue(item, rule?.providerField, rule?.note ?? "This field is not supported by the reviewed TikTok capability registry.", "Choose a supported TikTok field or cancel this item."));
      continue;
    }
    if (item.field_path.endsWith("status") && !["ENABLE", "DISABLE"].includes(String(item.proposed_value).toUpperCase())) {
      issues.push(issue(item, rule.providerField, "TikTok operational status must be ENABLE or DISABLE.", "Choose ENABLE or DISABLE."));
    }
    if ((item.field_path.includes("budget") || item.field_path.endsWith("bid.amount")) && !(Number(item.proposed_value) > 0)) {
      issues.push(issue(item, rule.providerField, "Budget and bid values must be greater than zero.", "Enter a positive amount in the advertiser currency."));
    }
    if (item.field_path.includes("destination_url") && !isHttpUrl(item.proposed_value)) {
      issues.push(issue(item, rule.providerField, "Destination URL must be a complete http or https URL.", "Enter the complete destination URL."));
    }
    if (rule.mode === "creative_replacement") {
      const mapping = item.platform_resource_mapping ?? {};
      if (!String(mapping.adgroup_id ?? "").trim() || !String(mapping.identity_id ?? "").trim() || !String(mapping.video_id ?? "").trim()) {
        issues.push(issue(item, rule.providerField, "TikTok creative replacement requires adgroup_id, identity_id, and video_id mappings.", "Select the synchronized ad group, identity, and video before saving."));
      }
      if (String(mapping.creative_mode ?? "REGULAR").toUpperCase() !== "REGULAR") {
        issues.push(issue(item, rule.providerField, "Only regular single-video Auction ads are supported in this phase.", "Use a regular TikTok identity and video reference."));
      }
    }
  }
  validateTikTokCombinations(items, issues);
  return issues;
}

export function planTikTokM03Mutation(input: { requestId: string; revisionHash: string; items: M03ChangeItem[] }): M03MutationPlan {
  const issues = validateTikTokM03Capabilities(input.items);
  const operations: M03ProviderOperation[] = [];
  const replacementItems: string[] = [];
  for (const item of input.items) {
    const rule = resolveTikTokRule(item.field_path);
    if (!rule || rule.mode !== "direct_update" || !rule.providerResource) continue;
    const providerField = rule.providerField ?? suffix(item.field_path);
    const mapping = item.platform_resource_mapping ?? {};
    const advertiserId = String(mapping.advertiser_id ?? mapping.account_id ?? "");
    const action = directAction(rule.providerResource, item.field_path);
    const body = directMutationBody({
      action,
      advertiserId,
      resource: rule.providerResource,
      resourceIdentity: item.entity_identity,
      providerField,
      proposedValue: item.proposed_value,
    });
    const key = `${input.requestId}:${input.revisionHash}:${item.id}:tiktok:update`;
    operations.push(tiktokOperation({ key, item, affectedItemIds: [item.id], providerResource: rule.providerResource, action: "update", mode: "direct_update", endpoint: action, body, safeToRetry: true, revisionHash: input.revisionHash, advertiserId }));
  }
  for (const [previousAdId, creativeItems] of groupReplacementItems(input.items)) {
    replacementItems.push(...creativeItems.map((item) => item.id));
    const primary = creativeItems[0]!;
    const mapping = Object.assign({}, ...creativeItems.map((item) => item.platform_resource_mapping ?? {}));
    const advertiserId = String(mapping.advertiser_id ?? mapping.account_id ?? "");
    const intendedStatus = String(mapping.intended_status ?? "DISABLE").toUpperCase();
    const base = `${input.requestId}:${input.revisionHash}:${previousAdId}:tiktok:replacement`;
    const affectedItemIds = creativeItems.map((item) => item.id);
    const createBody = buildReplacementAdSpec(creativeItems, mapping, advertiserId);
    const stages: M03ProviderOperation[] = [
      tiktokOperation({ key: `${base}:create`, item: primary, affectedItemIds, providerResource: "ad", action: "create_inactive_replacement", mode: "creative_replacement", endpoint: "ad.create", body: createBody, safeToRetry: false, revisionHash: input.revisionHash, advertiserId }),
      tiktokOperation({ key: `${base}:verify`, item: primary, affectedItemIds, providerResource: "ad", action: "verify_replacement", mode: "creative_replacement", endpoint: "ad.get", body: { advertiser_id: advertiserId, filtering: { ad_ids: ["{replacement_ad_id}"] }, page: 1, page_size: 1 }, safeToRetry: true, revisionHash: input.revisionHash, advertiserId, dependsOn: [`${base}:create`] }),
      tiktokOperation({ key: `${base}:activate`, item: primary, affectedItemIds, providerResource: "ad", action: "activate_replacement", mode: "creative_replacement", endpoint: "ad.status", body: { advertiser_id: advertiserId, ad_ids: ["{replacement_ad_id}"], operation_status: intendedStatus }, safeToRetry: true, revisionHash: input.revisionHash, advertiserId, dependsOn: [`${base}:verify`] }),
      tiktokOperation({ key: `${base}:disable-previous`, item: primary, affectedItemIds, providerResource: "ad", action: "disable_previous", mode: "creative_replacement", endpoint: "ad.status", body: { advertiser_id: advertiserId, ad_ids: [previousAdId], operation_status: "DISABLE" }, safeToRetry: true, revisionHash: input.revisionHash, advertiserId, dependsOn: [`${base}:activate`] }),
      tiktokOperation({ key: `${base}:verify-final`, item: primary, affectedItemIds, providerResource: "ad", action: "verify_final_state", mode: "creative_replacement", endpoint: "ad.get", body: { advertiser_id: advertiserId, filtering: { ad_ids: ["{replacement_ad_id}", previousAdId] }, page: 1, page_size: 2 }, safeToRetry: true, revisionHash: input.revisionHash, advertiserId, dependsOn: [`${base}:disable-previous`] }),
    ];
    operations.push(...stages);
  }
  return { platform: "tiktok", capability_registry_version: M03_TIKTOK_CAPABILITY_REGISTRY_VERSION, operations, issues, replacement_items: replacementItems };
}

function directMutationBody(input: {
  action: TikTokAdsActionName;
  advertiserId: string;
  resource: TikTokResource;
  resourceIdentity: string;
  providerField: string;
  proposedValue: unknown;
}) {
  const value = normalizeTikTokMutationValue(input.providerField, input.proposedValue);
  if (input.action.endsWith(".status")) {
    const idsKey = input.resource === "campaign"
      ? "campaign_ids"
      : input.resource === "adgroup"
        ? "adgroup_ids"
        : "ad_ids";
    return {
      advertiser_id: input.advertiserId,
      [idsKey]: [input.resourceIdentity],
      operation_status: value,
    };
  }
  return {
    advertiser_id: input.advertiserId,
    [idKey(input.resource)]: input.resourceIdentity,
    [input.providerField]: value,
  };
}

export function createTikTokAdsTransport(clientPromise: Promise<TikTokAdsClient> = createTikTokAdsClient()): TikTokM03Transport {
  return {
    async request(action, advertiserId, input) {
      const client = await clientPromise;
      const definitionIsMutation = ["campaign.update", "campaign.status", "adgroup.update", "adgroup.budget", "adgroup.status", "ad.update", "ad.status", "ad.create"].includes(action);
      const payload = definitionIsMutation ? prepareTikTokMutationPayload(action, advertiserId, input).payload : { advertiser_id: advertiserId, ...input };
      const response = await client.request(action, payload);
      return { data: response.data, requestId: response.requestId };
    },
  };
}

export function canonicalizeTikTokPayload(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeTikTokEvidence(value);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) return sanitized as Record<string, unknown>;
  return { value: sanitized };
}

export function normalizeTikTokM03Error(error: unknown): Exclude<M03ProviderExecutionResult["error"], undefined> {
  if (error instanceof ProviderExecutionLockedError) return { code: "provider_execution_locked", message: "TikTok provider execution is not enabled for this deployment.", retryable: false };
  if (error instanceof TikTokAdsApiError) return {
    code: error.details.providerCode != null ? `tiktok_${error.details.providerCode}` : `tiktok_${error.details.kind}`,
    message: error.message || "TikTok rejected the request.",
    retryable: error.details.retryable,
    provider_trace_id: error.details.requestId,
  };
  return { code: "tiktok_provider_error", message: error instanceof Error ? error.message : "TikTok request failed.", retryable: false };
}

function validateTikTokCombinations(items: M03ChangeItem[], issues: M03ValidationIssue[]) {
  const get = (path: string) => items.find((item) => item.field_path === path)?.proposed_value;
  const start = get("ad_group.schedule.start_time");
  const end = get("ad_group.schedule.end_time");
  if (start && end && new Date(String(end)).getTime() <= new Date(String(start)).getTime()) {
    const item = items.find((entry) => entry.field_path === "ad_group.schedule.end_time");
    if (item) issues.push(issue(item, "schedule_end_time", "The ad-group end time must be after its start time.", "Choose a later end time."));
  }
  const goal = String(get("ad_group.optimization_goal") ?? "").toUpperCase();
  const billing = String(get("ad_group.billing_event") ?? "").toUpperCase();
  const allowed: Record<string, string[]> = { CLICK: ["CPC"], TRAFFIC_LANDING_PAGE_VIEW: ["OCPM"], CONVERT: ["OCPM"], LEAD_GENERATION: ["OCPM"] };
  if (goal && billing && allowed[goal] && !allowed[goal]!.includes(billing)) {
    const item = items.find((entry) => entry.field_path === "ad_group.billing_event");
    if (item) issues.push(issue(item, "billing_event", `${billing} is not compatible with ${goal}.`, `Use one of: ${allowed[goal]!.join(", ")}.`));
  }
}

function tiktokOperation(input: { key: string; item: M03ChangeItem; affectedItemIds: string[]; providerResource: TikTokResource; action: M03ProviderOperation["action"]; mode: "direct_update" | "creative_replacement"; endpoint: TikTokAdsActionName; body: Record<string, unknown>; safeToRetry: boolean; revisionHash: string; advertiserId: string; dependsOn?: string[] }): M03ProviderOperation {
  return {
    operation_key: input.key, item_id: input.item.id, affected_item_ids: input.affectedItemIds, platform: "tiktok", provider_resource: input.providerResource,
    field_path: input.item.field_path, mode: input.mode, action: input.action, resource_identity: input.item.entity_identity,
    payload: { advertiser_id: input.advertiserId, proposed_value: input.item.proposed_value, baseline_value: input.item.baseline_value, revision_hash: input.revisionHash },
    transport: { method: input.endpoint.endsWith(".get") ? "GET" : "POST", endpoint: input.endpoint, body: input.body, readback_fields: [], safe_to_retry: input.safeToRetry },
    expected_result: { approved_value: input.item.proposed_value }, depends_on: input.dependsOn ?? [], idempotency_key: canonicalM03Hash(input.key),
    compensation_guidance: input.mode === "creative_replacement" ? "Preserve the verified disabled replacement ad. Resume from the last verified stage or create a new rollback request from the latest TikTok baseline." : undefined,
  };
}

function buildReplacementAdSpec(items: M03ChangeItem[], mapping: Record<string, unknown>, advertiserId: string) {
  const proposed = Object.fromEntries(items.map((item) => [item.field_path, item.proposed_value]));
  return {
    advertiser_id: advertiserId,
    adgroup_id: String(mapping.adgroup_id ?? ""),
    operation_status: "DISABLE",
    creatives: [{
      ad_name: String(mapping.replacement_ad_name ?? `M03 replacement ${items[0]?.entity_identity ?? "ad"}`),
      identity_type: String(mapping.identity_type ?? "CUSTOMIZED_USER"),
      identity_id: String(mapping.identity_id ?? ""),
      video_id: String(proposed["ad.creative.video_reference"] ?? mapping.video_id ?? ""),
      ad_text: String(proposed["ad.copy.primary_text"] ?? mapping.ad_text ?? ""),
      call_to_action: String(proposed["ad.creative.call_to_action"] ?? mapping.call_to_action ?? ""),
      landing_page_url: String(proposed["ad.creative.destination_url"] ?? mapping.landing_page_url ?? ""),
    }],
    request_id: stableRequestId(items),
  };
}

function stableRequestId(items: M03ChangeItem[]) { return Number.parseInt(canonicalM03Hash(items.map((item) => item.id)).slice(0, 13), 16).toString(); }
function groupReplacementItems(items: M03ChangeItem[]) { const map = new Map<string, M03ChangeItem[]>(); for (const item of items) { if (resolveTikTokRule(item.field_path)?.mode !== "creative_replacement") continue; map.set(item.entity_identity, [...(map.get(item.entity_identity) ?? []), item]); } return map; }
function directAction(resource: TikTokResource, fieldPath: string): TikTokAdsActionName { if (fieldPath.endsWith("status")) return resource === "campaign" ? "campaign.status" : resource === "adgroup" ? "adgroup.status" : "ad.status"; if (resource === "adgroup" && fieldPath.includes("budget")) return "adgroup.budget"; return resource === "campaign" ? "campaign.update" : resource === "adgroup" ? "adgroup.update" : "ad.update"; }
function readAction(resource: TikTokResource): TikTokAdsActionName { return resource === "campaign" ? "campaign.get" : resource === "adgroup" ? "adgroup.get" : "ad.get"; }
function filterKey(resource: TikTokResource) { return resource === "campaign" ? "campaign_ids" : resource === "adgroup" ? "adgroup_ids" : "ad_ids"; }
function idKey(resource: TikTokResource) { return resource === "campaign" ? "campaign_id" : resource === "adgroup" ? "adgroup_id" : "ad_id"; }
function replacementIdentity(operation: M03ProviderOperation) { return typeof operation.payload.replacement_ad_id === "string" ? operation.payload.replacement_ad_id : undefined; }
function resolveTikTokRule(path: string) { const normalized = path.trim().toLowerCase(); return TIKTOK_RULES.find((rule) => rule.pattern.endsWith(".*") ? normalized === rule.pattern.slice(0, -2) || normalized.startsWith(rule.pattern.slice(0, -1)) : normalized === rule.pattern); }
function issue(item: M03ChangeItem, providerField: string | undefined, message: string, correction: string): M03ValidationIssue { return { path: `items.${item.id}.${item.field_path}`, entity_type: item.entity_type, entity_identity: item.entity_identity, provider_field: providerField, severity: "error", message, capability_registry_version: M03_TIKTOK_CAPABILITY_REGISTRY_VERSION, section: item.entity_type === "campaign" ? "Campaign" : item.entity_type === "ad" ? "Ad" : "Ad group", suggested_correction: correction }; }
function direct(pattern: string, providerResource: TikTokResource, providerField?: string): TikTokRule { return { pattern, mode: "direct_update", providerResource, providerField }; }
function replacement(pattern: string): TikTokRule { return { pattern, mode: "creative_replacement", providerResource: "ad", note: "TikTok creative changes that cannot be edited safely use a disabled regular-video replacement ad." }; }
function unsupported(pattern: string, note: string): TikTokRule { return { pattern, mode: "unsupported", providerResource: null, note }; }
function suffix(path: string) { return path.split(".").at(-1) ?? path; }
function normalizeTikTokMutationValue(field: string, value: unknown) { if (["budget", "bid_price"].includes(field)) return Number(value); if (field === "operation_status") return String(value).toUpperCase(); return value; }
function isHttpUrl(value: unknown) { try { const parsed = new URL(String(value)); return parsed.protocol === "http:" || parsed.protocol === "https:"; } catch { return false; } }
function findTikTokProviderId(value: unknown): string | undefined { if (Array.isArray(value)) { for (const child of value) { const id = findTikTokProviderId(child); if (id) return id; } return undefined; } if (!value || typeof value !== "object") return undefined; const row = value as Record<string, unknown>; for (const key of ["ad_id", "adgroup_id", "campaign_id", "id"]) if (row[key] != null) return String(row[key]); for (const child of Object.values(row)) { const id = findTikTokProviderId(child); if (id) return id; } return undefined; }
function sanitizeTikTokEvidence(value: unknown): Record<string, unknown> { const redacted = redactTikTokSecrets(value); if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) return { value: redacted }; const row = redacted as Record<string, unknown>; return Object.fromEntries(Object.entries(row).filter(([key]) => !["page_info", "request_id"].includes(key))); }
