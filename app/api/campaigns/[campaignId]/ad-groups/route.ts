import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { buildPreviewAdGroupsStage } from "@/lib/reporting/preview-stages";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;
  const platform = normalizePlatform(searchParams.get("platform"));

  try {
    const payload = await getPreviewReport({
      accountId: context.accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
      diagnosticsMode: searchParams.get("diagnostics") === "1",
      previewStage: "ad-groups",
      previewSelection: {
        platform,
        campaignId: decodeURIComponent(routeParams.campaignId),
        adGroupId: null,
        adId: null,
      },
    });

    return NextResponse.json(
      buildPreviewAdGroupsStage(payload, {
        platform,
        campaignId: decodeURIComponent(routeParams.campaignId),
        adGroupId: null,
        adId: null,
      })
    );
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading ad groups.");
  }
}

function normalizePlatform(value: string | null): "meta" | "google" | null {
  return value === "meta" || value === "google" ? value : null;
}
