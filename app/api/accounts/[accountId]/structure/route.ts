import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { buildPreviewStructureStage } from "@/lib/reporting/preview-stages";
import { resolvePreviewRouteAccountId } from "@/lib/reporting/preview-route-input";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";
import { getImportedPreviewReport } from "@/lib/meta-import/reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;

  try {
    const load = context.source === "meta_csv" ? getImportedPreviewReport : getPreviewReport;
    const payload = await load({
      accountId: resolvePreviewRouteAccountId(normalizeRouteAccountId(routeParams.accountId), context),
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      tiktokAccountId: context.tiktokAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
      diagnosticsMode: searchParams.get("diagnostics") === "1",
    });

    return NextResponse.json(buildPreviewStructureStage(payload));
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading account structure.");
  }
}

function normalizeRouteAccountId(value: string): string | null {
  const decoded = decodeURIComponent(value).trim();
  return decoded && decoded !== "-" ? decoded : null;
}
