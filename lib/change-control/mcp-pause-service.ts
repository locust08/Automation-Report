import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { resolveTrustedIp } from "./request-context";
import { assertPauseTarget, assertScopedPause, createScopedPauseAdapter } from "./scoped-pause";
import { getM03McpOperator, assertM03Operator, getMockChangeRequest, createPostLaunchChangeRequest, validateMockChangeRequest, approveExactM03Pause, getM03ExecutionReceipts, getM03RevisionIntegrityReceipt } from "./repository";
import { assertM03ReviewedItems, assertM03RevisionIntegrity } from "./revision-integrity";
import { verifyM03SourceBoundary } from "./source-boundary";
import { officialPauseTransport } from "./pause-transport";
import { executeScopedPause } from "./pause-action";
import { buildM03ProviderWorkflowPreview } from "./provider-workflow";
import { canonicalM03Hash } from "./provider-contract";
import type { M03ChangeRequestDetail, TrustedRequestContext } from "./types";

const id = z.string().uuid(), numeric = z.string().regex(/^\d{1,30}$/);
const refs = z.object({ workflow_id: id, revision_id: id, receipt_id: id }).strict();
export const pauseBody = z.object({
  action: z.enum(["prepare_approve", "prepare_pause", "approve", "pause", "read"]),
  service_id: id, campaign_id: numeric, idempotency_key: id,
  request_id: id.optional(), source: refs.optional(), confirmation_token: z.string().min(16).max(8192).optional(),
}).strict();
const delegation = z.object({ subject: z.string().min(1).max(255), grantRevision: z.number().int().nonnegative(), accountPageId: id, clientId: id,
  platform: z.enum(["Google", "Meta"]), platformAccountId: numeric, campaignIdentity: numeric,
  connectionRevision: z.string().min(1).max(255), action: z.string(), requestHash: z.string(), sessionBinding: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const confirmation = z.object({ request_id: id, revision_id: id, revision_hash: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["approve", "pause"]), scope_hash: z.string(), operation_key: id });
const real = { operator: getM03McpOperator, assertOperator: assertM03Operator, get: getMockChangeRequest, create: createPostLaunchChangeRequest,
  validate: validateMockChangeRequest, approve: approveExactM03Pause, integrity: getM03RevisionIntegrityReceipt, boundary: verifyM03SourceBoundary, transport: officialPauseTransport,
  execute: executeScopedPause, receipts: getM03ExecutionReceipts, preview: buildM03ProviderWorkflowPreview, fetch: globalThis.fetch };
export type McpPauseDependencies = typeof real;
const digest = async (text: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("base64url");
const json = (value: Record<string, unknown>, status = 200) => Response.json({ correlation_id: crypto.randomUUID(), ...value }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

// Cookie-independent service boundary; domain workflow remains usable after dashboard retirement.
export async function mcpPauseService(request: Request, deps: McpPauseDependencies = real, env: Record<string, string | undefined> = process.env): Promise<Response> {
  if (request.method !== "POST") return json({ outcome: "unavailable" }, 405);
  if (env.M03_PAUSE_MCP_ENABLED !== "true" || !env.M03_PAUSE_MCP_SERVICE_TOKEN || env.M03_PAUSE_MCP_SERVICE_TOKEN.length < 32 || !env.M03_PAUSE_MCP_DELEGATION_KEY || env.M03_PAUSE_MCP_DELEGATION_KEY.length < 32) return json({ outcome: "locked" }, 503);
  let attempted = false;
  try {
    const reader = request.body?.getReader(); if (!reader) throw Error("invalid_request");
    let bytes = 0; const parts: Uint8Array[] = [];
    try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 16384) throw Error("invalid_request"); parts.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const raw = Buffer.concat(parts).toString("utf8");
    const auth = request.headers.get("Authorization") ?? "";
    if (await digest(auth) !== await digest(`Bearer ${env.M03_PAUSE_MCP_SERVICE_TOKEN}`)) throw Error("access_denied");
    const key = new TextEncoder().encode(env.M03_PAUSE_MCP_DELEGATION_KEY);
    const { payload } = await jwtVerify(request.headers.get("X-DigitalBee-Delegation") ?? "", key, { algorithms: ["HS256"], issuer: "digitalbee", audience: new URL(request.url).origin, maxTokenAge: "30s", requiredClaims: ["sub", "iat", "exp", "jti"] });
    const scope = delegation.parse(payload), body = pauseBody.parse(JSON.parse(raw));
    if (payload.sub !== scope.subject || scope.subject !== env.M03_PAUSE_MCP_SUBJECT || scope.requestHash !== await digest(raw)
      || scope.accountPageId !== body.service_id || scope.campaignIdentity !== body.campaign_id || scope.action !== `m03_pause:${body.action}`
      || scope.connectionRevision !== env.M03_PAUSE_MCP_CONNECTION_REVISION || request.headers.get("X-Connection-Revision") !== scope.connectionRevision) throw Error("access_denied");
    const target = { platform: scope.platform.toLowerCase(), account_identity: scope.platformAccountId, campaign_identity: scope.campaignIdentity };
    let context: TrustedRequestContext;
    async function reauthorize() {
      const actor = await deps.operator(id.parse(env.M03_PAUSE_MCP_ACTOR_ID));
      const ip = resolveTrustedIp(request);
      if (!actor || !ip) throw Error("access_denied");
      context = { ...actor, trusted_ip: ip, user_agent: "DigitalBee MCP pause confirmation" };
      assertPauseTarget(target, context, env);
      const url = new URL(env.DIGITALBEE_GRANT_VERIFY_URL ?? "");
      if (url.protocol !== "https:" || url.pathname !== "/v1/internal/grants/verify" || url.username || url.password || url.search || url.hash || !env.DIGITALBEE_GRANT_VERIFY_TOKEN || env.DIGITALBEE_GRANT_VERIFY_TOKEN.length < 32) throw Error("access_denied");
      const grant = Object.fromEntries(Object.entries(scope).filter(([key]) => !["requestHash", "sessionBinding"].includes(key)));
      const response = await deps.fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${env.DIGITALBEE_GRANT_VERIFY_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(grant) });
      const decision = await response.json();
      if (!response.ok || decision.allowed !== true || decision.email?.toLowerCase() !== actor.actor_email.toLowerCase() || Object.entries(grant).some(([k, v]) => decision[k] !== v)) throw Error("access_denied");
      await deps.assertOperator(context);
    }
    await reauthorize();
    const scopeHash = canonicalM03Hash({ ...target, subject: scope.subject, actor_id: context!.actor_id, grantRevision: scope.grantRevision, service_id: body.service_id, client_id: scope.clientId, connectionRevision: scope.connectionRevision, sessionBinding: scope.sessionBinding });
    let requestId = body.request_id;
    if (!requestId) {
      if (body.action !== "prepare_approve" || !body.source) throw Error("request_id_required");
      const observed = await (await deps.transport(assertPauseTarget(target, context!, env))).read();
      if (observed.account_id !== target.account_identity || observed.campaign_id !== target.campaign_identity) throw Error("source_changed");
      const input = { ...target, platform: target.platform as "google" | "meta", workflow_mode: "mock" as const, title: "M18 campaign pause", reason: "User-reviewed pause of the exact M18 pilot through ChatGPT.", idempotency_key: body.idempotency_key,
        items: [{ entity_type: "campaign", entity_identity: body.campaign_id, field_path: "campaign.status", value_type: "string" as const, baseline_value: observed.status, proposed_value: "PAUSED", evidence: { m18_workflow_id: body.source.workflow_id, m18_revision_id: body.source.revision_id, m18_receipt_id: body.source.receipt_id } }] };
      const source = await deps.boundary(input);
      await reauthorize();
      const created = await deps.create(input, { source_kind: source.source_kind, evidence: source.evidence, source_revision_hash: source.source_kind === "m04_verified_launch" ? source.source_revision_hash : null, baseline: source.source_kind === "legacy_provider_adoption" ? source.baseline : undefined }, context!);
      requestId = id.parse(created.request_id);
    }
    async function current() {
      await reauthorize();
      const detail = await deps.get(requestId!);
      assertScopedPause(detail, context!, env);
      if (detail.request.platform !== target.platform || detail.request.account_identity !== target.account_identity || detail.request.campaign_identity !== target.campaign_identity) throw Error("scope_changed");
      return detail;
    }
    let detail = await current();
    if (body.action === "prepare_approve" && ["draft", "validation_failed"].includes(detail.request.status)) {
      await deps.validate(requestId, `${body.idempotency_key}:validate`, context!); detail = await current();
    }
    const revision = detail.revisions[0];
    if (!revision) throw Error("validated_revision_required");
    assertM03RevisionIntegrity(revision, await deps.integrity(requestId, revision.id, revision.payload_hash));
    assertM03ReviewedItems(detail, revision);
    const display = (d: M03ChangeRequestDetail) => ({ request_id: requestId, revision_id: revision.id, revision_hash: revision.payload_hash, platform: scope.platform, account_id: target.account_identity, campaign_id: body.campaign_id, status: d.request.status,
      baseline: d.items[0]!.baseline_value, proposed: "PAUSED", operator: context!.actor_name });
    if (body.action.startsWith("prepare_")) {
      const action = body.action === "prepare_approve" ? "approve" : "pause";
      if (detail.request.status !== (action === "approve" ? "awaiting_approval" : "approved")) throw Error("state_changed");
      if (action === "pause") {
        if (!detail.approvals.some(a => a.revision_id === revision.id && a.revision_hash === revision.payload_hash)) throw Error("approval_required");
        if ((await deps.receipts(requestId, revision.id)).length) throw Error("receipt_exists_read_only");
      }
      const preview = await deps.preview(detail, createScopedPauseAdapter(assertPauseTarget(target, context!, env), await deps.transport(assertPauseTarget(target, context!, env)), async () => { await current(); }));
      if (preview.conflict_issues.length || preview.capability_issues.length) throw Error("baseline_or_capability_changed");
      await current();
      const token = await new SignJWT({ ...confirmation.parse({ request_id: requestId, revision_id: revision.id, revision_hash: revision.payload_hash, action, scope_hash: scopeHash, operation_key: body.idempotency_key }) })
        .setProtectedHeader({ alg: "HS256" }).setIssuer("m03-pause-confirmation").setAudience("digitalbee-m03-pause").setSubject(scope.subject).setIssuedAt().setExpirationTime("5m").setJti(crypto.randomUUID()).sign(key);
      return json({ outcome: "prepared", display: { ...display(detail), action, expires_at: new Date(Date.now() + 300000).toISOString() }, confirmation_token: token });
    }
    if (body.action === "read") {
      const receipts = await deps.receipts(requestId, revision.id);
      // A live claim is allowed to finish; an interrupted claim is readback-only after
      // twice the service's 60-second execution window. Never dispatch a second pause.
      if (receipts.length && receipts.every(r => r.state !== "started" || Number.isFinite(Date.parse(r.updated_at ?? "")) && Date.parse(r.updated_at!) < Date.now() - 120000) && detail.request.status !== "verified") {
        await deps.execute({ requestId, revisionId: revision.id, revisionHash: revision.payload_hash, context: context!, reconcileOnly: true, reauthorize });
        detail = await current();
      }
      const official = await (await deps.transport(assertPauseTarget(target, context!, env))).read();
      if (official.account_id !== target.account_identity || official.campaign_id !== body.campaign_id) throw Error("source_changed");
      await current();
      return json({ outcome: "success", display: display(detail), official_status: official.status, captured_at: new Date().toISOString(), receipts: (await deps.receipts(requestId, revision.id)).map(r => ({ operation_key: r.operation_key, state: r.state })), provider_action: false });
    }
    const signed = await jwtVerify(body.confirmation_token ?? "", key, { algorithms: ["HS256"], issuer: "m03-pause-confirmation", audience: "digitalbee-m03-pause", maxTokenAge: "5m", requiredClaims: ["sub", "iat", "exp", "jti"] });
    const bound = confirmation.parse(signed.payload);
    if (signed.payload.sub !== scope.subject || bound.scope_hash !== scopeHash || bound.action !== body.action || bound.request_id !== requestId || bound.revision_id !== revision.id || bound.revision_hash !== revision.payload_hash) throw Error("stale_confirmation");
    if (body.action === "approve") {
      if (detail.request.status === "awaiting_approval") { await current(); await deps.approve(requestId, bound.revision_id, bound.revision_hash, bound.operation_key, context!); }
      else if (!detail.approvals.some(a => a.revision_id === bound.revision_id && a.revision_hash === bound.revision_hash)) throw Error("state_changed");
    } else {
      if ((await deps.receipts(requestId, bound.revision_id)).some(r => r.state === "started")) return json({ outcome: "unknown", display: display(detail), provider_action: "uncertain", blocker: "execution_in_progress_read_receipt" });
      await current(); attempted = true;
      await deps.execute({ requestId, revisionId: bound.revision_id, revisionHash: bound.revision_hash, context: context!, reconcileOnly: false, reauthorize });
    }
    detail = await current();
    return json({ outcome: "success", display: display(detail), provider_action: body.action === "pause" });
  } catch (error) {
    const known = error instanceof Error && /^(access_denied|invalid_request|request_id_required|source_changed|scope_changed|validated_revision_required|approval_required|state_changed|baseline_or_capability_changed|receipt_exists_read_only|stale_confirmation)$/.test(error.message) ? error.message : "request_failed";
    return json({ outcome: attempted ? "unknown" : "blocked", blocker: known, correlation_id: crypto.randomUUID(), provider_action: attempted ? "uncertain" : false }, 200);
  }
}
