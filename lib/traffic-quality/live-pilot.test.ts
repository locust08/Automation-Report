import assert from "node:assert/strict";
import test from "node:test";
import { assertM01LivePilotAllowed, M01LivePilotLockedError } from "@/lib/traffic-quality/live-pilot";
import type { AdsChangeSetRecord, AdsFieldChangeRecord } from "@/lib/ads-management/types";

function change(overrides: Partial<AdsFieldChangeRecord> = {}): AdsFieldChangeRecord {
  return {
    id: "field-1", change_set_id: "pilot-1", entity_type: "ad_group_negative_keyword",
    entity_id: "ad-group-1", entity_name: "Ad group", field_key: "ad_group_criterion.negative_keyword",
    field_label: "Negative keyword", value_type: "negative_keyword", baseline_value: { exists: false },
    proposed_value: { text: "irrelevant query", matchType: "EXACT", negative: true }, latest_official_value: null,
    reviewed_official_value: null, published_value: null, verified_value: null, conflict_resolution: null,
    validation_errors: [], publish_status: "pending", verification_status: "pending", platform_response: null,
    last_error_message: null, publish_attempts: 0, ...overrides,
  };
}

function set(overrides: Partial<AdsChangeSetRecord> = {}): AdsChangeSetRecord {
  return {
    id: "pilot-1", account_id: "123", account_name: "Test", platform: "google", title: "Pilot", reason: "Approved test",
    status: "approved", created_by_id: "admin", created_by_name: "Admin", baseline_captured_at: new Date().toISOString(),
    version: 1, approved_at: new Date().toISOString(), published_at: null, verified_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source_module: "M01",
    ads_field_changes: [change()], ...overrides,
  };
}

test("permits only the configured M01 exact-negative pilot", () => {
  assert.doesNotThrow(() => assertM01LivePilotAllowed(set(), "pilot-1"));
});

test("keeps all other requests provider locked", () => {
  assert.throws(() => assertM01LivePilotAllowed(set(), undefined), M01LivePilotLockedError);
  assert.throws(() => assertM01LivePilotAllowed(set({ source_module: "M03" }), "pilot-1"), M01LivePilotLockedError);
  assert.throws(() => assertM01LivePilotAllowed(set({ ads_field_changes: [change({ proposed_value: { text: "query", matchType: "PHRASE", negative: true } })] }), "pilot-1"), M01LivePilotLockedError);
  assert.throws(() => assertM01LivePilotAllowed(set({ ads_field_changes: [change(), change({ id: "field-2" })] }), "pilot-1"), M01LivePilotLockedError);
});
