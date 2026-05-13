import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getOverallReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";

const inFlightOverallReports = new Map<string, Promise<Awaited<ReturnType<typeof getOverallReport>>>>();

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const cacheKey = createRequestCacheKey(searchParams);

  try {
    let payloadPromise = inFlightOverallReports.get(cacheKey);
    if (!payloadPromise) {
      payloadPromise = getOverallReport({
        accountId: context.accountId,
        metaAccountId: context.metaAccountId,
        googleAccountId: context.googleAccountId,
        startDate: context.startDate,
        endDate: context.endDate,
      }).finally(() => {
        inFlightOverallReports.delete(cacheKey);
      });
      inFlightOverallReports.set(cacheKey, payloadPromise);
    }

    const payload = await payloadPromise;

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading overall report data.");
  }
}

function createRequestCacheKey(searchParams: URLSearchParams): string {
  const entries = Array.from(searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyComparison = leftKey.localeCompare(rightKey);
    return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
  });
  return new URLSearchParams(entries).toString();
}
