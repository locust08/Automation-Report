import assert from "node:assert/strict";
import test from "node:test";
import { canEditAds, normalizeAdsRole } from "./permissions";

const expected = [
  ["paid_media_specialist", true],
  ["campaign_optimizer", true],
  ["specialist", true],
  ["approver", false],
  ["team_lead", true],
  ["project_manager", true],
  ["admin", true],
  ["viewer", false],
] as const;

for (const [role, edit] of expected) {
  test(`${role} permissions`, () => {
    assert.equal(canEditAds(role), edit);
  });
}

test("normalizes display-style role names", () => {
  assert.equal(normalizeAdsRole("Paid Media Specialist"), "paid_media_specialist");
  assert.equal(normalizeAdsRole("Team-Lead"), "team_lead");
  assert.equal(normalizeAdsRole("unknown"), "viewer");
});
