import assert from "node:assert/strict";
import test from "node:test";

import { verifyCampaignRevisionReadback } from "./campaign-revision-readback";
import type { CampaignPlanDetail } from "./types";

function detail(revisionId: number, revisionNo: number, name: string, lockVersion: number): CampaignPlanDetail {
  return {
    plan: { id: 12, campaignName: name, lockVersion, approvedRevisionId: revisionNo === 1 ? 1 : null, approvedRevisionHash: revisionNo === 1 ? "hash-1" : null },
    currentRevision: { id: revisionId, revisionNo, campaignName: name, payloadHash: `hash-${revisionId}`, canonicalJson: JSON.stringify({ campaign_name: name }), payload: { campaign_name: name } },
    revisions: Array.from({ length: revisionNo }, (_, index) => ({ id: index + 1, payloadHash: `hash-${index + 1}`, canonicalJson: JSON.stringify({ campaign_name: index === 0 ? "Original" : name }) })),
    approval: { id: 8, revisionId: 1, revisionHash: "hash-1" },
  } as CampaignPlanDetail;
}

test("accepts exactly one new immutable revision and a superseded approval on fresh read", () => {
  const before = detail(1, 1, "Original", 3);
  const after = detail(2, 2, "Edited", 4);
  verifyCampaignRevisionReadback(before, { revision_id: 2, revision_number: 2, payload_hash: "hash-2" }, after, "Edited", "hash-2");
});

test("rejects an acknowledged write when the fresh read still returns the original revision", () => {
  const before = detail(1, 1, "Original", 3);
  assert.throws(
    () => verifyCampaignRevisionReadback(before, { revision_id: 2, revision_number: 2, payload_hash: "hash-2" }, before, "Edited", "hash-2"),
    /readback/i,
  );
});

test("rejects an active approval on the new revision", () => {
  const before = detail(1, 1, "Original", 3);
  const after = detail(2, 2, "Edited", 4);
  after.approval = { id: 9, revisionId: 2, revisionHash: "hash-2" } as CampaignPlanDetail["approval"];
  assert.throws(
    () => verifyCampaignRevisionReadback(before, { revision_id: 2, revision_number: 2, payload_hash: "hash-2" }, after, "Edited", "hash-2"),
    /approval/i,
  );
});

test("rejects a fresh read that kept the prior approval pointer", () => {
  const before = detail(1, 1, "Original", 3);
  const after = detail(2, 2, "Edited", 4);
  after.plan.approvedRevisionId = 1;
  after.plan.approvedRevisionHash = "hash-1";
  assert.throws(
    () => verifyCampaignRevisionReadback(before, { revision_id: 2, revision_number: 2, payload_hash: "hash-2" }, after, "Edited", "hash-2"),
    /readback/i,
  );
});
