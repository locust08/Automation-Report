import { NextResponse } from "next/server";

import { getAdsSyncAdapter } from "@/lib/ads-edit/adapters";
import { createAdsSyncAuditId, writeAdsSyncAuditLog } from "@/lib/ads-edit/audit";
import { AdsSyncPermissionError, assertBackendAdsSyncPermission } from "@/lib/ads-edit/permissions";
import type { AdsSyncRequestBody, AdsSyncResponseBody } from "@/lib/ads-edit/types";
import { validateAdsChangeSet } from "@/lib/ads-edit/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse<AdsSyncResponseBody | { error: string }>> {
  let body: AdsSyncRequestBody | null = null;
  let auditId = createAdsSyncAuditId();

  try {
    body = (await request.json()) as AdsSyncRequestBody;
    const changeSet = body.changeSet;
    auditId = createAdsSyncAuditId();

    assertBackendAdsSyncPermission(request, changeSet);

    const validation = validateAdsChangeSet(changeSet);
    if (!validation.valid) {
      writeAdsSyncAuditLog({
        auditId,
        status: "failed",
        changeSet,
        message: "Ad sync validation failed.",
        error: validation.issues.map((issue) => issue.message).join(" | "),
      });

      return NextResponse.json(
        {
          success: false,
          state: "failed",
          message: "Please fix the draft validation errors before syncing.",
          warnings: validation.issues.map((issue) => issue.message),
          auditId,
          syncedChanges: 0,
        },
        { status: 400 }
      );
    }

    writeAdsSyncAuditLog({
      auditId,
      status: "attempted",
      changeSet,
      message: "Ad sync attempt started.",
    });

    const adapter = getAdsSyncAdapter(changeSet.platform);
    const result = await adapter.sync(changeSet);
    const warnings = [...changeSet.warnings, ...result.warnings];

    writeAdsSyncAuditLog({
      auditId,
      status: "succeeded",
      changeSet,
      message: "Ad sync attempt completed.",
    });

    return NextResponse.json({
      success: true,
      state: "synced",
      message: "Changes were reviewed and sent through the backend sync adapter.",
      warnings,
      auditId,
      syncedChanges: result.syncedChanges,
    });
  } catch (error) {
    const message = userFriendlySyncError(error);
    const status = error instanceof AdsSyncPermissionError ? 403 : 500;

    if (body?.changeSet) {
      writeAdsSyncAuditLog({
        auditId,
        status: "failed",
        changeSet: body.changeSet,
        message,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ error: message }, { status });
  }
}

function userFriendlySyncError(error: unknown): string {
  if (error instanceof AdsSyncPermissionError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "We could not sync the ad changes. Please review the draft and try again.";
}
