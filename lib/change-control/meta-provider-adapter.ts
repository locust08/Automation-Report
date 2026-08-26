import { createHmac } from "node:crypto";
import { getCredentials } from "@/lib/reporting/env";
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
import { getM03MetaChangeField, type M03MetaChangeField } from "@/lib/change-control/meta-capability-registry";
import type { M03ChangeItem, M03ValidationIssue } from "@/lib/change-control/types";

export const M03_META_CAPABILITY_REGISTRY_VERSION = 2 as const;
export const M03_META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";

type MetaMode = "direct_update" | "creative_replacement" | "unsupported";
type MetaRule = { pattern: string; mode: MetaMode; providerResource: "campaign" | "adset" | "ad" | "adcreative" | null; providerField?: string; note?: string };
type MetaTransportRequest = { method: "GET" | "POST"; endpoint: string; body?: Record<string, unknown>; fields?: string[] };
export type MetaTransportResponse = { id?: string; payload: Record<string, unknown>; traceId?: string };
export interface MetaM03Transport { request(input: MetaTransportRequest): Promise<MetaTransportResponse>; }

const META_RULES: MetaRule[] = [
  direct("campaign.budget.daily_budget", "campaign", "daily_budget"),
  direct("campaign.budget.lifetime_budget", "campaign", "lifetime_budget"),
  unsupported("campaign.objective", "Meta does not support changing a campaign objective after creation."),
  unsupported("campaign.buying_type", "Meta does not support changing buying type after creation."),
  unsupported("campaign.special_ad_categories", "Special-ad-category identity is immutable after creation."),
  direct("ad_group.name", "adset", "name"), direct("ad_group.status", "adset", "status"),
  direct("ad_group.budget.daily", "adset", "daily_budget"), direct("ad_group.budget.lifetime", "adset", "lifetime_budget"),
  direct("ad_group.schedule.start_time", "adset", "start_time"), direct("ad_group.schedule.end_time", "adset", "end_time"),
  direct("ad_group.bid.amount", "adset", "bid_amount"), direct("ad_group.bid.strategy", "adset", "bid_strategy"),
  direct("ad_group.billing_event", "adset", "billing_event"), direct("ad_group.optimization_goal", "adset", "optimization_goal"),
  direct("ad_set.attribution.*", "adset"), direct("ad_group.attribution.*", "adset"),
  direct("ad_set.targeting.*", "adset"), direct("ad_group.targeting.*", "adset"),
  direct("ad_set.placements.*", "adset"), direct("ad_group.placements.*", "adset"),
  direct("ad_set.promoted_object.*", "adset"), direct("ad_group.promoted_object.*", "adset"),
  replacement("ad.copy.*"), replacement("ad.creative.*"),
];

export type MetaM03AdapterOptions = {
  retrieveBaseline?: M03ProviderAdapter["retrieveBaseline"];
  transport?: MetaM03Transport;
};

export function createMetaM03Adapter(options: MetaM03AdapterOptions = {}): M03ProviderAdapter {
  const transport = options.transport;
  return {
    platform: "meta",
    capabilityRegistryVersion: M03_META_CAPABILITY_REGISTRY_VERSION,
    async retrieveBaseline(input) {
      if (options.retrieveBaseline) return options.retrieveBaseline(input);
      const canonical_payload = Object.fromEntries(input.items.map((item) => [m03BaselineKey(item), item.baseline_value]));
      return { platform: "meta", account_identity: input.accountIdentity, campaign_identity: input.campaignIdentity, captured_at: new Date().toISOString(), canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), source: "stored_snapshot" } satisfies M03ProviderBaseline;
    },
    validateCapabilities: validateMetaM03Capabilities,
    planMutation: planMetaM03Mutation,
    async executeOperation(operation) {
      if (!transport) throw new ProviderExecutionLockedError();
      if (!operation.transport) throw new Error(`Meta operation ${operation.operation_key} has no transport description.`);
      const resolved = resolveOperationTransport(operation);
      try {
        const response = await transport.request({ method: resolved.method, endpoint: resolved.endpoint, body: resolved.body, fields: resolved.readback_fields });
        return { operation_key: operation.operation_key, outcome: "succeeded", provider_resource_id: response.id, provider_response: sanitizeMetaEvidence(response.payload) as Record<string, unknown> };
      } catch (error) {
        return { operation_key: operation.operation_key, outcome: "failed", provider_response: {}, error: normalizeMetaM03Error(error) };
      }
    },
    async readback(operation, result) {
      if (!transport) throw new ProviderExecutionLockedError();
      const identity = result.provider_resource_id || resolveEndpointIdentity(operation);
      if (!identity) throw new Error(`Meta readback identity is unavailable for ${operation.operation_key}.`);
      const fields = operation.transport?.readback_fields ?? [];
      const response = await transport.request({ method: "GET", endpoint: identity, fields });
      const canonical_payload = canonicalizeMetaPayload(response.payload);
      return { resource_identity: identity, canonical_payload, payload_hash: canonicalM03Hash(canonical_payload), verified_at: new Date().toISOString() };
    },
    normalizeError: normalizeMetaM03Error,
  };
}

export function validateMetaM03Capabilities(items: M03ChangeItem[]): M03ValidationIssue[] {
  const issues: M03ValidationIssue[] = [];
  for (const item of items) {
    const rule = resolveMetaRule(item.field_path);
    if (!rule || rule.mode === "unsupported") {
      issues.push(issue(item, rule?.providerField, rule?.note ?? "This field is not supported by the reviewed Meta capability registry.", "Choose a supported Meta field or cancel this item."));
      continue;
    }
    const configuration = String(item.platform_resource_mapping?.provider_configuration ?? "").toLowerCase();
    if (["advantage_plus_shopping", "advantage_plus_app"].includes(configuration)) {
      issues.push(issue(item, rule.providerField, `This provider-managed Advantage+ configuration cannot be updated through Meta Graph API ${M03_META_GRAPH_API_VERSION}.`, "Create a supported replacement campaign through Campaign Planning & Launch."));
      continue;
    }
    if (isPositiveNumberPath(item.field_path) && !(Number(item.proposed_value) > 0)) {
      issues.push(issue(item, rule.providerField, "Budget and bid values must be greater than zero.", "Enter a positive amount in the account currency."));
    }
    if (item.field_path.endsWith("status") && !["ACTIVE", "PAUSED"].includes(String(item.proposed_value).toUpperCase())) {
      issues.push(issue(item, rule.providerField, "Meta operational status must be ACTIVE or PAUSED.", "Choose ACTIVE or PAUSED."));
    }
    if (item.field_path.includes("destination_url") && !isHttpUrl(item.proposed_value)) {
      issues.push(issue(item, rule.providerField, "Destination URL must be a complete http or https URL.", "Enter the complete landing-page URL."));
    }
    if ((item.field_path.includes("image") || item.field_path.includes("video") || item.field_path.includes("existing_post")) && isBlank(item.proposed_value)) {
      issues.push(issue(item, rule.providerField, "A provider resource reference is required for this creative change.", "Select or enter a resolved Meta resource reference."));
    }
  }
  validateMetaCombinations(items, issues);
  return issues;
}

export function planMetaM03Mutation(input: { requestId: string; revisionHash: string; items: M03ChangeItem[] }): M03MutationPlan {
  const issues = validateMetaM03Capabilities(input.items);
  const operations: M03ProviderOperation[] = [];
  const replacementItems: string[] = [];
  for (const item of input.items) {
    const rule = resolveMetaRule(item.field_path);
    if (!rule || rule.mode !== "direct_update" || !rule.providerResource) continue;
    const providerField = rule.providerField ?? suffix(item.field_path);
    const key = `${input.requestId}:${input.revisionHash}:${item.id}:meta:update`;
    operations.push(metaOperation({ key, item, affectedItemIds: [item.id], providerResource: rule.providerResource, action: "update", mode: "direct_update", endpoint: item.entity_identity, method: "POST", body: { [providerField]: normalizeMetaMutationValue(providerField, item.proposed_value) }, readbackFields: [providerField], safeToRetry: true, revisionHash: input.revisionHash }));
  }
  const creativeGroups = groupCreativeItems(input.items);
  for (const [previousAdId, creativeItems] of creativeGroups) {
    replacementItems.push(...creativeItems.map((item) => item.id));
    const primary = creativeItems[0]!;
    const base = `${input.requestId}:${input.revisionHash}:${previousAdId}:meta:replacement`;
    const affectedItemIds = creativeItems.map((item) => item.id);
    const mapping = mergeMappings(creativeItems);
    const creativeSpec = buildCreativeSpec(creativeItems, mapping);
    const account = normalizeMetaAccount(String(mapping.account_id ?? mapping.account_identity ?? ""));
    const adSetId = String(mapping.ad_set_id ?? mapping.adset_id ?? "");
    const intendedStatus = String(mapping.intended_status ?? "PAUSED").toUpperCase();
    const stages = [
      metaOperation({ key: `${base}:creative:create`, item: primary, affectedItemIds, providerResource: "adcreative", action: "create_replacement_creative", mode: "creative_replacement", endpoint: `act_${account}/adcreatives`, method: "POST", body: creativeSpec, readbackFields: ["id", "name", "object_story_spec", "asset_feed_spec", "effective_object_story_id"], safeToRetry: false, revisionHash: input.revisionHash }),
      metaOperation({ key: `${base}:creative:verify`, item: primary, affectedItemIds, providerResource: "adcreative", action: "verify_replacement_creative", mode: "creative_replacement", endpoint: "{replacement_creative_id}", method: "GET", body: {}, readbackFields: ["id", "name", "object_story_spec", "asset_feed_spec", "effective_object_story_id"], safeToRetry: true, revisionHash: input.revisionHash, dependsOn: [`${base}:creative:create`] }),
      metaOperation({ key: `${base}:ad:create-paused`, item: primary, affectedItemIds, providerResource: "ad", action: "create_paused_replacement_ad", mode: "creative_replacement", endpoint: `act_${account}/ads`, method: "POST", body: { name: String(mapping.replacement_ad_name ?? `M03 replacement ${previousAdId}`), adset_id: adSetId, creative: { creative_id: "{replacement_creative_id}" }, status: "PAUSED" }, readbackFields: ["id", "name", "status", "effective_status", "creative"], safeToRetry: false, revisionHash: input.revisionHash, dependsOn: [`${base}:creative:verify`] }),
      metaOperation({ key: `${base}:ad:verify-paused`, item: primary, affectedItemIds, providerResource: "ad", action: "verify_replacement_ad", mode: "creative_replacement", endpoint: "{replacement_ad_id}", method: "GET", body: {}, readbackFields: ["id", "name", "status", "effective_status", "creative"], safeToRetry: true, revisionHash: input.revisionHash, dependsOn: [`${base}:ad:create-paused`] }),
      metaOperation({ key: `${base}:ad:activate`, item: primary, affectedItemIds, providerResource: "ad", action: "activate_replacement", mode: "creative_replacement", endpoint: "{replacement_ad_id}", method: "POST", body: { status: intendedStatus }, readbackFields: ["id", "status", "effective_status"], safeToRetry: true, revisionHash: input.revisionHash, dependsOn: [`${base}:ad:verify-paused`] }),
      metaOperation({ key: `${base}:ad:disable-previous`, item: primary, affectedItemIds, providerResource: "ad", action: "disable_previous", mode: "creative_replacement", endpoint: previousAdId, method: "POST", body: { status: "PAUSED" }, readbackFields: ["id", "status", "effective_status"], safeToRetry: true, revisionHash: input.revisionHash, dependsOn: [`${base}:ad:activate`] }),
      metaOperation({ key: `${base}:ad:verify-final`, item: primary, affectedItemIds, providerResource: "ad", action: "verify_final_state", mode: "creative_replacement", endpoint: "{replacement_ad_id}", method: "GET", body: { previous_ad_id: previousAdId }, readbackFields: ["id", "status", "effective_status", "creative"], safeToRetry: true, revisionHash: input.revisionHash, dependsOn: [`${base}:ad:disable-previous`] }),
    ];
    operations.push(...stages);
    if (!account || !adSetId) issues.push(issue(primary, "creative", "Creative replacement requires Meta account_id and ad_set_id resource mappings.", "Select the synchronized account, ad set, and ad before saving the creative change."));
  }
  return { platform: "meta", capability_registry_version: M03_META_CAPABILITY_REGISTRY_VERSION, operations, issues, replacement_items: replacementItems };
}

export function createMetaGraphTransport(fetcher: typeof globalThis.fetch = globalThis.fetch): MetaM03Transport {
  return {
    async request(input) {
      const token = getCredentials().metaAccessToken;
      if (!token) throw new Error("Meta credentials are unavailable.");
      const url = new URL(`https://graph.facebook.com/${M03_META_GRAPH_API_VERSION}/${input.endpoint.replace(/^\//, "")}`);
      const body = input.body ?? {};
      if (input.method === "GET" && input.fields?.length) url.searchParams.set("fields", input.fields.join(","));
      url.searchParams.set("access_token", token);
      const secret = process.env.META_APP_SECRET?.trim();
      if (secret) url.searchParams.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
      const response = await fetcher(url, {
        method: input.method,
        body: input.method === "POST" ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || payload.error) throw new MetaGraphRequestError(payload, response.status);
      return { id: typeof payload.id === "string" ? payload.id : undefined, payload: sanitizeMetaEvidence(payload) as Record<string, unknown>, traceId: readTraceId(payload) };
    },
  };
}

export function canonicalizeMetaPayload(value: unknown): Record<string, unknown> {
  return sanitizeMetaEvidence(value) as Record<string, unknown>;
}

export function normalizeMetaM03Error(error: unknown): Exclude<M03ProviderExecutionResult["error"], undefined> {
  if (error instanceof ProviderExecutionLockedError) return { code: "provider_execution_locked", message: "Meta provider execution is not enabled for this deployment.", retryable: false };
  if (error instanceof MetaGraphRequestError) {
    const meta = error.meta;
    const code = Number(meta.code ?? 0); const subcode = Number(meta.error_subcode ?? 0);
    return {
      code: `meta_${code}${subcode ? `_${subcode}` : ""}`,
      message: String(meta.error_user_msg ?? meta.message ?? "Meta rejected the request."),
      retryable: Boolean(meta.is_transient),
      provider_error_subcode: subcode || undefined,
      provider_trace_id: typeof meta.fbtrace_id === "string" ? meta.fbtrace_id : undefined,
      user_title: typeof meta.error_user_title === "string" ? meta.error_user_title : undefined,
    };
  }
  return { code: "meta_provider_error", message: error instanceof Error ? error.message : "Meta request failed.", retryable: false };
}

class MetaGraphRequestError extends Error {
  readonly meta: Record<string, unknown>;
  constructor(payload: Record<string, unknown>, readonly status: number) {
    const meta = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : payload;
    super(String(meta.message ?? "Meta request failed.")); this.name = "MetaGraphRequestError"; this.meta = meta;
  }
}

function validateMetaCombinations(items: M03ChangeItem[], issues: M03ValidationIssue[]) {
  const value = (suffixes: string[]) => items.find((item) => suffixes.some((suffixValue) => item.field_path.endsWith(suffixValue)))?.proposed_value;
  const lifetimeBudget = value(["budget.lifetime", "budget.lifetime_budget"]);
  const endTime = value(["schedule.end_time"]);
  if (lifetimeBudget != null && !isBlank(lifetimeBudget) && isBlank(endTime)) {
    const item = items.find((entry) => entry.field_path.includes("budget.lifetime"));
    if (item) issues.push(issue(item, "lifetime_budget", "A lifetime budget requires an ad-set end time in the same revision.", "Add ad_set.schedule.end_time."));
  }
  const bidStrategy = String(value(["bid.strategy"]) ?? "").toUpperCase();
  const bidAmount = value(["bid.amount"]);
  if (["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(bidStrategy) && !(Number(bidAmount) > 0)) {
    const item = items.find((entry) => entry.field_path.endsWith("bid.strategy"));
    if (item) issues.push(issue(item, "bid_amount", `${bidStrategy} requires a positive bid amount.`, "Add ad_set.bid.amount in the same revision."));
  }
  const optimization = String(value(["optimization_goal"]) ?? "").toUpperCase();
  const billing = String(value(["billing_event"]) ?? "").toUpperCase();
  const allowedBilling: Record<string, string[]> = { LINK_CLICKS: ["IMPRESSIONS", "LINK_CLICKS"], LANDING_PAGE_VIEWS: ["IMPRESSIONS"], OFFSITE_CONVERSIONS: ["IMPRESSIONS"] };
  if (optimization && billing && allowedBilling[optimization] && !allowedBilling[optimization]!.includes(billing)) {
    const item = items.find((entry) => entry.field_path.endsWith("billing_event"));
    if (item) issues.push(issue(item, "billing_event", `${billing} is not compatible with ${optimization}.`, `Use one of: ${allowedBilling[optimization]!.join(", ")}.`));
  }
}

function metaOperation(input: { key: string; item: M03ChangeItem; affectedItemIds: string[]; providerResource: string; action: M03ProviderOperation["action"]; mode: "direct_update" | "creative_replacement"; endpoint: string; method: "GET" | "POST"; body: Record<string, unknown>; readbackFields: string[]; safeToRetry: boolean; revisionHash: string; dependsOn?: string[] }): M03ProviderOperation {
  return {
    operation_key: input.key, item_id: input.item.id, affected_item_ids: input.affectedItemIds, platform: "meta", provider_resource: input.providerResource,
    field_path: input.item.field_path, mode: input.mode, action: input.action, resource_identity: input.item.entity_identity,
    payload: { proposed_value: input.item.proposed_value, baseline_value: input.item.baseline_value, revision_hash: input.revisionHash },
    transport: { method: input.method, endpoint: input.endpoint, body: input.body, readback_fields: input.readbackFields, safe_to_retry: input.safeToRetry },
    expected_result: { approved_value: input.item.proposed_value }, depends_on: input.dependsOn ?? [], idempotency_key: canonicalM03Hash(input.key),
    compensation_guidance: input.mode === "creative_replacement" ? "Preserve verified replacement resources. Resume from the last verified stage or create a new rollback request from the latest official baseline." : "Refresh the official baseline before an explicit retry.",
  };
}

function resolveOperationTransport(operation: M03ProviderOperation) {
  const transport = operation.transport!;
  const resources = operation.payload.resolved_resources && typeof operation.payload.resolved_resources === "object" ? operation.payload.resolved_resources as Record<string, unknown> : {};
  const replace = (value: string) => value.replaceAll("{replacement_creative_id}", String(resources.replacement_creative_id ?? "")).replaceAll("{replacement_ad_id}", String(resources.replacement_ad_id ?? ""));
  const replaceValue = (value: unknown): unknown => typeof value === "string" ? replace(value) : Array.isArray(value) ? value.map(replaceValue) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, replaceValue(entry)])) : value;
  const endpoint = replace(transport.endpoint);
  if (!endpoint.trim() || endpoint.includes("{}") || endpoint.endsWith("/")) throw new Error(`A durable Meta resource identity is required before ${operation.action}.`);
  return { ...transport, endpoint, body: replaceValue(transport.body) as Record<string, unknown> };
}

function resolveEndpointIdentity(operation: M03ProviderOperation) {
  if (!operation.transport) return operation.resource_identity;
  const endpoint = resolveOperationTransport(operation).endpoint;
  return endpoint.includes("/") ? operation.resource_identity : endpoint;
}

function groupCreativeItems(items: M03ChangeItem[]) {
  const groups = new Map<string, M03ChangeItem[]>();
  for (const item of items) if (resolveMetaRule(item.field_path)?.mode === "creative_replacement") groups.set(item.entity_identity, [...(groups.get(item.entity_identity) ?? []), item]);
  return groups;
}

function buildCreativeSpec(items: M03ChangeItem[], mapping: Record<string, unknown>) {
  const proposed = Object.fromEntries(items.map((item) => [suffix(item.field_path), item.proposed_value]));
  const name = String(mapping.replacement_creative_name ?? `M03 replacement creative ${items[0]?.entity_identity ?? ""}`);
  if (proposed.existing_post_reference) return { name, object_story_id: proposed.existing_post_reference };
  const linkData: Record<string, unknown> = {
    message: proposed.primary_text, name: proposed.headline, description: proposed.description,
    link: proposed.destination_url, call_to_action: proposed.call_to_action ? { type: proposed.call_to_action, value: { link: proposed.destination_url } } : undefined,
    image_hash: proposed.image_reference, video_id: proposed.video_reference,
  };
  const objectStorySpec: Record<string, unknown> = { page_id: mapping.page_id, instagram_actor_id: mapping.instagram_actor_id, link_data: compact(linkData) };
  if (Array.isArray(proposed.carousel_cards)) objectStorySpec.link_data = { ...compact(linkData), child_attachments: proposed.carousel_cards };
  return { name, object_story_spec: compact(objectStorySpec) };
}

function mergeMappings(items: M03ChangeItem[]) { return Object.assign({}, ...items.map((item) => item.platform_resource_mapping ?? {})); }
function resolveMetaRule(path: string) {
  const definition = getM03MetaChangeField(path);
  if (definition) return metaRuleFromDefinition(definition);
  const normalized = path.trim().toLowerCase();
  return META_RULES.find((rule) => rule.pattern.endsWith(".*") ? normalized === rule.pattern.slice(0, -2) || normalized.startsWith(rule.pattern.slice(0, -1)) : normalized === rule.pattern);
}
function metaRuleFromDefinition(definition: M03MetaChangeField): MetaRule { return { pattern: definition.field_path, mode: definition.mutation_mode, providerResource: definition.provider_resource, providerField: definition.provider_field }; }
function issue(item: M03ChangeItem, providerField: string | undefined, message: string, correction: string): M03ValidationIssue { return { path: `items.${item.id}.${item.field_path}`, entity_type: item.entity_type, entity_identity: item.entity_identity, provider_field: providerField, severity: "error", message, capability_registry_version: M03_META_CAPABILITY_REGISTRY_VERSION, section: item.field_path.startsWith("ad.creative") || item.field_path.startsWith("ad.copy") ? "Creative replacement" : item.entity_type === "campaign" ? "Campaign" : item.entity_type === "ad" ? "Ad" : "Ad set", suggested_correction: correction }; }
function direct(pattern: string, providerResource: Exclude<MetaRule["providerResource"], null>, providerField?: string): MetaRule { return { pattern, mode: "direct_update", providerResource, providerField }; }
function replacement(pattern: string): MetaRule { return { pattern, mode: "creative_replacement", providerResource: "adcreative", note: "Meta creative changes use a paused replacement ad and verified provider-native switch." }; }
function unsupported(pattern: string, note: string): MetaRule { return { pattern, mode: "unsupported", providerResource: null, note }; }
function suffix(path: string) { return path.split(".").at(-1) ?? path; }
function isPositiveNumberPath(path: string) { return path.includes("budget") || path.endsWith("bid.amount"); }
function isBlank(value: unknown) { return value == null || (typeof value === "string" && value.trim() === ""); }
function isHttpUrl(value: unknown) { try { const parsed = new URL(String(value)); return parsed.protocol === "http:" || parsed.protocol === "https:"; } catch { return false; } }
function normalizeMetaAccount(value: string) { return value.replace(/^act_/, "").replace(/\D/g, ""); }
function normalizeMetaMutationValue(field: string, value: unknown) { if (["daily_budget", "lifetime_budget", "bid_amount"].includes(field)) return String(Math.round(Number(value))); return value; }
function compact(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")); }
function sanitizeMetaEvidence(value: unknown): unknown { if (Array.isArray(value)) return value.map(sanitizeMetaEvidence); if (!value || typeof value !== "object") return value; const blocked = new Set(["access_token", "appsecret_proof", "token", "app_secret"]); return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !blocked.has(key.toLowerCase())).filter(([key]) => !["__fb_trace_id__", "paging", "summary"].includes(key)).map(([key, entry]) => [key, sanitizeMetaEvidence(entry)])); }
function readTraceId(payload: Record<string, unknown>) { const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {}; return typeof error.fbtrace_id === "string" ? error.fbtrace_id : undefined; }
