import type { AdsChangeSet } from "@/lib/ads-edit/types";

export interface AdsSyncAdapterResult {
  syncedChanges: number;
  warnings: string[];
}

export interface AdsSyncAdapter {
  sync(changeSet: AdsChangeSet): Promise<AdsSyncAdapterResult>;
}

export class GoogleAdsSyncAdapter implements AdsSyncAdapter {
  async sync(changeSet: AdsChangeSet): Promise<AdsSyncAdapterResult> {
    if (process.env.GOOGLE_ADS_SYNC_ENABLED !== "true") {
      return {
        syncedChanges: changeSet.changes.length,
        warnings: [
          "Google Ads sync adapter accepted the change set in safe dry-run mode. Set GOOGLE_ADS_SYNC_ENABLED=true after wiring approved mutate operations.",
        ],
      };
    }

    throw new Error(
      "Google Ads live mutation is not configured yet. Add approved Google Ads mutate operations to GoogleAdsSyncAdapter before enabling production sync."
    );
  }
}

export class MetaAdsSyncAdapter implements AdsSyncAdapter {
  async sync(): Promise<AdsSyncAdapterResult> {
    return {
      syncedChanges: 0,
      warnings: ["Meta Ads sync is not ready yet. No Meta changes were sent."],
    };
  }
}

export function getAdsSyncAdapter(platform: AdsChangeSet["platform"]): AdsSyncAdapter {
  if (platform === "google") {
    return new GoogleAdsSyncAdapter();
  }
  return new MetaAdsSyncAdapter();
}
