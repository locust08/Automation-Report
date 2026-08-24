import type { M03MockChangeRequestInput } from "@/lib/change-control/types";
import { resolveCampaignActorId } from "@/lib/campaign-planning/supabase-repository";

type JsonObject = Record<string, unknown>;
type Actor = { id: string; name: string };

export class M03RepositoryError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "M03RepositoryError"; }
}

export async function listMockChangeRequests(): Promise<JsonObject[]> {
  return request<JsonObject[]>("m03_ads_change_requests?select=*&order=updated_at.desc", { method: "GET" });
}

export async function getMockChangeRequest(id: string): Promise<JsonObject> {
  const [requestRows, itemRows, revisionRows, validationRows, approvalRows, eventRows] = await Promise.all([
    request<JsonObject[]>(`m03_ads_change_requests?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_items?select=*&request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_request_revisions?select=*&request_id=eq.${encodeURIComponent(id)}&order=revision_number.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_validation_records?select=*&request_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_approvals?select=*&request_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_events?select=*&request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { method: "GET" }),
  ]);
  if (!requestRows[0]) throw new M03RepositoryError("Change request was not found.", 404);
  return { request: requestRows[0], items: itemRows, revisions: revisionRows, validations: validationRows, approvals: approvalRows, events: eventRows, provider_execution_locked: true };
}

export async function createMockChangeRequest(input: M03MockChangeRequestInput, actor: Actor): Promise<JsonObject> {
  return request<JsonObject>("rpc/m03_ads_create_mock_change_request", { method: "POST", body: {
    p_platform: input.platform, p_title: input.title, p_reason: input.reason, p_client_id: input.client_id ?? null,
    p_account_identity: input.account_identity, p_campaign_identity: input.campaign_identity,
    p_source_m04_plan_id: input.source_m04_plan_id ?? null, p_source_m04_revision_id: input.source_m04_revision_id ?? null,
    p_items: input.items, p_actor_id: resolveCampaignActorId(actor.id), p_actor_name: actor.name,
    p_idempotency_key: input.idempotency_key,
  } });
}

export async function validateMockChangeRequest(id: string, idempotencyKey: string, actor: Actor): Promise<JsonObject> {
  return request<JsonObject>("rpc/m03_ads_validate_mock_change_request", { method: "POST", body: {
    p_request_id: id, p_actor_id: resolveCampaignActorId(actor.id), p_actor_name: actor.name, p_idempotency_key: idempotencyKey,
  } });
}

export async function approveMockChangeRequest(id: string, idempotencyKey: string, comment: string | undefined, actor: Actor): Promise<JsonObject> {
  return request<JsonObject>("rpc/m03_ads_approve_mock_change_request", { method: "POST", body: {
    p_request_id: id, p_actor_id: resolveCampaignActorId(actor.id), p_actor_name: actor.name, p_comment: comment ?? null, p_idempotency_key: idempotencyKey,
  } });
}

function config() {
  const origin = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!origin || !key || new URL(origin).hostname !== "gsmxeosdjsbujhiwhbzk.supabase.co") throw new M03RepositoryError("M03 requires the approved CRM08 Supabase project.", 503);
  return { rest: `${new URL(origin).origin}/rest/v1`, key };
}

async function request<T>(path: string, init: { method: "GET" | "POST"; body?: JsonObject }): Promise<T> {
  const { rest, key } = config();
  const response = await fetch(`${rest}/${path}`, { method: init.method, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const value = payload && typeof payload === "object" ? payload as JsonObject : {};
    throw new M03RepositoryError(typeof value.message === "string" ? value.message : "M03 Supabase request failed.", response.status === 404 ? 404 : response.status === 403 ? 403 : 409);
  }
  return payload as T;
}
