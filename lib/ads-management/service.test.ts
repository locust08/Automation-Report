import assert from "node:assert/strict";
import { mock, test } from "node:test";
import * as adsGoogle from "@/lib/ads-management/google";
import * as adsSupabase from "@/lib/ads-management/supabase";
import { approvePublishVerify, rejectChangeRequest, resolveConflict, submitChangeSetForReview } from "@/lib/ads-management/service";
import type { AdsChangeSetRecord } from "@/lib/ads-management/types";

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

test("submitChangeSetForReview marks non-conflicted requests as awaiting approval", async () => {
  const draftedSet = makeChangeSet();
  const finalSet = makeChangeSet({ status: "awaiting_approval" });

  let draftCall = 0;
  mock.method(adsSupabase, "getChangeSet", async (id: string) => {
    if (id !== "cs-1") throw new Error(`Unexpected change-set id: ${id}`);
    return draftCall++ === 0 ? draftedSet : finalSet;
  }, { times: 2 });
  const patchChangeSet = mock.method(adsSupabase, "patchChangeSet", async () => undefined);
  const patchFieldChange = mock.method(adsSupabase, "patchFieldChange", async () => undefined);
  const addEvent = mock.method(adsSupabase, "addEvent", async () => undefined);
  mock.method(adsGoogle, "fetchOfficialValues", async () => new Map([["change-1", "Old name"]]));
  mock.method(adsGoogle, "mutateGoogleChanges", async () => new Map([["change-1", {}]]));

  const result = await submitChangeSetForReview("cs-1", "Bob");

  assert.equal(result.status, "awaiting_approval");
  assert.equal(patchChangeSet.mock.calls.length, 2);
  assert.equal(patchFieldChange.mock.calls.length, 4);
  assert.equal(addEvent.mock.calls.length, 1);
});

test("submitChangeSetForReview detects conflicts when latest Google values changed", async () => {
  const generated = makeChangeSet();
  const baseChange = generated.ads_field_changes?.[0];
  if (!baseChange) throw new Error("Test fixture missing field change.");
  const draftedSet = makeChangeSet({ ads_field_changes: [ { ...baseChange, baseline_value: "Old name", proposed_value: "New name" } ] });
  const conflictedSet = makeChangeSet({ status: "conflict_detected" }, { latest_official_value: "Google changed", reviewed_official_value: null, conflict_resolution: null });

  const calls: string[] = [];
  mock.method(adsSupabase, "getChangeSet", async () => {
    const response = calls.length === 0 ? draftedSet : conflictedSet;
    calls.push(response.status);
    return response;
  }, { times: 2 });
  mock.method(adsSupabase, "patchChangeSet", async () => undefined);
  mock.method(adsSupabase, "patchFieldChange", async () => undefined);
  mock.method(adsSupabase, "addEvent", async () => undefined);
  mock.method(adsGoogle, "fetchOfficialValues", async () => new Map([["change-1", "Google changed"]]));
  mock.method(adsGoogle, "mutateGoogleChanges", async () => new Map([["change-1", {}]]));

  const result = await submitChangeSetForReview("cs-1", "Bob");

  assert.equal(result.status, "conflict_detected");
  assert.equal(calls.join(","), "draft,conflict_detected");
});

test("approvePublishVerify blocks approval by the same creator", async () => {
  const draftedSet = makeChangeSet({ status: "awaiting_approval" });
  mock.method(adsSupabase, "getChangeSet", async () => draftedSet, { times: 1 });
  mock.method(adsSupabase, "addApproval", async () => undefined);
  mock.method(adsSupabase, "patchChangeSet", async () => undefined);
  mock.method(adsSupabase, "patchFieldChange", async () => undefined);
  mock.method(adsSupabase, "addEvent", async () => undefined);
  mock.method(adsGoogle, "fetchOfficialValues", async () => new Map([["change-1", "Old name"]]));
  mock.method(adsGoogle, "mutateGoogleChanges", async () => new Map([["change-1", {}]]));

  await assert.rejects(async () => approvePublishVerify("cs-1", "Alice", "self approval"), /second person/i);
});

test("rejectChangeRequest rejects request and records cancelled status", async () => {
  const draftedSet = makeChangeSet({ status: "awaiting_approval" });
  mock.method(adsSupabase, "getChangeSet", async () => draftedSet, { times: 1 });
  mock.method(adsSupabase, "addApproval", async () => undefined);
  mock.method(adsSupabase, "addEvent", async () => undefined);
  mock.method(adsSupabase, "patchChangeSet", async () => undefined);

  const result = await rejectChangeRequest("cs-1", "Bob", "Needs more review");

  assert.equal(result.status, "cancelled");
});

test("rejectChangeRequest blocks same-person rejection", async () => {
  const draftedSet = makeChangeSet({ status: "awaiting_approval" });
  mock.method(adsSupabase, "getChangeSet", async () => draftedSet, { times: 1 });

  await assert.rejects(async () => rejectChangeRequest("cs-1", "Alice", "self reject"), /second person/i);
});

test("rejectChangeRequest rejects if request is not awaiting approval", async () => {
  const draftedSet = makeChangeSet({ status: "draft" });
  mock.method(adsSupabase, "getChangeSet", async () => draftedSet, { times: 1 });

  await assert.rejects(async () => rejectChangeRequest("cs-1", "Bob", "too late"), /not ready/i);
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
    status: "awaiting_approval",
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
  mock.method(adsSupabase, "getChangeSet", async () => {
    calls += 1;
    return calls === 1 ? set : updatedSet;
  }, { times: 2 });
  mock.method(adsSupabase, "patchFieldChange", async () => undefined);
  mock.method(adsSupabase, "patchChangeSet", async () => undefined);
  mock.method(adsSupabase, "addEvent", async () => undefined);

  const result = await resolveConflict("cs-1", "change-1", "keep_official", "Bob");

  assert.equal(result.status, "awaiting_approval");
});
