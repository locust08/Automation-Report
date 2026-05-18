import type { AdsChangeSet } from "@/lib/ads-edit/types";

export interface AdsSyncAuditRecord {
  auditId: string;
  status: "attempted" | "succeeded" | "failed";
  changeSet: AdsChangeSet;
  message: string;
  error?: string;
}

export function createAdsSyncAuditId(): string {
  return `ads-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function writeAdsSyncAuditLog(record: AdsSyncAuditRecord) {
  const payload = {
    auditId: record.auditId,
    status: record.status,
    platform: record.changeSet.platform,
    accountId: record.changeSet.accountId,
    campaignId: record.changeSet.campaignId,
    adGroupId: record.changeSet.adGroupId,
    adId: record.changeSet.adId,
    changeCount: record.changeSet.changes.length,
    changedPaths: record.changeSet.changes.map((change) => change.path),
    message: record.message,
    error: record.error ?? null,
    at: new Date().toISOString(),
  };

  console.log(`[ads-sync-audit] ${JSON.stringify(payload)}`);
}
