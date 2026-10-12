import { createHash } from "node:crypto";
import { canonicalM03Hash } from "./provider-contract";
import type { M03ChangeRequestDetail, M03Revision } from "./types";

export type M03RevisionIntegrityReceipt = { revision_id: string; payload_hash: string; canonical_text: string };

// Revisions were hashed by PostgreSQL from jsonb::text. Preserve those exact
// bytes; JavaScript's JSON serialization is a different hash contract.
export function assertM03RevisionIntegrity(revision: M03Revision, receipt: M03RevisionIntegrityReceipt) {
  if (!receipt || receipt.revision_id !== revision.id || receipt.payload_hash !== revision.payload_hash
    || createHash("sha256").update(receipt.canonical_text).digest("hex") !== revision.payload_hash
    || canonicalM03Hash(JSON.parse(receipt.canonical_text)) !== canonicalM03Hash(revision.canonical_payload)) {
    throw new Error("The approved revision does not match its original database hash receipt.");
  }
}

export function assertM03ReviewedItems(detail: M03ChangeRequestDetail, revision: M03Revision) {
  const payload = revision.canonical_payload as Record<string, unknown>;
  const fields = ["entity_type", "entity_identity", "field_path", "value_type", "baseline_value", "proposed_value", "evidence", "platform_resource_mapping"];
  const snapshotHash = (item: Record<string, unknown>) => canonicalM03Hash(Object.fromEntries(fields.map((key) => [key, item[key]])));
  if (["platform", "account_identity", "campaign_identity"].some((key) => payload[key] !== (detail.request as unknown as Record<string, unknown>)[key])
    || !Array.isArray(payload.items) || payload.items.length !== detail.items.length
    || canonicalM03Hash(payload.items.map((item) => snapshotHash(item as Record<string, unknown>)).sort()) !== canonicalM03Hash(detail.items.map((item) => snapshotHash(item as unknown as Record<string, unknown>)).sort())) {
    throw new Error("Current request scope and business items must match the approved revision.");
  }
}
