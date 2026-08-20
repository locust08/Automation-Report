import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  adsManagementServiceDependencies,
  approveChangeRequest,
  publishChangeRequest,
  retryFailedChangeRequestItems,
  resolveConflict,
  validateChangeRequest,
} from "@/lib/ads-management/service";
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
    ...overrides,
  } as AdsChangeSetRecord;
}

test("validation is non-mutating and moves a clean request to awaiting approval", async () => {
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

  const result = await validateChangeRequest("cs-1", "Bob");

  assert.equal(result.status, "awaiting_approval");
  assert.equal(patchChangeSet.mock.calls.length, 2);
  assert.equal(patchFieldChange.mock.calls.length, 3);
  assert.equal(addEvent.mock.calls.length, 1);
});

test("validation detects conflicts when latest Google values changed", async () => {
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

  const result = await validateChangeRequest("cs-1", "Bob");

  assert.equal(result.status, "conflict_detected");
  assert.equal(calls.join(","), "draft,conflict_detected");
});

test("approval is a separate explicit transition and does not call Google", async () => {
  const awaiting = makeChangeSet({ status: "awaiting_approval" });
  const approved = makeChangeSet({ status: "approved", approved_at: "2026-08-01T01:00:00.000Z" });
  let reads = 0;
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => reads++ === 0 ? awaiting : approved, { times: 2 });
  const patch = mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  const event = mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);
  const approval = mock.method(adsManagementServiceDependencies, "addApproval", async () => undefined);
  const mutate = mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async () => new Map());

  const result = await approveChangeRequest("cs-1", "Alice");

  assert.equal(result.status, "approved");
  assert.equal(patch.mock.calls.length, 1);
  assert.equal(event.mock.calls.length, 1);
  assert.equal(approval.mock.calls.length, 1);
  assert.equal(mutate.mock.calls.length, 0);
});

test("publishing rejects draft, validated-but-unapproved, and legacy ready states", async () => {
  for (const status of ["draft", "awaiting_approval", "ready_to_publish"] as const) {
    mock.restoreAll();
    mock.method(adsManagementServiceDependencies, "getChangeSet", async () => makeChangeSet({ status }));
    const mutate = mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async () => new Map());
    await assert.rejects(() => publishChangeRequest("cs-1", "Alice"), /approved/i);
    assert.equal(mutate.mock.calls.length, 0);
  }
});

test("publish retry mutates only failed items and verifies the complete set", async () => {
  const base = makeChangeSet().ads_field_changes![0];
  const initial = makeChangeSet({ status: "partially_completed", approved_at: "2026-08-01T01:00:00.000Z", ads_field_changes: [
    { ...base, id: "change-ok", publish_status: "succeeded", published_value: "First", proposed_value: "First", reviewed_official_value: "Old first" },
    { ...base, id: "change-failed", publish_status: "failed", proposed_value: "Second", reviewed_official_value: "Old second", publish_attempts: 1 },
  ] });
  const afterRetry = makeChangeSet({ status: "publishing", approved_at: initial.approved_at, ads_field_changes: [
    { ...base, id: "change-ok", publish_status: "succeeded", published_value: "First", proposed_value: "First" },
    { ...base, id: "change-failed", publish_status: "succeeded", published_value: "Second", proposed_value: "Second", publish_attempts: 2 },
  ] });
  const final = makeChangeSet({ status: "verified", approved_at: initial.approved_at, verified_at: "2026-08-01T02:00:00.000Z", ads_field_changes: afterRetry.ads_field_changes });
  let reads = 0;
  mock.method(adsManagementServiceDependencies, "getChangeSet", async () => [initial, afterRetry, final][reads++], { times: 3 });
  mock.method(adsManagementServiceDependencies, "patchFieldChange", async () => undefined);
  mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);
  mock.method(adsManagementServiceDependencies, "createNotification", async () => undefined);
  mock.method(adsManagementServiceDependencies, "assertGoogleWritesAllowed", () => undefined);
  let officialReads = 0;
  mock.method(adsManagementServiceDependencies, "fetchOfficialValues", async () => officialReads++ === 0
    ? new Map([["change-failed", "Old second"]])
    : new Map([["change-ok", "First"], ["change-failed", "Second"]]));
  const mutate = mock.method(adsManagementServiceDependencies, "mutateGoogleChanges", async (_account: string, changes: typeof initial.ads_field_changes) => {
    assert.deepEqual(changes?.map((change) => change.id), ["change-failed"]);
    return new Map([["change-failed", {}]]);
  });

  const result = await retryFailedChangeRequestItems("cs-1", "Alice");

  assert.equal(result.status, "verified");
  assert.equal(mutate.mock.calls.length, 1);
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
    status: "ready_to_publish",
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
  }, { times: 3 });
  mock.method(adsManagementServiceDependencies, "patchFieldChange", async () => undefined);
  mock.method(adsManagementServiceDependencies, "patchChangeSet", async () => undefined);
  mock.method(adsManagementServiceDependencies, "addEvent", async () => undefined);

  const result = await resolveConflict("cs-1", "change-1", "keep_official", "Bob");

  assert.equal(result.status, "ready_to_publish");
});
