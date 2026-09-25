import { z } from "zod";
import { getAuthTableUrl, getSupabaseServerKey } from "@/lib/auth/config";
import { isAuthRole, type AuthRole } from "@/lib/auth/roles";
import { assertM03ActionAllowed, resolveTrustedIp } from "@/lib/change-control/request-context";
import {
  approveMockChangeRequest, assertM03Operator, createPostLaunchChangeRequest,
  editMockChangeRequest, getMockChangeRequest, listMockChangeRequests,
  validateMockChangeRequest,
} from "@/lib/change-control/repository";
import { verifyM03SourceBoundary } from "@/lib/change-control/source-boundary";
import { m03MockChangeRequestSchema, m03MockChangeRequestEditSchema } from "@/lib/change-control/schema";
import { M03_STATUSES, type TrustedRequestContext } from "@/lib/change-control/types";
import type { DigitalBeeScope } from "@/lib/digitalbee/service-auth";

const uuid = z.string().uuid();
const item = z.object({
  entity_type: z.string().min(1).max(100), entity_identity: z.string().min(1).max(500),
  field_path: z.string().min(1).max(500), value_type: z.enum(["string", "number", "boolean", "json", "null"]),
  baseline_value: z.json(), proposed_value: z.json(),
}).strict();
const common = { service_id: uuid };
const draft = {
  ...common, client_request_id: uuid, campaign_identity: z.string().min(1).max(500),
  title: z.string().min(1).max(200), reason: z.string().min(1).max(5_000),
  source_m04_plan_id: z.number().int().positive(), source_m04_revision_id: z.number().int().positive(),
  items: z.array(item).min(1).max(50),
};
const change = { ...common, client_request_id: uuid, change_request_id: uuid };
export const digitalBeeM03EnvelopeSchema = z.discriminatedUnion("action", [
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("list"), actor: actor(), account: account(),
    request: z.object({ ...common, status: z.enum(M03_STATUSES).optional(), campaign_identity: z.string().max(500).optional(),
      page: z.number().int().positive().default(1), page_size: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(10) }).strict() }).strict(),
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("get"), actor: actor(), account: account(),
    request: z.object({ ...common, change_request_id: uuid }).strict() }).strict(),
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("create_draft"), actor: actor(), account: account(),
    request: z.object(draft).strict() }).strict(),
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("revise_draft"), actor: actor(), account: account(),
    request: z.object({ ...draft, change_request_id: uuid, expected_lock_version: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("validate"), actor: actor(), account: account(),
    request: z.object({ ...change, expected_lock_version: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ version: z.literal("m03-review-v1"), action: z.literal("approve_revision"), actor: actor(), account: account(),
    request: z.object({ ...change, revision_id: uuid, revision_hash: z.string().regex(/^[a-f0-9]{64}$/i),
      comment: z.string().max(5_000).optional() }).strict() }).strict(),
]);

function actor() { return z.object({ subject: z.string().min(1), email: z.email(), grantRevision: z.number().int().nonnegative() }).strict(); }
function account() { return z.object({ serviceId: uuid, clientId: uuid, platform: z.enum(["Google", "Meta", "TikTok"]),
  accountId: z.string().regex(/^\d{1,30}$/), accessPath: z.string().optional(), mappingFingerprint: z.string().min(1) }).strict(); }

export type DigitalBeeM03Envelope = z.infer<typeof digitalBeeM03EnvelopeSchema>;
export class DigitalBeeM03Error extends Error {
  constructor(public readonly code: "access_denied" | "stale_revision" | "unsupported_change" | "service_unavailable", public readonly status: number) { super(code); }
}

export async function executeDigitalBeeM03Review(envelope: DigitalBeeM03Envelope, scope: DigitalBeeScope, request: Request, verifiedEmail: string) {
  assertMatchingScope(envelope, scope);
  if (envelope.actor.email.toLowerCase() !== verifiedEmail.toLowerCase()) throw new DigitalBeeM03Error("access_denied", 403);
  const operator = await lookupOperator(envelope.actor.email);
  if (!operator) throw new DigitalBeeM03Error("access_denied", 403);
  const ip = resolveTrustedIp(request);
  if (!ip) throw new DigitalBeeM03Error("access_denied", 403);
  const context: TrustedRequestContext = {
    actor_id: operator.id, actor_name: operator.name, actor_email: operator.email,
    actor_role: operator.role, trusted_ip: ip,
    user_agent: request.headers.get("user-agent")?.slice(0, 1_000) || "digitalbee-service",
  };
  await assertM03Operator(context);
  const session = { sub: operator.id, email: operator.email, role: operator.role, fullName: operator.name };
  const action = envelope.action;
  if (action === "list") {
    assertM03ActionAllowed(session, "view");
    return listMockChangeRequests({
      platform: platform(scope.platform), account_identity: scope.platformAccountId,
      status: envelope.request.status, campaign_identity: envelope.request.campaign_identity,
      page: envelope.request.page, page_size: envelope.request.page_size,
    });
  }
  if (action === "create_draft") {
    assertM03ActionAllowed(session, "create");
    const input = m03MockChangeRequestSchema.parse({
      ...draftInput(envelope.request), platform: platform(scope.platform), workflow_mode: "mock",
      client_id: scope.clientId, account_identity: scope.platformAccountId,
    });
    const source = await verifyM03SourceBoundary(input);
    if (source.source_kind !== "m04_verified_launch") throw new DigitalBeeM03Error("access_denied", 403);
    const created = await createPostLaunchChangeRequest(input, {
      source_kind: source.source_kind, source_revision_hash: source.source_revision_hash,
      evidence: source.evidence,
    }, context);
    const id = String(created.request_id ?? "");
    if (!uuid.safeParse(id).success) throw new DigitalBeeM03Error("service_unavailable", 503);
    return getMockChangeRequest(id);
  }
  const detail = await getMockChangeRequest(envelope.request.change_request_id);
  assertOwned(detail.request, scope);
  if (action === "get") { assertM03ActionAllowed(session, "view"); return detail; }
  if (action === "revise_draft") {
    assertM03ActionAllowed(session, "edit", detail.request);
    if (detail.request.lock_version !== envelope.request.expected_lock_version) throw new DigitalBeeM03Error("stale_revision", 409);
    if (detail.request.campaign_identity !== envelope.request.campaign_identity) throw new DigitalBeeM03Error("access_denied", 403);
    const editFields = {
      title: envelope.request.title, reason: envelope.request.reason,
      source_m04_plan_id: envelope.request.source_m04_plan_id,
      source_m04_revision_id: envelope.request.source_m04_revision_id,
      items: envelope.request.items, idempotency_key: envelope.request.client_request_id,
    };
    const edit = m03MockChangeRequestEditSchema.parse({ ...editFields, expected_lock_version: envelope.request.expected_lock_version });
    const revisedSource = await verifyM03SourceBoundary({
      ...editFields, campaign_identity: detail.request.campaign_identity,
      client_id: scope.clientId, account_identity: scope.platformAccountId,
      platform: platform(scope.platform), workflow_mode: "mock",
    });
    if (revisedSource.source_kind !== "m04_verified_launch") throw new DigitalBeeM03Error("access_denied", 403);
    await editMockChangeRequest(detail.request.id, edit, context);
    return getMockChangeRequest(detail.request.id);
  }
  if (action === "validate") {
    assertM03ActionAllowed(session, "validate", detail.request);
    if (detail.request.lock_version !== envelope.request.expected_lock_version) throw new DigitalBeeM03Error("stale_revision", 409);
    await validateMockChangeRequest(detail.request.id, envelope.request.client_request_id, context);
    return getMockChangeRequest(detail.request.id);
  }
  assertM03ActionAllowed(session, "approve", detail.request);
  if (detail.request.status !== "awaiting_approval" || detail.revisions[0]?.id !== envelope.request.revision_id
    || detail.revisions[0]?.payload_hash !== envelope.request.revision_hash) throw new DigitalBeeM03Error("stale_revision", 409);
  await approveMockChangeRequest(detail.request.id, envelope.request.client_request_id, envelope.request.comment, context);
  return getMockChangeRequest(detail.request.id);
}

function draftInput(input: { client_request_id: string; title: string; reason: string; campaign_identity: string;
  source_m04_plan_id: number; source_m04_revision_id: number; items: z.infer<typeof item>[] }) {
  return {
    title: input.title, reason: input.reason, campaign_identity: input.campaign_identity,
    source_m04_plan_id: input.source_m04_plan_id, source_m04_revision_id: input.source_m04_revision_id,
    items: input.items, idempotency_key: input.client_request_id,
  };
}

function assertMatchingScope(envelope: DigitalBeeM03Envelope, scope: DigitalBeeScope) {
  if (envelope.actor.subject !== scope.subject || envelope.actor.grantRevision !== scope.grantRevision
    || envelope.account.serviceId !== scope.accountPageId || envelope.account.clientId !== scope.clientId
    || envelope.account.platform !== scope.platform || envelope.account.accountId !== scope.platformAccountId
    || envelope.request.service_id !== scope.accountPageId) throw new DigitalBeeM03Error("access_denied", 403);
}

function assertOwned(request: { client_id: string | null; platform: string; account_identity: string;
  source_m04_plan_id: number | null; source_m04_revision_id: number | null }, scope: DigitalBeeScope) {
  if (request.client_id !== scope.clientId || request.platform !== platform(scope.platform)
    || request.account_identity !== scope.platformAccountId
    || !request.source_m04_plan_id || !request.source_m04_revision_id) throw new DigitalBeeM03Error("access_denied", 403);
}

function platform(value: DigitalBeeScope["platform"]): "google" | "meta" | "tiktok" {
  return value.toLowerCase() as "google" | "meta" | "tiktok";
}

async function lookupOperator(email: string): Promise<{ id: string; email: string; name: string; role: AuthRole } | null> {
  const url = getAuthTableUrl();
  const { secretKey, serviceRoleKey } = getSupabaseServerKey();
  if (!url || !secretKey) return null;
  const query = new URL(url);
  query.searchParams.set("select", "id,email,full_name,role,is_active");
  query.searchParams.set("email", `eq.${email.toLowerCase()}`);
  query.searchParams.set("limit", "1");
  const response = await fetch(query, { cache: "no-store", headers: {
    apikey: secretKey, ...(secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
  } });
  if (!response.ok) throw new DigitalBeeM03Error("service_unavailable", 503);
  const rows = await response.json() as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || row.is_active !== true || !uuid.safeParse(row.id).success || !isAuthRole(row.role)
    || String(row.email).toLowerCase() !== email.toLowerCase()) return null;
  return { id: String(row.id), email: String(row.email), name: String(row.full_name || row.email), role: row.role };
}
