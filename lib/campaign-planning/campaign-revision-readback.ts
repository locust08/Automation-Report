import type { CampaignPlanDetail } from "./types";

type RevisionWrite = {
  revision_id: number | string;
  revision_number: number;
  payload_hash: string;
};

export function verifyCampaignRevisionReadback(
  before: CampaignPlanDetail,
  write: RevisionWrite,
  after: CampaignPlanDetail,
  expectedName: string,
  expectedHash: string,
): void {
  const revisionId = Number(write.revision_id);
  const retainedRevision = after.revisions.find((revision) => revision.id === before.currentRevision.id);
  if (!Number.isSafeInteger(revisionId)
    || revisionId === before.currentRevision.id
    || write.revision_number !== before.currentRevision.revisionNo + 1
    || write.payload_hash !== expectedHash) {
    throw new Error("M04 revision write returned an unexpected result.");
  }

  if (after.plan.id !== before.plan.id
    || after.plan.lockVersion !== before.plan.lockVersion + 1
    || after.currentRevision.id !== revisionId
    || after.currentRevision.revisionNo !== write.revision_number
    || after.currentRevision.payloadHash !== expectedHash
    || after.currentRevision.campaignName !== expectedName
    || after.plan.campaignName !== expectedName
    || after.plan.approvedRevisionId !== null
    || after.plan.approvedRevisionHash !== null
    || after.revisions.length !== before.revisions.length + 1
    || after.revisions.filter((revision) => revision.id === revisionId).length !== 1
    || retainedRevision?.payloadHash !== before.currentRevision.payloadHash
    || retainedRevision?.canonicalJson !== before.currentRevision.canonicalJson) {
    throw new Error("M04 revision readback did not confirm the saved name and one new immutable revision.");
  }

  if (after.approval?.revisionId === revisionId) {
    throw new Error("M04 revision readback shows an active approval for the new revision.");
  }
}
