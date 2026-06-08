import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getOverallSummaryStage } from "@/lib/reporting/service";

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
  const platform = inferAccountPlatform(accountId ?? "");

  try {
    const payload = await getOverallSummaryStage({
      accountId: platform === "unknown" ? accountId : null,
      metaAccountId: platform === "meta" ? accountId : context.metaAccountId,
      googleAccountId: platform === "google" ? accountId : context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading advanced summary.");
  }
}

function normalizeRouteAccountId(value: string): string | null {
  const decoded = decodeURIComponent(value).trim();
  return decoded && decoded !== "-" ? decoded : null;
}

function inferAccountPlatform(accountId: string): "google" | "meta" | "unknown" {
  const digitsOnly = accountId.replace(/\D/g, "");
  if (/^\d{3}-\d{3}-\d{4}$/.test(accountId) || digitsOnly.length === 10) {
    return "google";
  }
  if (accountId.toLowerCase().startsWith("act_") || digitsOnly.length >= 12) {
    return "meta";
  }
  return "unknown";
}
