import { buildRevisionPayload, canonicalJson, canonicalPayloadHash } from "@/lib/ads-management/change-control";
import type { AdsChangeSetRecord, AdsChangeSetRevisionRecord, ChangeEvidence, DraftChangeInput, DraftEditorContext, LaunchEligibility } from "@/lib/ads-management/types";

const M03_PROJECT_KEY = "lt_paid_media" as const;

function config() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET?.trim();
  if (!url || !key) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SECRET / SUPABASE_SERVICE_ROLE_KEY).");
  return { url: url.replace(/\/$/, ""), key };
}

async function db<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, key } = config();
  const headers = new Headers(init?.headers);
  headers.set("apikey", key);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Prefer")) headers.set("Prefer", "return=representation");
  if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Workflow database request failed (${response.status}): ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return db<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export async function listAccountChangeSets(accountId: string): Promise<AdsChangeSetRecord[]> {
  return db(`ads_change_sets?account_id=eq.${encodeURIComponent(accountId)}&or=(project_key.eq.${M03_PROJECT_KEY},project_key.is.null)&select=*&order=updated_at.desc`);
}

export async function listEditableAccountChangeSets(accountId: string, creatorId: string): Promise<AdsChangeSetRecord[]> {
  return db(`ads_change_sets?account_id=eq.${encodeURIComponent(accountId)}&created_by_id=eq.${encodeURIComponent(creatorId)}&or=(project_key.eq.${M03_PROJECT_KEY},project_key.is.null)&status=in.(draft,validation_failed,conflict_detected)&select=*,ads_field_changes(*),ads_change_events(*)&order=updated_at.desc`);
}

export async function getChangeSet(id: string): Promise<AdsChangeSetRecord> {
  const rows = await db<AdsChangeSetRecord[]>(`ads_change_sets?id=eq.${encodeURIComponent(id)}&or=(project_key.eq.${M03_PROJECT_KEY},project_key.is.null)&select=*,ads_field_changes(*),ads_change_approvals(*),ads_change_events(*),ads_change_notifications(*),ads_change_set_revisions(*),ads_change_follow_ups(*)`);
  if (!rows[0]) throw new Error("Change request was not found.");
  return rows[0];
}

export async function createChangeSet(input: { accountId: string; accountName: string; campaignId: string; title: string; reason: string; evidence: ChangeEvidence; creatorId: string; creatorName: string; baselineCapturedAt: string; changes: DraftChangeInput[]; editorContext?: DraftEditorContext; revertsChangeSetId?: string; sourceReference?: Record<string, unknown> }): Promise<AdsChangeSetRecord> {
  const created = await db<AdsChangeSetRecord[]>("ads_change_sets", { method: "POST", body: JSON.stringify({ project_key: M03_PROJECT_KEY, account_id: input.accountId, account_name: input.accountName, campaign_id: input.campaignId, contract_version: 2, platform: "google", title: input.title, reason: input.reason, evidence: input.evidence, created_by_id: input.creatorId, created_by_name: input.creatorName, baseline_captured_at: input.baselineCapturedAt, reverts_change_set_id: input.revertsChangeSetId ?? null }) });
  const changeSet = created[0];
  if (!changeSet) throw new Error("Change request could not be created.");
  await replaceDraftChanges(changeSet.id, changeSet.version, input.changes, input.creatorName, input.creatorId, input.reason, input.evidence, input.editorContext, input.sourceReference);
  return getChangeSet(changeSet.id);
}

export async function replaceDraftChanges(id: string, expectedVersion: number, changes: DraftChangeInput[], actorName: string, actorId: string | null = null, reason?: string, evidence?: ChangeEvidence, editorContext?: DraftEditorContext, sourceReference: Record<string, unknown> = {}): Promise<AdsChangeSetRecord> {
  const current = await getChangeSet(id);
  if (current.version !== expectedVersion) throw new Error("This draft changed in another session. Reload before saving.");
  if (current.status !== "draft" && current.status !== "validation_failed" && current.status !== "conflict_detected") throw new Error("Only an editable draft can be changed.");
  await db(`ads_field_changes?change_set_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (changes.length) await db("ads_field_changes", { method: "POST", body: JSON.stringify(changes.map((c) => ({ change_set_id: id, entity_type: c.entityType, entity_id: c.entityId, entity_name: c.entityName, field_key: c.fieldKey, field_label: c.fieldLabel, value_type: c.valueType, baseline_value: c.baselineValue, proposed_value: c.proposedValue }))) });
  await db(`ads_change_sets?id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, { method: "PATCH", body: JSON.stringify({ version: expectedVersion + 1, status: "draft", approved_at: null, approved_revision_id: null, approved_payload_hash: null, approval_expires_at: null, preflight_state_hash: null, ...(reason !== undefined ? { reason } : {}), ...(evidence !== undefined ? { evidence } : {}), updated_at: new Date().toISOString() }) });
  await addEvent(id, "draft_saved", actorName, "Draft changes saved.", { changeCount: changes.length, ...(editorContext ? { editorContext } : {}) }, undefined, { actorId });
  const refreshed = await getChangeSet(id);
  await snapshotRevision(refreshed, actorId, actorName, sourceReference);
  return getChangeSet(id);
}

export async function snapshotRevision(changeSet: AdsChangeSetRecord, actorId: string | null, actorName: string, sourceReference: Record<string, unknown> = {}): Promise<AdsChangeSetRevisionRecord> {
  const payload = buildRevisionPayload(changeSet);
  const canonical = canonicalJson(payload);
  const rows = await rpc<AdsChangeSetRevisionRecord[] | AdsChangeSetRevisionRecord>("ads_snapshot_change_set_revision", {
    p_change_set_id: changeSet.id,
    p_expected_version: changeSet.version,
    p_canonical_json: canonical,
    p_payload_hash: canonicalPayloadHash(payload),
    p_reason: changeSet.reason,
    p_evidence: changeSet.evidence ?? { summary: "" },
    p_source_reference: sourceReference,
    p_actor_id: actorId,
    p_actor_name: actorName,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function patchChangeSet(id: string, values: Record<string, unknown>) {
  await db(`ads_change_sets?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
}

export async function patchFieldChange(id: string, values: Record<string, unknown>) {
  await db(`ads_field_changes?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
}

export async function addEvent(changeSetId: string, eventType: string, actorName: string, message: string, metadata: Record<string, unknown> = {}, fieldChangeId?: string, actor: { actorId?: string | null; trustedIp?: string | null; trustedUserAgent?: string | null } = {}) {
  await db("ads_change_events", { method: "POST", body: JSON.stringify({ change_set_id: changeSetId, field_change_id: fieldChangeId ?? null, event_type: eventType, actor_id: actor.actorId ?? null, actor_name: actorName, message, metadata, trusted_ip: actor.trustedIp ?? null, trusted_user_agent: actor.trustedUserAgent?.slice(0, 1000) ?? null }) });
}

export async function getLaunchEligibility(accountId: string, campaignId: string): Promise<LaunchEligibility> {
  const result = await rpc<LaunchEligibility | LaunchEligibility[]>("ads_get_campaign_launch_eligibility", { p_account_id: accountId, p_campaign_id: campaignId });
  return Array.isArray(result) ? result[0] : result;
}

export async function adoptLegacyCampaign(input: { accountId: string; campaignId: string; campaignName: string; reason: string; evidence: ChangeEvidence; actorId: string; actorName: string }) {
  return rpc("ads_adopt_legacy_campaign", {
    p_account_id: input.accountId, p_campaign_id: input.campaignId, p_campaign_name: input.campaignName,
    p_reason: input.reason, p_evidence: input.evidence, p_actor_id: input.actorId, p_actor_name: input.actorName,
  });
}

export async function approveRevision(input: { changeSetId: string; expectedVersion: number; revisionId: string; payloadHash: string; expiresAt: string; actorId: string; actorName: string; comment?: string; trustedIp?: string | null; trustedUserAgent?: string | null }) {
  return rpc("ads_approve_change_set_revision", {
    p_change_set_id: input.changeSetId, p_expected_version: input.expectedVersion,
    p_revision_id: input.revisionId, p_payload_hash: input.payloadHash, p_expires_at: input.expiresAt,
    p_actor_id: input.actorId, p_actor_name: input.actorName, p_comment: input.comment ?? "",
    p_trusted_ip: input.trustedIp ?? null, p_trusted_user_agent: input.trustedUserAgent ?? "",
  });
}

export async function claimPublish(input: { changeSetId: string; expectedVersion: number; payloadHash: string; preflightStateHash: string; actorId: string; actorName: string; trustedIp?: string | null; trustedUserAgent?: string | null }): Promise<string> {
  const result = await rpc<string | string[]>("ads_claim_change_set_publish", {
    p_change_set_id: input.changeSetId, p_expected_version: input.expectedVersion,
    p_expected_payload_hash: input.payloadHash, p_preflight_state_hash: input.preflightStateHash,
    p_actor_id: input.actorId, p_actor_name: input.actorName, p_trusted_ip: input.trustedIp ?? null,
    p_trusted_user_agent: input.trustedUserAgent ?? "",
  });
  return Array.isArray(result) ? result[0] : result;
}

export async function recordItemResult(input: { changeSetId: string; fieldChangeId: string; claimId: string; publishSucceeded: boolean; publishedValue: unknown; platformResponse: unknown; errorMessage?: string | null; verified: boolean; verifiedValue: unknown }) {
  return rpc("ads_record_change_item_result", {
    p_change_set_id: input.changeSetId, p_field_change_id: input.fieldChangeId, p_claim_id: input.claimId,
    p_publish_succeeded: input.publishSucceeded, p_published_value: input.publishedValue,
    p_platform_response: input.platformResponse, p_error_message: input.errorMessage ?? "",
    p_verified: input.verified, p_verified_value: input.verifiedValue,
  });
}

export async function finalizePublish(input: { changeSetId: string; claimId: string; actorId: string; actorName: string; trustedIp?: string | null; trustedUserAgent?: string | null }) {
  return rpc("ads_finalize_change_set_publish", {
    p_change_set_id: input.changeSetId, p_claim_id: input.claimId, p_actor_id: input.actorId,
    p_actor_name: input.actorName, p_trusted_ip: input.trustedIp ?? null,
    p_trusted_user_agent: input.trustedUserAgent ?? "",
  });
}

export async function finalizeVerification(input: { changeSetId: string; actorId: string; actorName: string; trustedIp?: string | null; trustedUserAgent?: string | null }) {
  return rpc("ads_finalize_change_set_verification", {
    p_change_set_id: input.changeSetId, p_actor_id: input.actorId,
    p_actor_name: input.actorName, p_trusted_ip: input.trustedIp ?? null,
    p_trusted_user_agent: input.trustedUserAgent ?? "",
  });
}

export async function addApproval(changeSetId: string, approverId: string | null, approverName: string, changeSetVersion: number, comment?: string) {
  await db("ads_change_approvals", {
    method: "POST",
    body: JSON.stringify({ change_set_id: changeSetId, decision: "approved", approver_id: approverId, approver_name: approverName, change_set_version: changeSetVersion, comment: comment?.trim() || null }),
  });
}

export async function createNotification(changeSetId: string, message: string) {
  await db("ads_change_notifications", { method: "POST", body: JSON.stringify({ change_set_id: changeSetId, channel: "email", message, status: "draft" }) });
}

export interface PendingChangeNotification {
  id: string;
  change_set_id: string;
  message: string;
  ads_change_sets: AdsChangeSetRecord & { ads_field_changes?: AdsChangeSetRecord["ads_field_changes"] };
}

export async function listPendingChangeNotifications(): Promise<PendingChangeNotification[]> {
  // Selecting the delivery columns before sending is intentional: if the migration
  // has not been applied, the cron fails safely before Resend can deliver duplicates.
  return db("ads_change_notifications?status=eq.draft&select=id,change_set_id,message,recipient_names,recipient_emails,sent_at,last_error_message,ads_change_sets(*,ads_field_changes(*))&order=created_at.asc");
}

export async function markChangeNotificationsSent(ids: string[], recipientNames: string[], recipientEmails: string[]) {
  if (!ids.length) return;
  await db(`ads_change_notifications?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString(), recipient_names: recipientNames, recipient_emails: recipientEmails, last_error_message: null, updated_at: new Date().toISOString() }),
  });
}

export async function markChangeNotificationsFailed(ids: string[], errorMessage: string) {
  if (!ids.length) return;
  await db(`ads_change_notifications?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ last_error_message: errorMessage.slice(0, 1000), updated_at: new Date().toISOString() }),
  });
}
