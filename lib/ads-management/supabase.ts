import type { AdsChangeSetRecord, DraftChangeInput, DraftEditorContext } from "@/lib/ads-management/types";

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

export async function listAccountChangeSets(accountId: string): Promise<AdsChangeSetRecord[]> {
  return db(`ads_change_sets?account_id=eq.${encodeURIComponent(accountId)}&select=*&order=updated_at.desc`);
}

export async function listEditableAccountChangeSets(accountId: string, creatorId: string): Promise<AdsChangeSetRecord[]> {
  return db(`ads_change_sets?account_id=eq.${encodeURIComponent(accountId)}&created_by_id=eq.${encodeURIComponent(creatorId)}&status=in.(draft,validation_failed,conflict_detected)&select=*,ads_field_changes(*),ads_change_events(*)&order=updated_at.desc`);
}

export async function getChangeSet(id: string): Promise<AdsChangeSetRecord> {
  const rows = await db<AdsChangeSetRecord[]>(`ads_change_sets?id=eq.${encodeURIComponent(id)}&select=*,ads_field_changes(*),ads_change_approvals(*),ads_change_events(*),ads_change_notifications(*)`);
  if (!rows[0]) throw new Error("Change request was not found.");
  return rows[0];
}

export async function createChangeSet(input: { accountId: string; accountName: string; title: string; reason: string; creatorId: string; creatorName: string; baselineCapturedAt: string; changes: DraftChangeInput[]; editorContext?: DraftEditorContext }): Promise<AdsChangeSetRecord> {
  const created = await db<AdsChangeSetRecord[]>("ads_change_sets", { method: "POST", body: JSON.stringify({ account_id: input.accountId, account_name: input.accountName, platform: "google", title: input.title, reason: input.reason, created_by_id: input.creatorId, created_by_name: input.creatorName, baseline_captured_at: input.baselineCapturedAt }) });
  const changeSet = created[0];
  if (!changeSet) throw new Error("Change request could not be created.");
  await replaceDraftChanges(changeSet.id, changeSet.version, input.changes, input.creatorName, undefined, input.editorContext);
  return getChangeSet(changeSet.id);
}

export async function replaceDraftChanges(id: string, expectedVersion: number, changes: DraftChangeInput[], actorName: string, reason?: string, editorContext?: DraftEditorContext): Promise<AdsChangeSetRecord> {
  const current = await getChangeSet(id);
  if (current.version !== expectedVersion) throw new Error("This draft changed in another session. Reload before saving.");
  if (current.status !== "draft" && current.status !== "validation_failed" && current.status !== "conflict_detected") throw new Error("Only an editable draft can be changed.");
  await db(`ads_field_changes?change_set_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (changes.length) await db("ads_field_changes", { method: "POST", body: JSON.stringify(changes.map((c) => ({ change_set_id: id, entity_type: c.entityType, entity_id: c.entityId, entity_name: c.entityName, field_key: c.fieldKey, field_label: c.fieldLabel, value_type: c.valueType, baseline_value: c.baselineValue, proposed_value: c.proposedValue }))) });
  await db(`ads_change_sets?id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, { method: "PATCH", body: JSON.stringify({ version: expectedVersion + 1, status: "draft", approved_at: null, ...(reason !== undefined ? { reason } : {}), updated_at: new Date().toISOString() }) });
  await addEvent(id, "draft_saved", actorName, "Draft changes saved.", { changeCount: changes.length, ...(editorContext ? { editorContext } : {}) });
  return getChangeSet(id);
}

export async function patchChangeSet(id: string, values: Record<string, unknown>) {
  await db(`ads_change_sets?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
}

export async function patchFieldChange(id: string, values: Record<string, unknown>) {
  await db(`ads_field_changes?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
}

export async function addEvent(changeSetId: string, eventType: string, actorName: string, message: string, metadata: Record<string, unknown> = {}, fieldChangeId?: string) {
  await db("ads_change_events", { method: "POST", body: JSON.stringify({ change_set_id: changeSetId, field_change_id: fieldChangeId ?? null, event_type: eventType, actor_name: actorName, message, metadata }) });
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
