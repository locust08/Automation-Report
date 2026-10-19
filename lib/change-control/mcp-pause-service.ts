import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { resolveTrustedIp } from "./request-context";
import { assertPauseTarget, assertScopedPause, createScopedPauseAdapter } from "./scoped-pause";
import { getM03McpOperator, assertM03Operator, getMockChangeRequest, createPostLaunchChangeRequest, validateMockChangeRequest, approveExactM03Pause, getM03ExecutionReceipts, getM03RevisionIntegrityReceipt, getM03PauseRecoveryDisposition, recoverM03UnobservedPause } from "./repository";
import { assertM03ReviewedItems, assertM03RevisionIntegrity } from "./revision-integrity";
import { verifyM03SourceBoundary } from "./source-boundary";
import { officialPauseTransport } from "./pause-transport";
import { executeScopedPause } from "./pause-action";
import { buildM03ProviderWorkflowPreview } from "./provider-workflow";
import { canonicalM03Hash, m03BaselineKey } from "./provider-contract";
import type { M03ChangeRequestDetail, TrustedRequestContext } from "./types";
import { m03BoundedText } from "./bounded-response";
import {compareConfirmationBinding, confirmationBindingTags, tagConfirmationBinding, type ConfirmationBindingValues} from "./confirmation-binding";

const id = z.string().uuid(), numeric = z.string().regex(/^\d{1,30}$/);
const refs = z.object({ workflow_id: id, revision_id: id, receipt_id: id }).strict();
export const pauseBody = z.object({
  action: z.enum(["prepare_approve", "prepare_pause", "prepare_recover", "approve", "pause", "recover", "read"]),
  service_id: id, campaign_id: numeric, idempotency_key: id,
  request_id: id.optional(), source: refs.optional(), confirmation_token: z.string().min(16).max(8192).optional(),
}).strict();
const delegation = z.object({ subject: z.string().min(1).max(255), grantRevision: z.number().int().nonnegative(), accountPageId: id, clientId: id,
  platform: z.enum(["Google", "Meta"]), platformAccountId: numeric, campaignIdentity: numeric,
  connectionRevision: z.string().min(1).max(255), action: z.string(), requestHash: z.string(), sessionBinding: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  networkContext: z.object({ source: z.literal("cloudflare-ingress"), ip: z.union([z.ipv4(), z.ipv6()]) }).strict().optional() });
const confirmation = z.object({ request_id: id, revision_id: id, revision_hash: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["approve", "pause", "recover"]), scope_hash: z.string(), operation_key: id,
  receipt_id:id.optional(), receipt_operation_key:z.string().optional(), source:refs.optional(),
  version: z.union([z.literal(2),z.literal(3),z.literal(4)]).optional(), binding_nonce: id.optional(), binding_tags: confirmationBindingTags.optional(),
}).refine(value => Boolean(value.binding_nonce) === Boolean(value.binding_tags), "Incomplete binding diagnostics")
  .refine(value => value.action!=="recover" || Boolean(value.receipt_id&&value.receipt_operation_key&&value.source), "Incomplete recovery binding");
const approvalEvidenceSchema = z.object({approval_id:id,revision_id:id,revision_hash:z.string().regex(/^[a-f0-9]{64}$/),created_at:z.string().datetime({offset:true})});
const real = { operator: getM03McpOperator, assertOperator: assertM03Operator, get: getMockChangeRequest, create: createPostLaunchChangeRequest,
  validate: validateMockChangeRequest, approve: approveExactM03Pause, integrity: getM03RevisionIntegrityReceipt, boundary: verifyM03SourceBoundary, transport: officialPauseTransport,
  execute: executeScopedPause, receipts: getM03ExecutionReceipts, disposition:getM03PauseRecoveryDisposition, recover:recoverM03UnobservedPause, preview: buildM03ProviderWorkflowPreview, fetch: globalThis.fetch };
export type McpPauseDependencies = typeof real;
const digest = async (text: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("base64url");
const json = (value: Record<string, unknown>, status = 200) => Response.json({ correlation_id: crypto.randomUUID(), ...value }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

// Cookie-independent service boundary; domain workflow remains usable after dashboard retirement.
export type McpPauseRuntime = { canonicalOrigin?: string; requireSignedNetwork?: boolean; grantFetch?: typeof fetch; onUnexpected?: (error: unknown, correlationId: string) => void };
export async function mcpPauseService(request: Request, deps: McpPauseDependencies = real, env: Record<string, string | undefined> = process.env, runtime: McpPauseRuntime = {}): Promise<Response> {
  if (request.method !== "POST") return json({ outcome: "unavailable" }, 405);
  if (env.M03_PAUSE_MCP_ENABLED !== "true" || !env.M03_PAUSE_MCP_SERVICE_TOKEN || env.M03_PAUSE_MCP_SERVICE_TOKEN.length < 32 || !env.M03_PAUSE_MCP_DELEGATION_KEY || env.M03_PAUSE_MCP_DELEGATION_KEY.length < 32) return json({ outcome: "locked" }, 503);
  let attempted = false;
  let stage = "request_validation";
  let bindingMismatch: string[] | undefined;
  try {
    const reader = request.body?.getReader(); if (!reader) throw Error("invalid_request");
    let bytes = 0; const parts: Uint8Array[] = [];
    try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 16384) throw Error("invalid_request"); parts.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const raw = Buffer.concat(parts).toString("utf8");
    const auth = request.headers.get("Authorization") ?? "";
    if (await digest(auth) !== await digest(`Bearer ${env.M03_PAUSE_MCP_SERVICE_TOKEN}`)) throw Error("access_denied");
    const key = new TextEncoder().encode(env.M03_PAUSE_MCP_DELEGATION_KEY);
    const { payload } = await jwtVerify(request.headers.get("X-DigitalBee-Delegation") ?? "", key, { algorithms: ["HS256"], issuer: "digitalbee", audience: runtime.canonicalOrigin ?? new URL(request.url).origin, maxTokenAge: "30s", requiredClaims: ["sub", "iat", "exp", "jti"] });
    const scope = delegation.parse(payload), body = pauseBody.parse(JSON.parse(raw));
    if (payload.sub !== scope.subject || scope.subject !== env.M03_PAUSE_MCP_SUBJECT || scope.requestHash !== await digest(raw)
      || scope.accountPageId !== body.service_id || scope.campaignIdentity !== body.campaign_id || scope.action !== `m03_pause:${body.action}`
      || scope.connectionRevision !== env.M03_PAUSE_MCP_CONNECTION_REVISION || request.headers.get("X-Connection-Revision") !== scope.connectionRevision) throw Error("access_denied");
    const target = { platform: scope.platform.toLowerCase(), account_identity: scope.platformAccountId, campaign_identity: scope.campaignIdentity };
    let context: TrustedRequestContext;
    async function reauthorize() {
      stage = "operator_authorization";
      const actor = await deps.operator(id.parse(env.M03_PAUSE_MCP_ACTOR_ID));
      // Private service fetch does not attest the browser's IP. Only the signed
      // MCP ingress claim may carry it; raw forwarding/CF headers are ignored.
      const ip = runtime.requireSignedNetwork ? scope.networkContext?.ip : resolveTrustedIp(request, env.VERCEL === "1" ? "vercel" : undefined);
      if (!actor || !ip) throw Error("access_denied");
      context = { ...actor, trusted_ip: ip, user_agent: "DigitalBee MCP pause confirmation" };
      assertPauseTarget(target, context, env);
      stage = "grant_verification";
      const url = new URL(env.DIGITALBEE_GRANT_VERIFY_URL ?? "");
      if (url.protocol !== "https:" || url.pathname !== "/v1/internal/grants/verify" || url.username || url.password || url.search || url.hash || !env.DIGITALBEE_GRANT_VERIFY_TOKEN || env.DIGITALBEE_GRANT_VERIFY_TOKEN.length < 32) throw Error("access_denied");
      const grant = Object.fromEntries(Object.entries(scope).filter(([key]) => !["requestHash", "sessionBinding", "networkContext"].includes(key)));
      const response = await (runtime.grantFetch ?? deps.fetch)(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${env.DIGITALBEE_GRANT_VERIFY_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(grant) });
      const decision = JSON.parse(await m03BoundedText(response, 32768));
      if (!response.ok || decision.allowed !== true || decision.email?.toLowerCase() !== actor.actor_email.toLowerCase() || Object.entries(grant).some(([k, v]) => decision[k] !== v)) throw Error("access_denied");
      stage = "operator_authorization";
      await deps.assertOperator(context);
    }
    await reauthorize();
    const bindingActor = context!.actor_id;
    const consentScope = { ...target, subject: scope.subject, actor_id: context!.actor_id, grantRevision: scope.grantRevision, service_id: body.service_id, client_id: scope.clientId, connectionRevision: scope.connectionRevision, sessionBinding: scope.sessionBinding };
    // Legacy capabilities retain exact-IP equality. Versioned capabilities are issued only
    // at the private signed-ingress boundary; every request passes fresh authorization.
    const scopeHash = canonicalM03Hash({ ...consentScope,
      ...(runtime.requireSignedNetwork ? { networkContext: scope.networkContext, canonicalOrigin: runtime.canonicalOrigin } : {}) });
    const approvalStableScopeHash = canonicalM03Hash({ ...consentScope, confirmation_version: 2,
      networkContext: {source: scope.networkContext?.source}, canonicalOrigin: runtime.canonicalOrigin });
    const pauseStableScopeHash = canonicalM03Hash({ ...consentScope, confirmation_version: 3,
      networkContext: {source: scope.networkContext?.source}, canonicalOrigin: runtime.canonicalOrigin });
    const recoveryStableScopeHash = canonicalM03Hash({ ...consentScope, confirmation_version: 4,
      networkContext: {source: scope.networkContext?.source}, canonicalOrigin: runtime.canonicalOrigin });
    let requestId = body.request_id;
    if (!requestId) {
      stage = "source_adoption";
      if (body.action !== "prepare_approve" || !body.source) throw Error("request_id_required");
      const observed = await (await deps.transport(assertPauseTarget(target, context!, env), env)).read();
      if (observed.account_id !== target.account_identity || observed.campaign_id !== target.campaign_identity) throw Error("source_changed");
      const input = { ...target, platform: target.platform as "google" | "meta", workflow_mode: "mock" as const, title: "M18 campaign pause", reason: "User-reviewed pause of the exact M18 pilot through ChatGPT.", idempotency_key: body.idempotency_key,
        items: [{ entity_type: "campaign", entity_identity: body.campaign_id, field_path: "campaign.status", value_type: "string" as const, baseline_value: observed.status, proposed_value: "PAUSED", evidence: { m18_workflow_id: body.source.workflow_id, m18_revision_id: body.source.revision_id, m18_receipt_id: body.source.receipt_id } }] };
      const source = await deps.boundary(input, env);
      await reauthorize();
      const created = await deps.create(input, { source_kind: source.source_kind, evidence: source.evidence, source_revision_hash: source.source_kind === "m04_verified_launch" ? source.source_revision_hash : null, baseline: source.source_kind === "legacy_provider_adoption" ? source.baseline : undefined }, context!);
      requestId = id.parse(created.request_id);
    }
    async function current() {
      await reauthorize();
      stage = "request_load";
      const detail = await deps.get(requestId!);
      stage = "request_scope";
      assertScopedPause(detail, context!, env);
      if (detail.request.platform !== target.platform || detail.request.account_identity !== target.account_identity || detail.request.campaign_identity !== target.campaign_identity) throw Error("scope_changed");
      return detail;
    }
    let detail = await current();
    if (body.action === "prepare_approve" && ["draft", "validation_failed"].includes(detail.request.status)) {
      stage = "revision_validation";
      await deps.validate(requestId, `${body.idempotency_key}:validate`, context!); detail = await current();
    }
    stage = "revision_validation";
    const revision = detail.revisions[0];
    if (!revision) throw Error("validated_revision_required");
    assertM03RevisionIntegrity(revision, await deps.integrity(requestId, revision.id, revision.payload_hash));
    assertM03ReviewedItems(detail, revision);
    const display = (d: M03ChangeRequestDetail) => ({ request_id: requestId, revision_id: revision.id, revision_hash: revision.payload_hash, platform: scope.platform, account_id: target.account_identity, campaign_id: body.campaign_id, status: d.request.status,
      baseline: d.items[0]!.baseline_value, proposed: "PAUSED", operator: context!.actor_name });
    const bindingValues = (action: string): ConfirmationBindingValues => ({subject:scope.subject,actor:bindingActor,grant_revision:scope.grantRevision,service:body.service_id,client:scope.clientId,connection_revision:scope.connectionRevision,session:scope.sessionBinding,target,
      canonical_origin:runtime.requireSignedNetwork ? runtime.canonicalOrigin : null,network_source:runtime.requireSignedNetwork ? scope.networkContext?.source : null,ingress_ip:runtime.requireSignedNetwork ? scope.networkContext?.ip : null,
      action,request:requestId,revision:revision.id,revision_hash:revision.payload_hash});
    const approvalEvidence = (d: M03ChangeRequestDetail) => {
      const row=d.approvals.find(a=>a.decision==="approved"&&a.revision_id===revision.id&&a.revision_hash===revision.payload_hash);
      const parsed=approvalEvidenceSchema.safeParse(row&&{approval_id:row.id,revision_id:row.revision_id,revision_hash:row.revision_hash,created_at:row.created_at});
      return parsed.success ? parsed.data : undefined;
    };
    async function recoveryState() {
      stage="receipt_read";
      const disposition=await deps.disposition(requestId!);
      const receipts=await deps.receipts(requestId!,revision.id);
      if(disposition)return {disposition,receipts};
      if(!["approved","publishing","ready_to_publish","provider_execution_locked"].includes(detail.request.status)
        || detail.items[0]?.baseline_value!=="ENABLED" || detail.items[0]?.proposed_value!=="PAUSED"
        || !approvalEvidence(detail) || receipts.length!==1 || receipts[0]!.state!=="started"
        || receipts[0]!.result!=null || receipts[0]!.readback!=null
        || !Number.isFinite(Date.parse(receipts[0]!.created_at)) || Date.parse(receipts[0]!.created_at)>Date.now()-600000)
        throw Error("recovery_not_eligible");
      return {disposition:null,receipts};
    }
    async function recoveryDraft(sourceRefs:z.infer<typeof refs>,operationKey:string){
      const evidence={m18_workflow_id:sourceRefs.workflow_id,m18_revision_id:sourceRefs.revision_id,m18_receipt_id:sourceRefs.receipt_id};
      if(Object.entries(evidence).some(([field,value])=>detail.items[0]?.evidence?.[field]!==value))throw Error("source_changed");
      const input={...target,platform:target.platform as "google"|"meta",workflow_mode:"mock" as const,
        title:"M03 recovered campaign pause",reason:"Separate pause after unobserved prior claim",client_id:detail.request.client_id,
        supersedes_request_id:requestId,idempotency_key:operationKey,
        items:[{entity_type:"campaign",entity_identity:body.campaign_id,field_path:"campaign.status",value_type:"string" as const,
          baseline_value:"ENABLED",proposed_value:"PAUSED",evidence}]};
      stage="recovery_source";
      const source=await deps.boundary(input,env);
      if(source.source_kind!=="legacy_provider_adoption" || !source.baseline || source.baseline.canonical_payload[m03BaselineKey(input.items[0]!)]!=="ENABLED")throw Error("source_changed");
      return {input,source,evidence};
    }
    if(body.action==="prepare_recover" || body.action==="recover"){
      if(!body.source)throw Error("source_required");
      const {disposition,receipts}=await recoveryState();
      const receipt=receipts[0];
      if(body.action==="recover"){
        stage="confirmation_validation";
        const signed=await jwtVerify(body.confirmation_token??"",key,{algorithms:["HS256"],issuer:"m03-pause-confirmation",audience:"digitalbee-m03-pause",maxTokenAge:"5m",requiredClaims:["sub","iat","exp","jti"]});
        const bound=confirmation.parse(signed.payload);
        if(!receipt || bound.version!==4 || signed.payload.sub!==scope.subject || bound.scope_hash!==recoveryStableScopeHash
          || bound.action!=="recover" || bound.request_id!==requestId || bound.revision_id!==revision.id || bound.revision_hash!==revision.payload_hash
          || bound.operation_key!==body.idempotency_key || bound.receipt_id!==receipt.id || bound.receipt_operation_key!==receipt.operation_key
          || canonicalM03Hash(bound.source)!==canonicalM03Hash(body.source))throw Error("stale_confirmation");
      }
      if(disposition){
        if(body.action==="recover")return json({outcome:"success",display:display(detail),new_request_id:disposition.new_request_id,already_recovered:true,reconciliation_state:"superseded",retry_allowed:false,provider_action:false});
        throw Error("already_recovered");
      }
      if(!receipt)throw Error("recovery_not_eligible");
      stage="official_read";
      const official=await (await deps.transport(assertPauseTarget(target,context!,env),env)).read();
      if(official.account_id!==target.account_identity || official.campaign_id!==target.campaign_identity || official.status!=="ENABLED")throw Error("stale_official_status");
      const observedAt=new Date().toISOString();
      const draft=await recoveryDraft(body.source,body.idempotency_key);
      detail=await current();
      if(body.action==="prepare_recover"){
        stage="confirmation_creation";
        const nonce=crypto.randomUUID();
        const token=await new SignJWT(confirmation.parse({request_id:requestId,revision_id:revision.id,revision_hash:revision.payload_hash,
          action:"recover",version:4,scope_hash:recoveryStableScopeHash,operation_key:body.idempotency_key,receipt_id:receipt.id,
          receipt_operation_key:receipt.operation_key,source:body.source,binding_nonce:nonce,
          binding_tags:await tagConfirmationBinding(bindingValues("recover"),key,nonce)}))
          .setProtectedHeader({alg:"HS256"}).setIssuer("m03-pause-confirmation").setAudience("digitalbee-m03-pause")
          .setSubject(scope.subject).setIssuedAt().setExpirationTime("5m").setJti(nonce).sign(key);
        return json({outcome:"prepared",display:{...display(detail),action:"recover",expires_at:new Date(Date.now()+300000).toISOString(),
          old_receipt_key:receipt.operation_key,source_workflow_id:body.source.workflow_id,
          source_revision_id:body.source.revision_id,source_receipt_id:body.source.receipt_id},
          confirmation_token:token,receipt:{operation_key:receipt.operation_key,state:receipt.state},provider_action:false});
      }
      stage="recovery_commit";
      await reauthorize();stage="recovery_commit";
      const recovered=await deps.recover({requestId:requestId!,revisionId:revision.id,revisionHash:revision.payload_hash,receiptId:receipt.id,
        operationKey:receipt.operation_key,platform:target.platform as "google"|"meta",accountId:target.account_identity,campaignId:target.campaign_identity,
        clientId:detail.request.client_id,officialObservedAt:observedAt,sourceEvidence:draft.source.evidence,
        baselinePayload:draft.source.baseline.canonical_payload,baselineHash:draft.source.baseline.payload_hash,
        items:[{...draft.input.items[0],evidence:draft.source.evidence}],idempotencyKey:body.idempotency_key,context:context!});
      return json({outcome:"success",display:display(detail),new_request_id:recovered.new_request_id,already_recovered:recovered.already_recovered,reconciliation_state:"superseded",retry_allowed:false,provider_action:false});
    }
    if (body.action.startsWith("prepare_")) {
      stage = "preparation_state";
      const action = body.action === "prepare_approve" ? "approve" : "pause";
      if (detail.request.status !== (action === "approve" ? "awaiting_approval" : "approved")) throw Error("state_changed");
      if (action === "pause") {
        if (!detail.approvals.some(a => a.revision_id === revision.id && a.revision_hash === revision.payload_hash)) throw Error("approval_required");
        if ((await deps.receipts(requestId, revision.id)).length) throw Error("receipt_exists_read_only");
      }
      stage = "provider_preview";
      const preview = await deps.preview(detail, createScopedPauseAdapter(assertPauseTarget(target, context!, env), await deps.transport(assertPauseTarget(target, context!, env), env), async () => { await current(); }));
      if (preview.conflict_issues.length || preview.capability_issues.length) throw Error("baseline_or_capability_changed");
      await current();
      stage = "confirmation_creation";
      const nonce=crypto.randomUUID();
      const scopeClaims=runtime.requireSignedNetwork
        ? action==="approve" ? {version:2 as const,scope_hash:approvalStableScopeHash} : {version:3 as const,scope_hash:pauseStableScopeHash}
        : {scope_hash:scopeHash};
      const token = await new SignJWT({ ...confirmation.parse({ request_id: requestId, revision_id: revision.id, revision_hash: revision.payload_hash, action, ...scopeClaims, operation_key: body.idempotency_key,
        binding_nonce:nonce,binding_tags:await tagConfirmationBinding(bindingValues(action),key,nonce) }) })
        .setProtectedHeader({ alg: "HS256" }).setIssuer("m03-pause-confirmation").setAudience("digitalbee-m03-pause").setSubject(scope.subject).setIssuedAt().setExpirationTime("5m").setJti(nonce).sign(key);
      return json({ outcome: "prepared", display: { ...display(detail), action, expires_at: new Date(Date.now() + 300000).toISOString() }, confirmation_token: token });
    }
    if (body.action === "read") {
      stage = "receipt_read";
      const receipts = await deps.receipts(requestId, revision.id);
      const disposition=await deps.disposition(requestId);
      stage = "official_read";
      const official = await (await deps.transport(assertPauseTarget(target, context!, env), env)).read();
      if (official.account_id !== target.account_identity || official.campaign_id !== body.campaign_id) throw Error("source_changed");
      // An interrupted claim can only be reconciled after an official PAUSED
      // observation. ENABLED is evidence that the pause has not been observed,
      // never permission to replay the mutation or discard its unknown outcome.
      const agedStarted = receipts.some(r => r.state === "started" && Number.isFinite(Date.parse(r.updated_at ?? "")) && Date.parse(r.updated_at!) < Date.now() - 120000);
      const reconciliationState = disposition ? "superseded" : agedStarted && official.status !== "PAUSED" ? "pause_not_observed" : undefined;
      if (!disposition && official.status === "PAUSED" && receipts.length && receipts.every(r => r.state !== "started" || Number.isFinite(Date.parse(r.updated_at ?? "")) && Date.parse(r.updated_at!) < Date.now() - 120000) && detail.request.status !== "verified") {
        stage = "receipt_reconciliation";
        await deps.execute({ requestId, revisionId: revision.id, revisionHash: revision.payload_hash, context: context!, reconcileOnly: true,
          reauthorize: async () => { await reauthorize(); stage = "receipt_reconciliation"; }, env });
        detail = await current();
      }
      detail = await current();
      return json({ outcome: "success", display: display(detail), approval_evidence:approvalEvidence(detail), official_status: official.status, captured_at: new Date().toISOString(), receipts: (await deps.receipts(requestId, revision.id)).map(r => ({ operation_key: r.operation_key, state: r.state })), ...(reconciliationState ? {reconciliation_state:reconciliationState,retry_allowed:false} : {}), ...(disposition?{new_request_id:disposition.new_request_id}:{}), provider_action: false });
    }
    stage = "confirmation_validation";
    const signed = await jwtVerify(body.confirmation_token ?? "", key, { algorithms: ["HS256"], issuer: "m03-pause-confirmation", audience: "digitalbee-m03-pause", maxTokenAge: "5m", requiredClaims: ["sub", "iat", "exp", "jti"] });
    const bound = confirmation.parse(signed.payload);
    if((bound.version===2&&(!runtime.requireSignedNetwork||bound.action!=="approve"))||(bound.version===3&&(!runtime.requireSignedNetwork||bound.action!=="pause")))throw Error("access_denied");
    const expectedScopeHash=bound.version===2?approvalStableScopeHash:bound.version===3?pauseStableScopeHash:scopeHash;
    if (signed.payload.sub !== scope.subject || bound.scope_hash !== expectedScopeHash || bound.action !== body.action || bound.request_id !== requestId || bound.revision_id !== revision.id || bound.revision_hash !== revision.payload_hash) {
      if(bound.binding_tags&&bound.binding_nonce)bindingMismatch=await compareConfirmationBinding(bound.binding_tags,bindingValues(body.action),key,bound.binding_nonce);
      if((bound.version===2||bound.version===3)&&bindingMismatch)bindingMismatch=bindingMismatch.filter(field=>field!=="ingress_ip");
      if(!bound.binding_tags||!bound.binding_nonce)bindingMismatch=[...(signed.payload.sub!==scope.subject?["subject"]:[]),...(bound.scope_hash!==expectedScopeHash?["scope_hash"]:[]),...(bound.action!==body.action?["action"]:[]),...(bound.request_id!==requestId?["request"]:[]),...(bound.revision_id!==revision.id?["revision"]:[]),...(bound.revision_hash!==revision.payload_hash?["revision_hash"]:[])];
      if(!bindingMismatch?.length)bindingMismatch=["scope_hash"];
      throw Error("stale_confirmation");
    }
    if (body.action === "approve") {
      if (detail.request.status === "awaiting_approval") { await current(); stage = "approval_commit"; await deps.approve(requestId, bound.revision_id, bound.revision_hash, bound.operation_key, context!); }
      else if (!detail.approvals.some(a => a.revision_id === bound.revision_id && a.revision_hash === bound.revision_hash)) throw Error("state_changed");
    } else {
      if ((await deps.receipts(requestId, bound.revision_id)).some(r => r.state === "started")) return json({ outcome: "unknown", display: display(detail), provider_action: "uncertain", blocker: "execution_in_progress_read_receipt" });
      await current(); attempted = true; stage = "pause_execution";
      await deps.execute({ requestId, revisionId: bound.revision_id, revisionHash: bound.revision_hash, context: context!, reconcileOnly: false, reauthorize, env });
    }
    detail = await current();
    return json({ outcome: "success", display: display(detail), approval_evidence:approvalEvidence(detail), provider_action: body.action === "pause" });
  } catch (error) {
    const known = error instanceof Error && /^(access_denied|invalid_request|request_id_required|source_required|source_changed|scope_changed|validated_revision_required|approval_required|state_changed|baseline_or_capability_changed|receipt_exists_read_only|recovery_not_eligible|stale_official_status|already_recovered|stale_confirmation)$/.test(error.message) ? error.message : "request_failed";
    const category = error instanceof z.ZodError ? "invalid_data" : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : known !== "request_failed" ? "guard" : "unexpected";
    const evidence = { outcome: attempted ? "unknown" : "blocked", blocker: known, correlation_id: crypto.randomUUID(), provider_action: attempted ? "uncertain" : false, diagnostic: { stage, category }, ...(bindingMismatch ? {binding_mismatch:bindingMismatch} : {}) };
    if (category === "unexpected" || category === "timeout") { try { runtime.onUnexpected?.(error, evidence.correlation_id); } catch { /* Monitoring cannot change the result. */ } }
    console.warn(JSON.stringify({ event: "m03_pause_failure", ...evidence }));
    return json(evidence, 200);
  }
}
