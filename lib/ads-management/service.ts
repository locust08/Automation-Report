import { addApproval, addEvent, createNotification, getChangeSet, patchChangeSet, patchFieldChange } from "@/lib/ads-management/supabase";
import { assertGoogleWritesAllowed, fetchOfficialValues, mutateGoogleChanges, sitelinkVerificationMatches, validateLocalChange } from "@/lib/ads-management/google";

function equal(a: unknown, b: unknown) { return JSON.stringify(comparableValue(a)) === JSON.stringify(comparableValue(b)); }

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && "linkText" in item)) {
    return value.map((item) => {
      const sitelink = item as { scope?: unknown; targetResourceName?: unknown; linkText?: unknown; description1?: unknown; description2?: unknown; finalUrls?: unknown; finalMobileUrls?: unknown; startDate?: unknown; endDate?: unknown; associations?: unknown };
      return {
        scope: String(sitelink.scope ?? ""),
        targetResourceName: String(sitelink.targetResourceName ?? ""),
        linkText: String(sitelink.linkText ?? "").trim(),
        description1: String(sitelink.description1 ?? "").trim(),
        description2: String(sitelink.description2 ?? "").trim(),
        finalUrls: Array.isArray(sitelink.finalUrls) ? sitelink.finalUrls.map(String).map((item) => item.trim()).filter(Boolean) : [],
        finalMobileUrls: Array.isArray(sitelink.finalMobileUrls) ? sitelink.finalMobileUrls.map(String).map((item) => item.trim()).filter(Boolean) : [],
        startDate: String(sitelink.startDate ?? ""),
        endDate: String(sitelink.endDate ?? ""),
        associations: Array.isArray(sitelink.associations) ? sitelink.associations.map((association) => { const value = association as { scope?: unknown; targetResourceName?: unknown }; return { scope: String(value.scope ?? ""), targetResourceName: String(value.targetResourceName ?? "") }; }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) : [{ scope: String(sitelink.scope ?? ""), targetResourceName: String(sitelink.targetResourceName ?? "") }],
      };
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && "text" in item)) {
    return value.map((item) => {
      const asset = item as { text?: unknown; pinnedField?: unknown };
      return { text: String(asset.text ?? "").trim(), ...(typeof asset.pinnedField === "string" && asset.pinnedField ? { pinnedField: asset.pinnedField } : {}) };
    });
  }
  return value;
}

export async function submitChangeSetForReview(id: string, actorName: string) {
  const set = await getChangeSet(id); const changes = set.ads_field_changes ?? [];
  if (!changes.length) throw new Error("Add at least one proposed edit before submitting for review.");
  await patchChangeSet(id, { status: "validation_in_progress" });
  const latest = await fetchOfficialValues(set.account_id, changes);
  for (const change of changes) await patchFieldChange(change.id, { latest_official_value: latest.get(change.id) ?? null });
  let invalid = false;
  for (const change of changes) {
    const errors = validateLocalChange(change); invalid ||= errors.length > 0;
    await patchFieldChange(change.id, { validation_errors: errors });
  }
  if (invalid) {
    await patchChangeSet(id, { status: "validation_failed" });
    await addEvent(id, "validation_failed", actorName, "Local validation failed.");
    return getChangeSet(id);
  }
  const googleValidation = await mutateGoogleChanges(set.account_id, changes, true);
  for (const change of changes) {
    const result = googleValidation.get(change.id) as { error?: string } | undefined;
    if (result?.error) { invalid = true; await patchFieldChange(change.id, { validation_errors: [result.error], platform_response: result }); }
  }
  if (invalid) {
    await patchChangeSet(id, { status: "validation_failed" });
    await addEvent(id, "google_validation_failed", actorName, "Google validation failed.");
    return getChangeSet(id);
  }
  let conflicted = false;
  for (const change of changes) {
    const official = latest.get(change.id); const conflict = !equal(official, change.baseline_value); conflicted ||= conflict;
    await patchFieldChange(change.id, { latest_official_value: official ?? null, reviewed_official_value: conflict ? null : official ?? null, conflict_resolution: conflict ? null : "no_conflict" });
  }
  const status = conflicted ? "conflict_detected" : "awaiting_approval";
  await patchChangeSet(id, { status });
  await addEvent(id, conflicted ? "conflict_detected" : "submitted_for_review", actorName, conflicted ? "Google changed after the draft baseline was captured." : "Change request submitted for review.");
  return getChangeSet(id);
}

export async function resolveConflict(id: string, fieldId: string, resolution: string, actorName: string, newValue?: unknown) {
  const set = await getChangeSet(id); const change = set.ads_field_changes?.find((item) => item.id === fieldId);
  if (!change) throw new Error("Field change was not found.");
  if (!["keep_official", "apply_proposed", "new_value", "cancel", "escalate"].includes(resolution)) throw new Error("Unsupported conflict resolution.");
  const values: Record<string, unknown> = { conflict_resolution: resolution };
  if (resolution === "keep_official" || resolution === "cancel") values.proposed_value = change.latest_official_value;
  if (resolution === "new_value") values.proposed_value = newValue;
  if (!["escalate"].includes(resolution)) values.reviewed_official_value = change.latest_official_value;
  await patchFieldChange(fieldId, values);
  await addEvent(id, "conflict_resolved", actorName, `${change.field_label}: ${resolution.replaceAll("_", " ")}.`, { resolution }, fieldId);
  const refreshed = await getChangeSet(id);
  const unresolved = refreshed.ads_field_changes?.some((c) => c.latest_official_value !== null && !equal(c.latest_official_value, c.baseline_value) && (!c.conflict_resolution || c.conflict_resolution === "escalate"));
  if (!unresolved) await patchChangeSet(id, { status: "awaiting_approval" });
  return getChangeSet(id);
}

export async function approvePublishVerify(id: string, approverName: string, comment: string) {
  const set = await getChangeSet(id); const changes = (set.ads_field_changes ?? []).filter((c) => !equal(c.proposed_value, c.latest_official_value));
  if (set.status !== "awaiting_approval") throw new Error("This request is not ready for approval.");
  if (!approverName.trim() || approverName.trim().toLowerCase() === set.created_by_name.trim().toLowerCase()) throw new Error("A second person must approve and publish this request.");
  if (!changes.length) {
    await patchChangeSet(id, { status: "cancelled", cancelled_at: new Date().toISOString() });
    await addEvent(id, "cancelled_no_changes", approverName, "No changes remained after conflict resolution; nothing was published.");
    return getChangeSet(id);
  }
  const latest = await fetchOfficialValues(set.account_id, changes);
  let newConflict = false;
  for (const c of changes) {
    const official = latest.get(c.id); if (!equal(official, c.reviewed_official_value)) { newConflict = true; await patchFieldChange(c.id, { latest_official_value: official ?? null, reviewed_official_value: null, conflict_resolution: null }); }
  }
  if (newConflict) {
    await patchChangeSet(id, { status: "conflict_detected", approved_at: null });
    await addEvent(id, "approval_invalidated", approverName, "Google changed again before publishing; approval was invalidated.");
    return getChangeSet(id);
  }
  assertGoogleWritesAllowed(set.account_id);
  await addApproval(id, set.version, approverName, comment);
  await patchChangeSet(id, { status: "publishing", approved_at: new Date().toISOString() });
  const results = await mutateGoogleChanges(set.account_id, changes, false);
  let successes = 0;
  for (const c of changes) {
    const result = results.get(c.id) as { error?: string } | undefined; const ok = !result?.error; if (ok) successes += 1;
    await patchFieldChange(c.id, { publish_status: ok ? "succeeded" : "failed", published_value: ok ? c.proposed_value : null, platform_response: result ?? null, last_error_message: result?.error ?? null, publish_attempts: c.publish_attempts + 1 });
  }
  if (!successes) { await patchChangeSet(id, { status: "failed" }); return getChangeSet(id); }
  await patchChangeSet(id, { status: successes === changes.length ? "verification_in_progress" : "partially_completed", published_at: new Date().toISOString() });
  const afterPublish = await getChangeSet(id); const published = (afterPublish.ads_field_changes ?? []).filter((c) => c.publish_status === "succeeded");
  const verifiedValues = await fetchOfficialValues(set.account_id, published);
  let verified = 0;
  for (const c of published) {
    const observed = verifiedValues.get(c.id); const ok = c.value_type === "sitelinks" ? sitelinkVerificationMatches(c, observed) : equal(observed, c.published_value); if (ok) verified += 1;
    await patchFieldChange(c.id, { verified_value: observed ?? null, verification_status: ok ? "verified" : "failed", last_error_message: ok ? null : "Published value did not match the value read from Google." });
  }
  const complete = successes === changes.length && verified === published.length;
  await patchChangeSet(id, { status: complete ? "verified" : "partially_completed", verified_at: complete ? new Date().toISOString() : null });
  await addEvent(id, complete ? "verified" : "partially_completed", approverName, complete ? "All Google Ads changes were published and verified." : "Some Google Ads changes need attention.");
  if (complete) await createNotification(id, completionMessage(set.account_name, published));
  return getChangeSet(id);
}

export async function rejectChangeRequest(id: string, approverName: string, comment: string) {
  const set = await getChangeSet(id);
  if (set.status !== "awaiting_approval") throw new Error("This request is not ready for rejection.");
  if (!approverName.trim() || approverName.trim().toLowerCase() === set.created_by_name.trim().toLowerCase()) throw new Error("A second person must approve and publish this request.");
  await addApproval(id, set.version, approverName, comment, "rejected");
  await patchChangeSet(id, { status: "cancelled", cancelled_at: new Date().toISOString() });
  await addEvent(id, "rejected", approverName, "Change request was rejected and will not be published.", { comment: comment || "" });
  return getChangeSet(id);
}

export async function retryChangeRequestVerification(id: string, actorName: string) {
  const set = await getChangeSet(id);
  if (!actorName.trim()) throw new Error("Operator name is required to retry verification.");
  if (!['partially_completed', 'verification_in_progress'].includes(set.status)) throw new Error("This request does not have a retryable verification result.");
  const changes = set.ads_field_changes ?? [];
  const published = changes.filter((change) => change.publish_status === "succeeded" && change.published_value !== null);
  if (!published.length) throw new Error("This request has no successfully published changes to verify.");
  await patchChangeSet(id, { status: "verification_in_progress" });
  await addEvent(id, "verification_retried", actorName, "Verification was retried using fresh Google Ads values.");
  const verifiedValues = await fetchOfficialValues(set.account_id, published);
  let verified = 0;
  for (const change of published) {
    const observed = verifiedValues.get(change.id);
    const ok = change.value_type === "sitelinks" ? sitelinkVerificationMatches(change, observed) : equal(observed, change.published_value);
    if (ok) verified += 1;
    await patchFieldChange(change.id, { verified_value: observed ?? null, verification_status: ok ? "verified" : "failed", last_error_message: ok ? null : "Published value did not match the value read from Google." });
  }
  const complete = published.length === changes.length && verified === published.length;
  await patchChangeSet(id, { status: complete ? "verified" : "partially_completed", verified_at: complete ? new Date().toISOString() : null });
  await addEvent(id, complete ? "verified" : "verification_failed", actorName, complete ? "All published Google Ads changes were verified on retry." : "Some published Google Ads changes still do not match the requested values.");
  if (complete && !(set.ads_change_notifications ?? []).length) await createNotification(id, completionMessage(set.account_name, published));
  return getChangeSet(id);
}

function completionMessage(accountName: string, changes: Array<{ entity_name: string; field_label: string; field_key: string; value_type: string; baseline_value: unknown; proposed_value: unknown }>) {
  const summary = changes.map((c) => `${c.entity_name}: ${c.field_label} changed from ${formatCompletionValue(c, c.baseline_value)} to ${formatCompletionValue(c, c.proposed_value)}`).join("; ");
  return `Google Ads changes completed for ${accountName}. ${summary}. Verified on ${new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())}.`;
}

function formatCompletionValue(change: { field_key: string; value_type: string }, value: unknown) {
  if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((item) => String((item as { text?: unknown }).text ?? "")).join(" | ");
  if (change.value_type === "sitelinks" && Array.isArray(value)) return value.map((item) => { const sitelink = item as { linkText?: unknown; finalUrls?: unknown }; const url = Array.isArray(sitelink.finalUrls) ? String(sitelink.finalUrls[0] ?? "") : ""; return `${String(sitelink.linkText ?? "Sitelink")}${url ? ` (${url})` : ""}`; }).join(" | ") || "none";
  if (change.value_type !== "money_micros") return String(value);
  const amount = Number(value) / 1_000_000;
  return `MYR ${amount.toFixed(2)}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`;
}
