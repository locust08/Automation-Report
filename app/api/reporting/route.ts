import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import {
  buildOverallReportCacheKey,
  readOverallReportCache,
  writeOverallReportCache,
} from "@/lib/reporting/overall-cache";
import { parseRequestContext } from "@/lib/reporting/request";
import { getOverallReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inFlightOverallReports = new Map<string, Promise<Awaited<ReturnType<typeof getOverallReport>>>>();

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const cacheKey = buildOverallReportCacheKey({
    accountId: context.accountId,
    metaAccountId: context.metaAccountId,
    googleAccountId: context.googleAccountId,
    startDate: context.startDate,
    endDate: context.endDate,
  });
  const forceRefresh = searchParams.get("regenerate") === "1" || searchParams.get("refresh") === "1";

  try {
    if (!forceRefresh) {
      const cachedPayload = await readOverallReportCache(cacheKey);
      if (cachedPayload) {
        console.info(`[overall-report] cache hit key=${cacheKey}`);
        return NextResponse.json(cachedPayload);
      }
    }

    console.info(`[overall-report] cache miss key=${cacheKey} force_refresh=${forceRefresh}`);
    let payloadPromise = inFlightOverallReports.get(cacheKey);
    if (!payloadPromise) {
      payloadPromise = getOverallReport({
        accountId: context.accountId,
        metaAccountId: context.metaAccountId,
        googleAccountId: context.googleAccountId,
        startDate: context.startDate,
        endDate: context.endDate,
      })
        .then(async (payload) => {
          await writeOverallReportCache(cacheKey, payload);
          return payload;
        })
        .finally(() => {
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
