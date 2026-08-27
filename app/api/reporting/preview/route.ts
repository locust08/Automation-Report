import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";
import { getImportedPreviewReport } from "@/lib/meta-import/reporting";
import {
  MetaAccountCircuitOpenError,
  MetaAccountRequestBusyError,
  metaAccountProtection,
} from "@/lib/reporting/meta-account-protection";
import { parseMetaManagementStage } from "@/lib/reporting/meta-management-stage";
import { parseTikTokManagementStage } from "@/lib/reporting/tiktok-management-stage";
import { TikTokManagementRequestBusyError, tiktokManagementCache } from "@/lib/reporting/tiktok-management-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const diagnosticsMode = searchParams.get("diagnostics") === "1";
  const includeInactiveMeta = searchParams.get("includeInactiveMeta") === "1";
  const metaManagementStage = parseMetaManagementStage(searchParams.get("stage"));
  const tiktokManagementStage = context.platform === "tiktok" ? parseTikTokManagementStage(searchParams.get("stage")) : null;
  const managementStage = tiktokManagementStage ?? metaManagementStage;

  try {
    if (context.source === "meta_csv") {
      return NextResponse.json(
        await getImportedPreviewReport({
          accountId: context.accountId,
          metaAccountId: context.metaAccountId,
          googleAccountId: null,
          tiktokAccountId: null,
          startDate: context.startDate,
          endDate: context.endDate,
        })
      );
    }
    const load = async () => {
      const payload = await getPreviewReport({
        accountId: context.accountId,
        metaAccountId: context.metaAccountId,
        googleAccountId: context.googleAccountId,
        tiktokAccountId: context.tiktokAccountId,
        startDate: context.startDate,
        endDate: context.endDate,
        diagnosticsMode,
        previewStage: managementStage ?? undefined,
        previewSelection: managementStage ? {
          platform: tiktokManagementStage ? "tiktok" : "meta",
          campaignId: searchParams.get("campaignId")?.trim() || null,
          adGroupId: searchParams.get("adGroupId")?.trim() || null,
          adId: searchParams.get("adId")?.trim() || null,
        } : undefined,
        metaIncludeInactivePreview: includeInactiveMeta,
        metaManagementStage: metaManagementStage ?? undefined,
      });
      const fatal = payload.metaFatalErrors?.[0];
      if (fatal) {
        throw Object.assign(new Error(fatal.message), {
          code: fatal.errorCode,
          subcode: fatal.errorSubcode,
        });
      }
      return payload;
    };

    const accountId = normalizeMetaAccountId(context.metaAccountId);
    const tiktokAdvertiserId = context.tiktokAccountId?.trim() || null;
    const payload = metaManagementStage && accountId
      ? await metaAccountProtection.run({
          accountId,
          key: [managementStage, context.startDate, context.endDate, searchParams.get("campaignId"), searchParams.get("adGroupId")].join(":"),
          load,
        })
      : tiktokManagementStage && tiktokAdvertiserId
        ? await tiktokManagementCache.run({
            advertiserId: tiktokAdvertiserId,
            key: [tiktokManagementStage, context.startDate, context.endDate, searchParams.get("campaignId"), searchParams.get("adGroupId"), searchParams.get("adId"), searchParams.get("refresh")].join(":"),
            load,
          })
        : null;

    if (!payload) return NextResponse.json(await load());
    if (metaManagementStage && "protection" in payload) return NextResponse.json({
      ...payload.value,
      metaProtection: { source: payload.source, ...payload.protection },
    });
    return NextResponse.json(payload.value);
  } catch (error) {
    if (error instanceof MetaAccountCircuitOpenError) {
      return NextResponse.json({ error: error.message, code: "meta_circuit_open", ...error.status }, { status: 429 });
    }
    if (error instanceof MetaAccountRequestBusyError) {
      return NextResponse.json({ error: error.message, code: "meta_request_busy" }, { status: 409 });
    }
    if (error instanceof TikTokManagementRequestBusyError) {
      return NextResponse.json({ error: error.message, code: "tiktok_request_busy" }, { status: 409 });
    }
    return buildReportingErrorResponse(error, "Unexpected error while loading preview data.");
  }
}

function normalizeMetaAccountId(value: string | null): string | null {
  const normalized = value?.replace(/^act_/, "").replace(/\D/g, "") ?? "";
  return normalized || null;
}
