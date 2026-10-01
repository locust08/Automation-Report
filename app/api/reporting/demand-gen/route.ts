import { NextResponse } from "next/server";
import { parseRequestContext } from "@/lib/reporting/request";
import { getDemandGenReport } from "@/lib/reporting/service";
import { buildReportingErrorResponse } from "@/lib/reporting/api-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const context = parseRequestContext(params);
  try {
    return NextResponse.json(await getDemandGenReport({ ...context, accountId: null, metaAccountId: null, tiktokAccountId: null, googleAccountId: context.googleAccountId ?? context.accountId }, params.get("campaignId")), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return buildReportingErrorResponse(error, "Unable to load Demand Gen analysis.");
  }
}
