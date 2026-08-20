import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { canonicalPayloadHash, buildRevisionPayload } from "@/lib/ads-management/change-control";
import { adsManagementServiceDependencies, approveChangeRequest, publishChangeRequest, resolveConflict, submitChangeSetForReview } from "@/lib/ads-management/service";
import type { AdsChangeSetRecord } from "@/lib/ads-management/types";

afterEach(() => mock.restoreAll());

function makeChangeSet(overrides: Partial<AdsChangeSetRecord> = {}, changeOverrides: Record<string, unknown> = {}) {
  return {
    id: "cs-1",
    account_id: "1234567890",
    account_name: "Jet Trading",
    platform: "google",
    title: "Campaign budget update",
    reason: "Safe test",
    evidence: { summary: "Reviewed in test" },
    status: "draft",
    created_by_id: null,
    created_by_name: "Alice",
    baseline_captured_at: "2026-08-01T00:00:00.000Z",
    version: 1,
    approved_at: null,
    published_at: null,
    verified_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ads_field_changes: [
      {
        id: "change-1",
        change_set_id: "cs-1",
        entity_type: "campaign",
        entity_id: "111",
        entity_name: "Search",
        field_key: "campaign.name",
        field_label: "Campaign name",
        value_type: "string",
        baseline_value: "Old name",
        proposed_value: "New name",
        latest_official_value: null,
        reviewed_official_value: null,
        published_value: null,
        verified_value: null,
        conflict_resolution: null,
        validation_errors: [],
        publish_status: "pending",
        verification_status: "pending",
        platform_response: null,
        last_error_message: null,
        publish_attempts: 0,
        ...changeOverrides,
      },
    ],
    ads_change_set_revisions: [
      {
        id: "rev-1",
        change_set_id: "cs-1",
        version: 1,
        canonical_payload: {},
        payload_hash: "a".repeat(64),
        reason: "Safe test",
        evidence: { summary: "Reviewed in test" },
        source_reference: {},
        created_by_id: null,
        created_by_name: "Alice",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  } as AdsChangeSetRecord;
}

test("submitChangeSetForReview marks non-conflicted requests as awaiting approval", async () => {
  const draftedSet = makeChangeSet();
  const finalSet = makeChangeSet({ status: "awaiting_approval" });

  let draftCall = 0;
  mock.method(adsManagementServiceDependencies, "getChangeSet", async (id: string) => {
    if (id !== "cs-1") throw new Error(`Unexpected change-set id: ${id}`);
    return draftCall++ === 0 ? draftedSet : finalSet;
  }, { times: 2 });
  const patchChangeSet = mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  const patchFieldChange = mock.method(adsManagementServiceDependencies, "patchFieldChange", async () => undefined);
  const addEvent = mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);
  mock.method(adsManagementServiceDependencies, "fetchOfficialValues", async () => new Map([["change-1", "Old name"]]));
  mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async () => new Map([["change-1", {}]]));

  const result = await submitChangeSetForReview("cs-1", "Bob");

  assert.equal(result.status, "awaiting_approval");
  assert.equal(patchChangeSet.mock.calls.length, 2);
  assert.equal(patchFieldChange.mock.calls.length, 2);
  assert.equal(addEvent.mock.calls.length, 1);
});

test("submitChangeSetForReview detects conflicts when latest Google values changed", async () => {
  const generated = makeChangeSet();
  const baseChange = generated.ads_field_changes?.[0];
  if (!baseChange) throw new Error("Test fixture missing field change.");
  const draftedSet = makeChangeSet({ ads_field_changes: [ { ...baseChange, baseline_value: "Old name", proposed_value: "New name" } ] });
  const conflictedSet = makeChangeSet({ status: "conflict_detected" }, { latest_official_value: "Google changed", reviewed_official_value: null, conflict_resolution: null });

  const calls: string[] = [];
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => {
    const response = calls.length === 0 ? draftedSet : conflictedSet;
    calls.push(response.status);
    return response;
  }, { times: 2 });
  mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  mock.method(adsManagementServiceDependencies, "patchFieldChange", async () => undefined);
  mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);
  mock.method(adsManagementServiceDependencies, "fetchOfficialValues", async () => new Map([["change-1", "Google changed"]]));
  mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async () => new Map([["change-1", {}]]));

  const result = await submitChangeSetForReview("cs-1", "Bob");

  assert.equal(result.status, "conflict_detected");
  assert.equal(calls.join(","), "draft,conflict_detected");
});

test("resolveConflict keeps official value when user chooses to keep official", async () => {
  const set = makeChangeSet({
    status: "conflict_detected",
    ads_field_changes: [
      {
        id: "change-1",
        change_set_id: "cs-1",
        entity_type: "campaign",
        entity_id: "111",
        entity_name: "Search",
        field_key: "campaign.name",
        field_label: "Campaign name",
        value_type: "string",
        baseline_value: "Old name",
        proposed_value: "New name",
        latest_official_value: "Official name",
        reviewed_official_value: null,
        published_value: null,
        verified_value: null,
        conflict_resolution: null,
        validation_errors: [],
        publish_status: "pending",
        verification_status: "pending",
        platform_response: null,
        last_error_message: null,
        publish_attempts: 0,
      },
    ],
  });

  const updatedSet = makeChangeSet({
    status: "draft",
    version: 2,
    created_by_name: "Alice",
    ads_field_changes: [
      {
        id: "change-1",
        change_set_id: "cs-1",
        entity_type: "campaign",
        entity_id: "111",
        entity_name: "Search",
        field_key: "campaign.name",
        field_label: "Campaign name",
        value_type: "string",
        baseline_value: "Old name",
        proposed_value: "Official name",
        latest_official_value: "Official name",
        reviewed_official_value: "Official name",
        published_value: null,
        verified_value: null,
        conflict_resolution: "keep_official",
        validation_errors: [],
        publish_status: "pending",
        verification_status: "pending",
        platform_response: null,
        last_error_message: null,
        publish_attempts: 0,
      },
    ],
  });

  let calls = 0;
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => {
    calls += 1;
    return calls === 1 ? set : updatedSet;
  }, { times: 4 });
  mock.method(adsManagementServiceDependencies, "patchFieldChange", async () => undefined);
  mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);
  mock.method(adsManagementServiceDependencies, "snapshotRevision", async () => ({ ...updatedSet.ads_change_set_revisions![0], version: 2 }));

  const result = await resolveConflict("cs-1", "change-1", "keep_official", "Bob");

  assert.equal(result.status, "draft");
});

test("approval binds the exact immutable revision and a 24-hour expiry", async () => {
  const awaiting = makeChangeSet({ status: "awaiting_approval", preflight_state_hash: "b".repeat(64) });
  const payloadHash = canonicalPayloadHash(buildRevisionPayload(awaiting));
  awaiting.ads_change_set_revisions = [{ ...awaiting.ads_change_set_revisions![0], payload_hash: payloadHash }];
  const approved = makeChangeSet({ ...awaiting, status: "approved", approved_payload_hash: payloadHash });
  let calls = 0;
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => calls++ === 0 ? awaiting : approved, { times: 2 });
  const approveRevision = mock.method(adsManagementServiceDependencies, "approveRevision", async () => undefined);

  const result = await approveChangeRequest("cs-1", { id: "admin-1", name: "Admin" });

  assert.equal(result.status, "approved");
  const approvalCall = approveRevision.mock.calls[0];
  assert.ok(approvalCall);
  const approvalInput = approvalCall.arguments[0];
  assert.ok(approvalInput);
  assert.equal(approvalInput.payloadHash, payloadHash);
  const expiresAt = Date.parse(String(approvalInput.expiresAt));
  assert.ok(expiresAt > Date.now() + 23 * 60 * 60 * 1000);
  assert.ok(expiresAt <= Date.now() + 24 * 60 * 60 * 1000 + 1000);
});

test("publishing is blocked after approval expiry before any Google mutation", async () => {
  const expired = makeChangeSet({
    status: "approved",
    approved_payload_hash: "a".repeat(64),
    approval_expires_at: "2026-08-01T00:00:00.000Z",
  });
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => expired, { times: 1 });
  const mutate = mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async () => new Map());

  await assert.rejects(() => publishChangeRequest("cs-1", { id: "admin-1", name: "Admin" }), /approval expired/i);
  assert.equal(mutate.mock.calls.length, 0);
});
