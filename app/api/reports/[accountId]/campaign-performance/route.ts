import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getOverallCampaignPerformanceStage } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;
  const accountId = normalizeRouteAccountId(routeParams.accountId);

  try {
    const payload = await getOverallCampaignPerformanceStage({
      accountId: context.accountId ?? accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading campaign performance.");
  }
}

function normalizeRouteAccountId(value: string): string | null {
  const decoded = decodeURIComponent(value).trim();
  return decoded && decoded !== "-" ? decoded : null;
}
