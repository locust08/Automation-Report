import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { buildPreviewDetailsStage } from "@/lib/reporting/preview-stages";
import { getPreviewExplicitAccountIds, normalizePreviewPlatform } from "@/lib/reporting/preview-route-input";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";
import { getImportedPreviewReport } from "@/lib/meta-import/reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;
  const platform = normalizePreviewPlatform(searchParams.get("platform"));

  try {
    const load = context.source === "meta_csv" ? getImportedPreviewReport : getPreviewReport;
    const payload = await load({
      accountId: context.accountId,
      ...getPreviewExplicitAccountIds(context),
      startDate: context.startDate,
      endDate: context.endDate,
      diagnosticsMode: searchParams.get("diagnostics") === "1",
      previewStage: "preview",
      previewSelection: {
        platform,
        campaignId: searchParams.get("campaignId")?.trim() || null,
        adGroupId: searchParams.get("adGroupId")?.trim() || null,
        adId: decodeURIComponent(routeParams.adId),
      },
    });

    return NextResponse.json(
      buildPreviewDetailsStage(payload, {
        platform,
        campaignId: searchParams.get("campaignId")?.trim() || null,
        adGroupId: searchParams.get("adGroupId")?.trim() || null,
        adId: decodeURIComponent(routeParams.adId),
      })
    );
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading preview details.");
  }
}
