import { createHash } from "node:crypto";
import type { AdsChangeSetRecord, AdsFieldChangeRecord, ChangeEvidence } from "@/lib/ads-management/types";

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export type AdsMutationAction = "draft" | "validate" | "approve" | "publish" | "retry" | "adopt" | "rollback";

export type LaunchEligibility = {
  eligible: boolean;
  source: "verified_build" | "legacy_adoption" | "unverified";
  sourceId: string | null;
};

const mutationCapabilities: Record<AdsMutationAction, readonly string[]> = {
  draft: ["admin"],
  validate: ["admin"],
  approve: ["admin"],
  publish: ["admin"],
  retry: ["admin"],
  adopt: ["admin"],
  rollback: ["admin"],
};

export function canPerformAdsMutation(role: string, action: AdsMutationAction): boolean {
  return mutationCapabilities[action].includes(role.trim().toLowerCase());
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonicalValue(value));
}

export function canonicalPayloadHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function buildItemIdempotencyKey(changeSetId: string, version: number, fieldChangeId: string): string {
  return `m03_${canonicalPayloadHash({ changeSetId, version, fieldChangeId })}`;
}

export function approvalExpiresAt(approvedAt = new Date()): string {
  return new Date(approvedAt.getTime() + APPROVAL_TTL_MS).toISOString();
}

export function isApprovalExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now.getTime();
}

export function assertReviewContext(reason: string, evidence: ChangeEvidence): void {
  if (!reason.trim()) throw new Error("A change reason is required before validation.");
  if (!evidence.summary?.trim()) throw new Error("Evidence is required before validation.");
  for (const reference of evidence.references ?? []) {
    if (!reference.trim()) throw new Error("Evidence references cannot be blank.");
  }
}

export function resolveLaunchEligibility(input: { verifiedBuildId: number | null; adoptionId: string | null }): LaunchEligibility {
  if (input.verifiedBuildId != null) return { eligible: true, source: "verified_build", sourceId: String(input.verifiedBuildId) };
  if (input.adoptionId) return { eligible: true, source: "legacy_adoption", sourceId: input.adoptionId };
  return { eligible: false, source: "unverified", sourceId: null };
}

export function buildRevisionPayload(changeSet: Pick<AdsChangeSetRecord, "account_id" | "campaign_id" | "platform" | "version" | "reason" | "evidence" | "ads_field_changes">) {
  return {
    accountId: changeSet.account_id,
    campaignId: changeSet.campaign_id ?? null,
    platform: changeSet.platform,
    version: changeSet.version,
    reason: changeSet.reason,
    evidence: changeSet.evidence ?? { summary: "" },
    changes: [...(changeSet.ads_field_changes ?? [])]
      .sort(compareFieldChanges)
      .map((change) => ({
        id: change.id,
        entityType: change.entity_type,
        entityId: change.entity_id,
        fieldKey: change.field_key,
        baselineValue: change.baseline_value,
        proposedValue: change.proposed_value,
      })),
  };
}

export function buildPreflightStatePayload(changes: AdsFieldChangeRecord[]) {
  return [...changes]
    .sort(compareFieldChanges)
    .map((change) => ({
      id: change.id,
      entityType: change.entity_type,
      entityId: change.entity_id,
      fieldKey: change.field_key,
      latestOfficialValue: change.latest_official_value,
      reviewedOfficialValue: change.reviewed_official_value,
    }));
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortCanonicalValue(child)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Canonical payloads cannot contain non-finite numbers.");
  return value;
}

function compareFieldChanges(left: AdsFieldChangeRecord, right: AdsFieldChangeRecord): number {
  return `${left.entity_type}:${left.entity_id}:${left.field_key}:${left.id}`.localeCompare(`${right.entity_type}:${right.entity_id}:${right.field_key}:${right.id}`);
}
