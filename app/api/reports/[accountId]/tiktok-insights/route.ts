import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext, resolveRouteAccountFallback } from "@/lib/reporting/request";
import { getOverallTikTokInsightsStage } from "@/lib/reporting/service";
import { isTikTokReconnectError } from "@/lib/reporting/tiktok";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;
  const decoded = decodeURIComponent(routeParams.accountId).trim();
  const accountId = decoded && decoded !== "-" ? decoded : null;

  try {
    const payload = await getOverallTikTokInsightsStage({
      accountId: resolveRouteAccountFallback(accountId, context),
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      tiktokAccountId: context.tiktokAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (isTikTokReconnectError(error)) {
      return NextResponse.json(
        { error: "TikTok authorization does not include this advertiser. An administrator must reconnect TikTok." },
        { status: 403 },
      );
    }
    return buildReportingErrorResponse(error, "Unable to load TikTok insights.");
  }
}
