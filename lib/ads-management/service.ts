import * as adsRepository from "@/lib/ads-management/supabase";
import * as googleAds from "@/lib/ads-management/google";
import { formatSitelinkCompletionValue } from "@/lib/ads-management/sitelink-display";

// A plain dependency object keeps the production implementation unchanged while
// giving focused service tests a reliable seam that works with ESM modules.
export const adsManagementServiceDependencies = {
  addEvent: adsRepository.addEvent,
  addApproval: adsRepository.addApproval,
  createNotification: adsRepository.createNotification,
  getChangeSet: adsRepository.getChangeSet,
  patchChangeSet: adsRepository.patchChangeSet,
  patchFieldChange: adsRepository.patchFieldChange,
  assertGoogleWritesAllowed: googleAds.assertGoogleWritesAllowed,
  fetchOfficialValues: googleAds.fetchOfficialValues,
  mutateGoogleChanges: googleAds.mutateGoogleChanges,
  criterionVerificationMatches: googleAds.criterionVerificationMatches,
  sitelinkVerificationMatches: googleAds.sitelinkVerificationMatches,
  validateLocalChange: googleAds.validateLocalChange,
};

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

export async function validateChangeRequest(id: string, actorName: string) {
  const set = await adsManagementServiceDependencies.getChangeSet(id); const changes = set.ads_field_changes ?? [];
  if (!changes.length) throw new Error("Add at least one proposed edit before submitting for review.");
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "validation_in_progress" });
  const latest = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, changes);
  for (const change of changes) await adsManagementServiceDependencies.patchFieldChange(change.id, { latest_official_value: latest.get(change.id) ?? null });
  let invalid = false;
  for (const change of changes) {
    const errors = adsManagementServiceDependencies.validateLocalChange(change); invalid ||= errors.length > 0;
    await adsManagementServiceDependencies.patchFieldChange(change.id, { validation_errors: errors });
  }
  if (invalid) {
    await adsManagementServiceDependencies.patchChangeSet(id, { status: "validation_failed" });
    await adsManagementServiceDependencies.addEvent(id, "validation_failed", actorName, "Local validation failed.");
    return adsManagementServiceDependencies.getChangeSet(id);
  }
  const googleValidation = await adsManagementServiceDependencies.mutateGoogleChanges(set.account_id, changes, true);
  for (const change of changes) {
    const result = googleValidation.get(change.id) as { error?: string } | undefined;
    if (result?.error) { invalid = true; await adsManagementServiceDependencies.patchFieldChange(change.id, { validation_errors: [result.error], platform_response: result }); }
  }
  if (invalid) {
    await adsManagementServiceDependencies.patchChangeSet(id, { status: "validation_failed" });
    await adsManagementServiceDependencies.addEvent(id, "google_validation_failed", actorName, "Google validation failed.");
    return adsManagementServiceDependencies.getChangeSet(id);
  }
  let conflicted = false;
  for (const change of changes) {
    const official = latest.get(change.id); const conflict = !equal(official, change.baseline_value); conflicted ||= conflict;
    await adsManagementServiceDependencies.patchFieldChange(change.id, { latest_official_value: official ?? null, reviewed_official_value: conflict ? null : official ?? null, conflict_resolution: conflict ? null : "no_conflict" });
  }
  const status = conflicted ? "conflict_detected" : "awaiting_approval";
  await adsManagementServiceDependencies.patchChangeSet(id, { status });
  await adsManagementServiceDependencies.addEvent(id, conflicted ? "conflict_detected" : "validated_awaiting_approval", actorName, conflicted ? "Google changed after the draft baseline was captured." : "Change request passed local and Google validation and is awaiting explicit approval.");
  return adsManagementServiceDependencies.getChangeSet(id);
}

/** @deprecated Use validateChangeRequest. Kept for existing clients while the UI migrates. */
export const submitChangeSetForReview = validateChangeRequest;

export async function approveChangeRequest(id: string, actorName: string, actorId: string | null = null, comment?: string) {
  if (!actorName.trim()) throw new Error("An authenticated approver is required.");
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (set.status !== "awaiting_approval") throw new Error("Only a validated change request awaiting approval can be approved.");
  await adsManagementServiceDependencies.addApproval(id, actorId, actorName, set.version, comment);
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "approved", approved_at: new Date().toISOString() });
  await adsManagementServiceDependencies.addEvent(id, "approved", actorName, "Change request was explicitly approved for publishing.", { changeSetVersion: set.version });
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function resolveConflict(id: string, fieldId: string, resolution: string, actorName: string, newValue?: unknown) {
  const set = await adsManagementServiceDependencies.getChangeSet(id); const change = set.ads_field_changes?.find((item) => item.id === fieldId);
  if (!change) throw new Error("Field change was not found.");
  if (!["keep_official", "apply_proposed", "new_value", "cancel", "escalate"].includes(resolution)) throw new Error("Unsupported conflict resolution.");
  const values: Record<string, unknown> = { conflict_resolution: resolution };
  if (resolution === "keep_official" || resolution === "cancel") values.proposed_value = change.latest_official_value;
  if (resolution === "new_value") values.proposed_value = newValue;
  if (!["escalate"].includes(resolution)) values.reviewed_official_value = change.latest_official_value;
  await adsManagementServiceDependencies.patchFieldChange(fieldId, values);
  await adsManagementServiceDependencies.addEvent(id, "conflict_resolved", actorName, `${change.field_label}: ${resolution.replaceAll("_", " ")}.`, { resolution }, fieldId);
  const refreshed = await adsManagementServiceDependencies.getChangeSet(id);
  const unresolved = refreshed.ads_field_changes?.some((c) => c.latest_official_value !== null && !equal(c.latest_official_value, c.baseline_value) && (!c.conflict_resolution || c.conflict_resolution === "escalate"));
  if (!unresolved) await adsManagementServiceDependencies.patchChangeSet(id, { status: "awaiting_approval", approved_at: null });
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function publishChangeRequest(id: string, actorName: string, completionMessageOverride?: string) {
  if (!actorName.trim()) throw new Error("An authenticated user is required to publish changes.");
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (set.status !== "approved" || !set.approved_at) throw new Error("This request must be explicitly approved before publishing.");
  return publishAndVerify(set, actorName, completionMessageOverride);
}

async function publishAndVerify(set: Awaited<ReturnType<typeof adsManagementServiceDependencies.getChangeSet>>, actorName: string, completionMessageOverride?: string) {
  const id = set.id;
  const changes = (set.ads_field_changes ?? []).filter((c) => !equal(c.proposed_value, c.latest_official_value));
  if (!changes.length) {
    await adsManagementServiceDependencies.patchChangeSet(id, { status: "cancelled", cancelled_at: new Date().toISOString() });
    await adsManagementServiceDependencies.addEvent(id, "cancelled_no_changes", actorName, "No changes remained after conflict resolution; nothing was published.");
    return adsManagementServiceDependencies.getChangeSet(id);
  }
  const latest = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, changes);
  let newConflict = false;
  for (const c of changes) {
    const official = latest.get(c.id);
    if (!equal(official, c.reviewed_official_value)) {
      newConflict = true;
      await adsManagementServiceDependencies.patchFieldChange(c.id, { latest_official_value: official ?? null, reviewed_official_value: null, conflict_resolution: null });
    }
  }
  if (newConflict) {
    await adsManagementServiceDependencies.patchChangeSet(id, { status: "conflict_detected", approved_at: null });
    await adsManagementServiceDependencies.addEvent(id, "publish_blocked_by_conflict", actorName, "Google changed again before publishing. Resolve the new conflict before retrying.");
    return adsManagementServiceDependencies.getChangeSet(id);
  }
  adsManagementServiceDependencies.assertGoogleWritesAllowed(set.account_id);
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "publishing" });
  await adsManagementServiceDependencies.addEvent(id, "publishing_started", actorName, "Publishing validated changes to Google Ads.");
  const results = await adsManagementServiceDependencies.mutateGoogleChanges(set.account_id, changes, false);
  let successes = 0;
  for (const c of changes) {
    const result = results.get(c.id) as { error?: string } | undefined; const ok = !result?.error; if (ok) successes += 1;
    await adsManagementServiceDependencies.patchFieldChange(c.id, { publish_status: ok ? "succeeded" : "failed", published_value: ok ? c.proposed_value : null, platform_response: result ?? null, last_error_message: result?.error ?? null, publish_attempts: c.publish_attempts + 1 });
  }
  if (!successes) { await adsManagementServiceDependencies.patchChangeSet(id, { status: "failed" }); return adsManagementServiceDependencies.getChangeSet(id); }
  await adsManagementServiceDependencies.patchChangeSet(id, { status: successes === changes.length ? "verification_in_progress" : "partially_completed", published_at: new Date().toISOString() });
  const afterPublish = await adsManagementServiceDependencies.getChangeSet(id); const published = (afterPublish.ads_field_changes ?? []).filter((c) => c.publish_status === "succeeded");
  const verifiedValues = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, published);
  let verified = 0;
  for (const c of published) {
    const observed = verifiedValues.get(c.id); const ok = c.value_type === "sitelinks" ? adsManagementServiceDependencies.sitelinkVerificationMatches(c, observed) : ["negative_keyword", "placement_exclusion"].includes(c.value_type) ? adsManagementServiceDependencies.criterionVerificationMatches(c, observed) : equal(observed, c.published_value); if (ok) verified += 1;
    await adsManagementServiceDependencies.patchFieldChange(c.id, { verified_value: observed ?? null, verification_status: ok ? "verified" : "failed", last_error_message: ok ? null : "Published value did not match the value read from Google." });
  }
  const complete = successes === changes.length && verified === published.length;
  await adsManagementServiceDependencies.patchChangeSet(id, { status: complete ? "verified" : "partially_completed", verified_at: complete ? new Date().toISOString() : null });
  await adsManagementServiceDependencies.addEvent(id, complete ? "verified" : "partially_completed", actorName, complete ? "All Google Ads changes were published and verified." : "Some Google Ads changes need attention.");
  if (complete) await adsManagementServiceDependencies.createNotification(id, completionMessageOverride?.trim() || completionMessage(set.account_name, published));
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function retryChangeRequestVerification(id: string, actorName: string) {
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (!actorName.trim()) throw new Error("Operator name is required to retry verification.");
  if (!['partially_completed', 'verification_in_progress'].includes(set.status)) throw new Error("This request does not have a retryable verification result.");
  const changes = set.ads_field_changes ?? [];
  const published = changes.filter((change) => change.publish_status === "succeeded" && change.published_value !== null);
  if (!published.length) throw new Error("This request has no successfully published changes to verify.");
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "verification_in_progress" });
  await adsManagementServiceDependencies.addEvent(id, "verification_retried", actorName, "Verification was retried using fresh Google Ads values.");
  const verifiedValues = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, published);
  let verified = 0;
  for (const change of published) {
    const observed = verifiedValues.get(change.id);
    const ok = change.value_type === "sitelinks" ? adsManagementServiceDependencies.sitelinkVerificationMatches(change, observed) : ["negative_keyword", "placement_exclusion"].includes(change.value_type) ? adsManagementServiceDependencies.criterionVerificationMatches(change, observed) : equal(observed, change.published_value);
    if (ok) verified += 1;
    await adsManagementServiceDependencies.patchFieldChange(change.id, { verified_value: observed ?? null, verification_status: ok ? "verified" : "failed", last_error_message: ok ? null : "Published value did not match the value read from Google." });
  }
  const complete = published.length === changes.length && verified === published.length;
  await adsManagementServiceDependencies.patchChangeSet(id, { status: complete ? "verified" : "partially_completed", verified_at: complete ? new Date().toISOString() : null });
  await adsManagementServiceDependencies.addEvent(id, complete ? "verified" : "verification_failed", actorName, complete ? "All published Google Ads changes were verified on retry." : "Some published Google Ads changes still do not match the requested values.");
  if (complete && !(set.ads_change_notifications ?? []).length) await adsManagementServiceDependencies.createNotification(id, completionMessage(set.account_name, published));
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function retryFailedChangeRequestItems(id: string, actorName: string) {
  if (!actorName.trim()) throw new Error("Operator name is required to retry failed items.");
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (!["failed", "partially_completed"].includes(set.status) || !set.approved_at) throw new Error("This request does not have approved failed items to retry.");
  const changes = set.ads_field_changes ?? [];
  const failed = changes.filter((change) => change.publish_status === "failed");
  if (!failed.length) throw new Error("This request has no failed publish items to retry.");

  const latest = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, failed);
  const retryable: typeof failed = [];
  let conflicts = 0;
  for (const change of failed) {
    const observed = latest.get(change.id);
    const alreadyApplied = ["negative_keyword", "placement_exclusion"].includes(change.value_type)
      ? adsManagementServiceDependencies.criterionVerificationMatches(change, observed)
      : equal(observed, change.proposed_value);
    if (alreadyApplied) {
      await adsManagementServiceDependencies.patchFieldChange(change.id, { publish_status: "succeeded", published_value: change.proposed_value, verified_value: observed ?? null, verification_status: "verified", latest_official_value: observed ?? null, last_error_message: null });
    } else if (!equal(observed, change.reviewed_official_value)) {
      conflicts += 1;
      await adsManagementServiceDependencies.patchFieldChange(change.id, { latest_official_value: observed ?? null, last_error_message: "Google changed before this failed item could be retried." });
    } else {
      retryable.push(change);
    }
  }
  if (conflicts) {
    await adsManagementServiceDependencies.addEvent(id, "publish_retry_blocked_by_conflict", actorName, "One or more failed items changed in Google and were not retried.");
    return adsManagementServiceDependencies.getChangeSet(id);
  }
  if (retryable.length) {
    adsManagementServiceDependencies.assertGoogleWritesAllowed(set.account_id);
    await adsManagementServiceDependencies.patchChangeSet(id, { status: "publishing" });
    await adsManagementServiceDependencies.addEvent(id, "publish_retry_started", actorName, `Retrying ${retryable.length} failed item(s).`);
    const results = await adsManagementServiceDependencies.mutateGoogleChanges(set.account_id, retryable, false);
    for (const change of retryable) {
      const result = results.get(change.id) as { error?: string } | undefined;
      const ok = !result?.error;
      await adsManagementServiceDependencies.patchFieldChange(change.id, { publish_status: ok ? "succeeded" : "failed", published_value: ok ? change.proposed_value : null, platform_response: result ?? null, last_error_message: result?.error ?? null, publish_attempts: change.publish_attempts + 1 });
    }
  }

  const afterRetry = await adsManagementServiceDependencies.getChangeSet(id);
  const allChanges = afterRetry.ads_field_changes ?? [];
  const published = allChanges.filter((change) => change.publish_status === "succeeded" && change.published_value !== null);
  const verifiedValues = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, published);
  let verified = 0;
  for (const change of published) {
    const observed = verifiedValues.get(change.id);
    const ok = change.value_type === "sitelinks" ? adsManagementServiceDependencies.sitelinkVerificationMatches(change, observed) : ["negative_keyword", "placement_exclusion"].includes(change.value_type) ? adsManagementServiceDependencies.criterionVerificationMatches(change, observed) : equal(observed, change.published_value);
    if (ok) verified += 1;
    await adsManagementServiceDependencies.patchFieldChange(change.id, { verified_value: observed ?? null, verification_status: ok ? "verified" : "failed", last_error_message: ok ? null : "Published value did not match the value read from Google." });
  }
  const complete = published.length === allChanges.length && verified === allChanges.length;
  await adsManagementServiceDependencies.patchChangeSet(id, { status: complete ? "verified" : "partially_completed", verified_at: complete ? new Date().toISOString() : null });
  await adsManagementServiceDependencies.addEvent(id, complete ? "verified_after_publish_retry" : "publish_retry_incomplete", actorName, complete ? "All retried items were published and verified." : "Some retried items still need attention.");
  if (complete && !(afterRetry.ads_change_notifications ?? []).length) await adsManagementServiceDependencies.createNotification(id, completionMessage(set.account_name, published));
  return adsManagementServiceDependencies.getChangeSet(id);
}

function completionMessage(accountName: string, changes: Array<{ entity_name: string; field_label: string; field_key: string; value_type: string; baseline_value: unknown; proposed_value: unknown }>) {
  const summary = changes.map((c) => `${c.entity_name}: ${c.field_label} changed from ${formatCompletionValue(c, c.baseline_value)} to ${formatCompletionValue(c, c.proposed_value)}`).join("; ");
  return `Google Ads changes completed for ${accountName}. ${summary}. Verified on ${new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())}.`;
}

function formatCompletionValue(change: { field_key: string; value_type: string }, value: unknown) {
  if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((item) => String((item as { text?: unknown }).text ?? "")).join(" | ");
  if (change.value_type === "sitelinks") return formatSitelinkCompletionValue(value);
  if (change.value_type !== "money_micros") return String(value);
  const amount = Number(value) / 1_000_000;
  return `MYR ${amount.toFixed(2)}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`;
}
