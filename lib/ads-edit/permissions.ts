import type { AdsChangeSet } from "@/lib/ads-edit/types";

export function canOpenAdsEditDraft(): boolean {
  return process.env.NEXT_PUBLIC_ADS_EDIT_ENABLED !== "false";
}

export function assertBackendAdsSyncPermission(request: Request, changeSet: AdsChangeSet) {
  if (process.env.ADS_EDIT_ENABLED === "false") {
    throw new AdsSyncPermissionError("Ad editing is disabled for this environment.");
  }

  if (!["google", "meta"].includes(changeSet.platform)) {
    throw new AdsSyncPermissionError("This ad platform is not supported for safe sync.");
  }

  const expectedSecret = process.env.ADS_SYNC_SECRET?.trim() || process.env.REPORT_AUTOMATION_SECRET?.trim() || "";
  if (!expectedSecret) {
    if (process.env.NODE_ENV !== "production" || process.env.ADS_SYNC_ALLOW_UNPROTECTED_DEV === "true") {
      return;
    }
    throw new AdsSyncPermissionError("Ad sync permission is not configured for this environment.");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const syncSecret = request.headers.get("x-ads-sync-secret") ?? "";
  if (authorization === `Bearer ${expectedSecret}` || syncSecret === expectedSecret) {
    return;
  }

  throw new AdsSyncPermissionError("You do not have permission to sync ad changes.");
}

export class AdsSyncPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsSyncPermissionError";
  }
}
