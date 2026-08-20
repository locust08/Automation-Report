import * as adsRepository from "@/lib/ads-management/supabase";
import * as googleAds from "@/lib/ads-management/google";
import {
  approvalExpiresAt,
  assertReviewContext,
  buildPreflightStatePayload,
  buildRevisionPayload,
  canonicalPayloadHash,
  isApprovalExpired,
} from "@/lib/ads-management/change-control";
import { formatSitelinkCompletionValue } from "@/lib/ads-management/sitelink-display";
import type { AdsChangeSetRecord, AdsFieldChangeRecord, ChangeEvidence } from "@/lib/ads-management/types";

export type WorkflowActor = { id: string; name: string; trustedIp?: string | null; trustedUserAgent?: string | null };

export const adsManagementServiceDependencies = {
  addEvent: adsRepository.addEvent,
  approveRevision: adsRepository.approveRevision,
  claimPublish: adsRepository.claimPublish,
  createChangeSet: adsRepository.createChangeSet,
  createNotification: adsRepository.createNotification,
  finalizePublish: adsRepository.finalizePublish,
  finalizeVerification: adsRepository.finalizeVerification,
  getChangeSet: adsRepository.getChangeSet,
  getLaunchEligibility: adsRepository.getLaunchEligibility,
  patchChangeSet: adsRepository.patchChangeSet,
  patchFieldChange: adsRepository.patchFieldChange,
  recordItemResult: adsRepository.recordItemResult,
  snapshotRevision: adsRepository.snapshotRevision,
  assertGoogleWritesAllowed: googleAds.assertGoogleWritesAllowed,
  fetchOfficialValues: googleAds.fetchOfficialValues,
  mutateGoogleChanges: googleAds.mutateGoogleChanges,
  sitelinkVerificationMatches: googleAds.sitelinkVerificationMatches,
  validateLocalChange: googleAds.validateLocalChange,
};

export async function validateChangeRequest(id: string, actorInput: WorkflowActor | string) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  const changes = set.ads_field_changes ?? [];
  if (!changes.length) throw new Error("Add at least one proposed edit before validating.");
  assertReviewContext(set.reason, set.evidence ?? { summary: "" });
  await assertPostLaunchEligibility(set);
  await ensureCurrentRevision(set, actor);
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "validation_in_progress" });

  const latest = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, changes);
  let invalid = false;
  for (const change of changes) {
    const errors = adsManagementServiceDependencies.validateLocalChange(change);
    invalid ||= errors.length > 0;
    await adsManagementServiceDependencies.patchFieldChange(change.id, {
      latest_official_value: latest.get(change.id) ?? null,
      validation_errors: errors,
    });
  }
  if (invalid) return failValidation(id, actor, "validation_failed", "Local validation failed.");

  const googleValidation = await adsManagementServiceDependencies.mutateGoogleChanges(set.account_id, changes, true);
  for (const change of changes) {
    const result = googleValidation.get(change.id) as { error?: string } | undefined;
    if (result?.error) {
      invalid = true;
      await adsManagementServiceDependencies.patchFieldChange(change.id, { validation_errors: [result.error], platform_response: result });
    }
  }
  if (invalid) return failValidation(id, actor, "google_validation_failed", "Google validate-only checks failed.");

  let conflicted = false;
  const preflightChanges: AdsFieldChangeRecord[] = [];
  for (const change of changes) {
    const official = latest.get(change.id);
    const conflict = !equal(official, change.baseline_value);
    conflicted ||= conflict;
    const reviewed = conflict ? null : official ?? null;
    await adsManagementServiceDependencies.patchFieldChange(change.id, {
      latest_official_value: official ?? null,
      reviewed_official_value: reviewed,
      conflict_resolution: conflict ? null : "no_conflict",
    });
    preflightChanges.push({ ...change, latest_official_value: official ?? null, reviewed_official_value: reviewed });
  }

  const preflightStateHash = canonicalPayloadHash(buildPreflightStatePayload(preflightChanges));
  const status = conflicted ? "conflict_detected" : "awaiting_approval";
  await adsManagementServiceDependencies.patchChangeSet(id, { status, preflight_state_hash: preflightStateHash });
  await addAuditEvent(
    id,
    conflicted ? "conflict_detected" : "validated_awaiting_approval",
    actor,
    conflicted ? "Google changed after the synchronized baseline was captured." : "Change request passed local and Google validation and awaits explicit approval.",
    { preflightStateHash },
  );
  return adsManagementServiceDependencies.getChangeSet(id);
}

/** @deprecated Old callers now validate without publishing. */
export const submitChangeSetForReview = validateChangeRequest;

export async function approveChangeRequest(id: string, actorInput: WorkflowActor | string, comment?: string) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (set.status !== "awaiting_approval") throw new Error("Only a validated request awaiting approval can be approved.");
  assertReviewContext(set.reason, set.evidence ?? { summary: "" });
  const revision = await ensureCurrentRevision(set, actor);
  const payloadHash = canonicalPayloadHash(buildRevisionPayload(set));
  if (revision.payload_hash !== payloadHash) throw new Error("The current draft no longer matches its immutable revision. Save and validate it again.");
  await adsManagementServiceDependencies.approveRevision({
    changeSetId: id,
    expectedVersion: set.version,
    revisionId: revision.id,
    payloadHash,
    expiresAt: approvalExpiresAt(),
    actorId: actor.id,
    actorName: actor.name,
    comment,
    trustedIp: actor.trustedIp,
    trustedUserAgent: actor.trustedUserAgent,
  });
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function resolveConflict(id: string, fieldId: string, resolution: string, actorInput: WorkflowActor | string, newValue?: unknown) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  const change = set.ads_field_changes?.find((item) => item.id === fieldId);
  if (!change) throw new Error("Field change was not found.");
  if (!["keep_official", "apply_proposed", "new_value", "cancel", "escalate"].includes(resolution)) throw new Error("Unsupported conflict resolution.");
  const values: Record<string, unknown> = { conflict_resolution: resolution };
  if (resolution === "keep_official" || resolution === "cancel") values.proposed_value = change.latest_official_value;
  if (resolution === "new_value") values.proposed_value = newValue;
  if (resolution !== "escalate") values.reviewed_official_value = change.latest_official_value;
  await adsManagementServiceDependencies.patchFieldChange(fieldId, values);
  await addAuditEvent(id, "conflict_resolved", actor, `${change.field_label}: ${resolution.replaceAll("_", " ")}.`, { resolution }, fieldId);

  const refreshed = await adsManagementServiceDependencies.getChangeSet(id);
  const unresolved = refreshed.ads_field_changes?.some((candidate) =>
    candidate.latest_official_value !== null
      && !equal(candidate.latest_official_value, candidate.baseline_value)
      && (!candidate.conflict_resolution || candidate.conflict_resolution === "escalate"),
  );
  if (!unresolved) {
    await adsManagementServiceDependencies.patchChangeSet(id, {
      status: "draft",
      version: refreshed.version + 1,
      approved_at: null,
      approved_revision_id: null,
      approved_payload_hash: null,
      approval_expires_at: null,
      preflight_state_hash: null,
    });
    await adsManagementServiceDependencies.snapshotRevision(await adsManagementServiceDependencies.getChangeSet(id), actor.id, actor.name);
  }
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function publishChangeRequest(id: string, actorInput: WorkflowActor | string, completionMessageOverride?: string) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (set.status !== "approved" || !set.approved_payload_hash) throw new Error("This request must be explicitly approved before publishing.");
  if (isApprovalExpired(set.approval_expires_at)) throw new Error("This approval expired. Validate and approve the request again.");
  return publishAndVerify(set, actor, completionMessageOverride);
}

export async function retryFailedChangeRequestItems(id: string, actorInput: WorkflowActor | string, completionMessageOverride?: string) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (!["failed", "partially_completed"].includes(set.status)) throw new Error("This request has no failed publish items to retry.");
  if (set.contract_version === 2 && isApprovalExpired(set.approval_expires_at)) throw new Error("This approval expired. Create and approve a corrected revision.");
  const failed = (set.ads_field_changes ?? []).filter((change) => change.publish_status !== "succeeded");
  if (!failed.length) throw new Error("Successful items are durable; there is nothing to republish.");
  return publishAndVerify(set, actor, completionMessageOverride, true, failed);
}

export async function retryChangeRequestVerification(id: string, actorInput: WorkflowActor | string) {
  const actor = normalizeActor(actorInput);
  const set = await adsManagementServiceDependencies.getChangeSet(id);
  if (!["partially_completed", "verification_in_progress"].includes(set.status)) throw new Error("This request does not have a retryable verification result.");
  const published = (set.ads_field_changes ?? []).filter((change) => change.publish_status === "succeeded" && change.verification_status !== "verified");
  if (!published.length) throw new Error("This request has no published items awaiting verification.");
  const observed = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, published);
  for (const change of published) {
    const value = observed.get(change.id);
    const verified = verificationMatches(change, value);
    await adsManagementServiceDependencies.patchFieldChange(change.id, {
      verified_value: value ?? null,
      verification_status: verified ? "verified" : "failed",
      last_error_message: verified ? null : "Published value did not match the value read from Google.",
    });
  }
  await addAuditEvent(id, "verification_retried", actor, "Verification was retried using fresh Google Ads values.");
  await adsManagementServiceDependencies.finalizeVerification({
    changeSetId: id,
    actorId: actor.id,
    actorName: actor.name,
    trustedIp: actor.trustedIp,
    trustedUserAgent: actor.trustedUserAgent,
  });
  return adsManagementServiceDependencies.getChangeSet(id);
}

export async function createRollbackChangeRequest(id: string, actorInput: WorkflowActor | string, reason: string, evidence: ChangeEvidence) {
  const actor = normalizeActor(actorInput);
  const source = await adsManagementServiceDependencies.getChangeSet(id);
  if (source.status !== "verified") throw new Error("Only a verified change set can create a rollback.");
  if (!source.campaign_id) throw new Error("This legacy record has no campaign identity. Adopt the campaign before creating a rollback.");
  assertReviewContext(reason, evidence);
  await assertPostLaunchEligibility(source);
  const sourceChanges = source.ads_field_changes ?? [];
  const latest = await adsManagementServiceDependencies.fetchOfficialValues(source.account_id, sourceChanges);
  return adsManagementServiceDependencies.createChangeSet({
    accountId: source.account_id,
    accountName: source.account_name,
    campaignId: source.campaign_id,
    title: `Rollback: ${source.title}`,
    reason,
    evidence,
    creatorId: actor.id,
    creatorName: actor.name,
    baselineCapturedAt: new Date().toISOString(),
    revertsChangeSetId: source.id,
    changes: sourceChanges.map((change) => ({
      entityType: change.entity_type,
      entityId: change.entity_id,
      entityName: change.entity_name,
      fieldKey: change.field_key,
      fieldLabel: change.field_label,
      valueType: change.value_type,
      baselineValue: latest.get(change.id),
      proposedValue: change.baseline_value,
    })),
  });
}

async function publishAndVerify(
  set: AdsChangeSetRecord,
  actor: WorkflowActor,
  completionMessageOverride?: string,
  retry = false,
  candidates = set.ads_field_changes ?? [],
) {
  const changes = candidates.filter((change) => change.publish_status !== "succeeded" && !equal(change.proposed_value, change.latest_official_value));
  if (!changes.length) throw new Error("No unpublished changes remain in this request.");
  await assertPostLaunchEligibility(set);
  const revisionHash = canonicalPayloadHash(buildRevisionPayload(set));
  if (set.contract_version === 2 && revisionHash !== set.approved_payload_hash) throw new Error("The approved revision hash changed. Save and approve a new revision.");

  const latest = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, changes);
  const preflight = changes.map((change) => ({ ...change, latest_official_value: latest.get(change.id) ?? null }));
  let conflicted = false;
  for (const change of preflight) {
    if (!equal(change.latest_official_value, change.reviewed_official_value)) {
      conflicted = true;
      await adsManagementServiceDependencies.patchFieldChange(change.id, { latest_official_value: change.latest_official_value, reviewed_official_value: null, conflict_resolution: null });
    }
  }
  if (conflicted) {
    await adsManagementServiceDependencies.patchChangeSet(set.id, { status: "conflict_detected" });
    await addAuditEvent(set.id, retry ? "publish_retry_blocked_by_conflict" : "publish_blocked_by_conflict", actor, "Google changed after approval. No mutation was attempted.");
    return adsManagementServiceDependencies.getChangeSet(set.id);
  }

  const preflightStateHash = canonicalPayloadHash(buildPreflightStatePayload(preflight));
  if (set.contract_version === 2 && preflightStateHash !== set.preflight_state_hash) throw new Error("The approved preflight state changed. Validate and approve again.");
  adsManagementServiceDependencies.assertGoogleWritesAllowed(set.account_id);
  const claimId = await adsManagementServiceDependencies.claimPublish({
    changeSetId: set.id,
    expectedVersion: set.version,
    payloadHash: set.approved_payload_hash ?? revisionHash,
    preflightStateHash,
    actorId: actor.id,
    actorName: actor.name,
    trustedIp: actor.trustedIp,
    trustedUserAgent: actor.trustedUserAgent,
  });

  for (const change of changes) {
    const result = await adsManagementServiceDependencies.mutateGoogleChanges(set.account_id, [change], false);
    const providerResult = result.get(change.id) as { error?: string } | undefined;
    const publishSucceeded = !providerResult?.error;
    let observed: unknown = null;
    let verified = false;
    if (publishSucceeded) {
      const readback = await adsManagementServiceDependencies.fetchOfficialValues(set.account_id, [change]);
      observed = readback.get(change.id);
      verified = verificationMatches({ ...change, published_value: change.proposed_value }, observed);
    }
    await adsManagementServiceDependencies.recordItemResult({
      changeSetId: set.id,
      fieldChangeId: change.id,
      claimId,
      publishSucceeded,
      publishedValue: change.proposed_value,
      platformResponse: providerResult ?? {},
      errorMessage: providerResult?.error ?? (verified ? null : "Published value did not match Google readback."),
      verified,
      verifiedValue: observed,
    });
  }

  await adsManagementServiceDependencies.finalizePublish({
    changeSetId: set.id,
    claimId,
    actorId: actor.id,
    actorName: actor.name,
    trustedIp: actor.trustedIp,
    trustedUserAgent: actor.trustedUserAgent,
  });
  const finalized = await adsManagementServiceDependencies.getChangeSet(set.id);
  if (["verified", "partially_completed"].includes(finalized.status) && !(finalized.ads_change_notifications ?? []).length) {
    await adsManagementServiceDependencies.createNotification(set.id, completionMessageOverride?.trim() || completionMessage(finalized));
  }
  return adsManagementServiceDependencies.getChangeSet(set.id);
}

async function ensureCurrentRevision(set: AdsChangeSetRecord, actor: WorkflowActor) {
  const revision = (set.ads_change_set_revisions ?? []).find((candidate) => candidate.version === set.version);
  return revision ?? adsManagementServiceDependencies.snapshotRevision(set, actor.id, actor.name, sourceReference(set.evidence));
}

async function assertPostLaunchEligibility(set: AdsChangeSetRecord) {
  if (set.contract_version !== 2) return;
  if (set.project_key !== "lt_paid_media") throw new Error("This change request does not belong to LT Paid Media.");
  if (!set.campaign_id) throw new Error("Campaign identity is required for post-launch change control.");
  const eligibility = await adsManagementServiceDependencies.getLaunchEligibility(set.account_id, set.campaign_id);
  if (!eligibility.eligible) throw new Error("This campaign has no verified Module 4 launch. An administrator must authorize legacy adoption first.");
}

async function failValidation(id: string, actor: WorkflowActor, eventType: string, message: string) {
  await adsManagementServiceDependencies.patchChangeSet(id, { status: "validation_failed" });
  await addAuditEvent(id, eventType, actor, message);
  return adsManagementServiceDependencies.getChangeSet(id);
}

function addAuditEvent(changeSetId: string, eventType: string, actor: WorkflowActor, message: string, metadata: Record<string, unknown> = {}, fieldChangeId?: string) {
  return adsManagementServiceDependencies.addEvent(changeSetId, eventType, actor.name, message, metadata, fieldChangeId, {
    actorId: actor.id, trustedIp: actor.trustedIp, trustedUserAgent: actor.trustedUserAgent,
  });
}

function normalizeActor(actor: WorkflowActor | string): WorkflowActor {
  if (typeof actor === "string") return { id: actor, name: actor };
  if (!actor.id.trim() || !actor.name.trim()) throw new Error("An authenticated administrator is required.");
  return actor;
}

function sourceReference(evidence?: ChangeEvidence): Record<string, unknown> {
  return evidence?.sourceId ? { sourceType: evidence.sourceType ?? "manual", sourceId: evidence.sourceId } : {};
}

function verificationMatches(change: AdsFieldChangeRecord, observed: unknown) {
  return change.value_type === "sitelinks" ? adsManagementServiceDependencies.sitelinkVerificationMatches(change, observed) : equal(observed, change.published_value);
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(comparableValue(left)) === JSON.stringify(comparableValue(right));
}

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && "linkText" in item)) {
    return value.map((item) => {
      const sitelink = item as Record<string, unknown>;
      return {
        scope: String(sitelink.scope ?? ""), targetResourceName: String(sitelink.targetResourceName ?? ""), linkText: String(sitelink.linkText ?? "").trim(),
        description1: String(sitelink.description1 ?? "").trim(), description2: String(sitelink.description2 ?? "").trim(),
        finalUrls: Array.isArray(sitelink.finalUrls) ? sitelink.finalUrls.map(String).map((item) => item.trim()).filter(Boolean) : [],
        finalMobileUrls: Array.isArray(sitelink.finalMobileUrls) ? sitelink.finalMobileUrls.map(String).map((item) => item.trim()).filter(Boolean) : [],
        startDate: String(sitelink.startDate ?? ""), endDate: String(sitelink.endDate ?? ""),
        associations: Array.isArray(sitelink.associations) ? sitelink.associations : [],
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

function completionMessage(set: AdsChangeSetRecord) {
  const changes = set.ads_field_changes ?? [];
  const lines = changes.map((change) => {
    const outcome = change.verification_status === "verified" ? "verified" : change.publish_status === "failed" ? `failed: ${change.last_error_message ?? "provider error"}` : "awaiting verification";
    return `${change.entity_name}: ${change.field_label} from ${formatCompletionValue(change, change.baseline_value)} to ${formatCompletionValue(change, change.proposed_value)} (${outcome})`;
  });
  return `Google Ads change control for ${set.account_name}. ${lines.join("; ")}. Status: ${set.status.replaceAll("_", " ")}.`;
}

function formatCompletionValue(change: Pick<AdsFieldChangeRecord, "field_key" | "value_type">, value: unknown) {
  if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((item) => String((item as { text?: unknown }).text ?? "")).join(" | ");
  if (change.value_type === "sitelinks") return formatSitelinkCompletionValue(value);
  if (change.value_type !== "money_micros") return String(value);
  const amount = Number(value) / 1_000_000;
  return `MYR ${amount.toFixed(2)}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`;
}
