import { NextResponse } from "next/server";

import { readAdvancedReportCache, writeAdvancedReportCache } from "@/lib/reporting/advanced-cache";
import {
  buildAdvancedReportCacheKey,
  generateAdvancedReport,
  getAdvancedReportCountry,
  refreshAdvancedReportVolatileMedia,
} from "@/lib/reporting/advanced-report";
import { buildDateRange } from "@/lib/reporting/date";

export const dynamic = "force-dynamic";

const inFlightAdvancedReports = new Map<string, Promise<void>>();
const failedAdvancedReports = new Map<string, { message: string; failedAt: string }>();

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const input = parseAdvancedReportRequest(url.searchParams);
  if (!input.accountId) {
    return NextResponse.json(
      { status: "error", message: "Ad Account ID is required." },
      { status: 400 }
    );
  }

  const cacheKey = resolveCacheKey(input);
  const cached = await readAdvancedReportCache(cacheKey);
  if (!cached) {
    const inFlight = inFlightAdvancedReports.get(cacheKey);
    if (inFlight) {
      return NextResponse.json({ status: "generating", cacheKey });
    }

    const failed = failedAdvancedReports.get(cacheKey);
    if (failed) {
      return NextResponse.json(
        { status: "error", cacheKey, message: failed.message, failedAt: failed.failedAt },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "missing", cacheKey });
  }

  const payload = await refreshAdvancedReportVolatileMedia(cached);
  if (payload !== cached) {
    await writeAdvancedReportCache(cacheKey, payload);
  }
  return NextResponse.json({ status: "ready", cacheKey, payload });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const bodyParams = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    if (typeof value === "string") {
      bodyParams.set(key, value);
    }
  });
  const input = parseAdvancedReportRequest(bodyParams, url.searchParams);
  const force = url.searchParams.get("regenerate") === "1" || body.regenerate === true;

  if (!input.accountId) {
    return NextResponse.json(
      { status: "error", message: "Ad Account ID is required." },
      { status: 400 }
    );
  }

  const cacheKey = resolveCacheKey(input);

  if (!force) {
    const cached = await readAdvancedReportCache(cacheKey);
    if (cached) {
      const payload = await refreshAdvancedReportVolatileMedia(cached);
      if (payload !== cached) {
        await writeAdvancedReportCache(cacheKey, payload);
      }
      return NextResponse.json({ status: "ready", cacheKey, payload });
    }
  }

  failedAdvancedReports.delete(cacheKey);

  let generationPromise = inFlightAdvancedReports.get(cacheKey);
  if (!generationPromise) {
    generationPromise = generateAdvancedReport(input)
      .then(async (payload) => {
        await writeAdvancedReportCache(cacheKey, payload);
      })
      .catch((error: unknown) => {
        failedAdvancedReports.set(cacheKey, {
          message: error instanceof Error ? error.message : "Advanced report generation failed.",
          failedAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        inFlightAdvancedReports.delete(cacheKey);
      });
    inFlightAdvancedReports.set(cacheKey, generationPromise);
  }

  return NextResponse.json({ status: "generating", cacheKey });
}

function parseAdvancedReportRequest(
  primary: URLSearchParams,
  fallback?: URLSearchParams
): {
  accountId: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
} {
  return {
    accountId: getValue(primary, fallback, "accountId"),
    country: getValue(primary, fallback, "country"),
    startDate: getValue(primary, fallback, "startDate"),
    endDate: getValue(primary, fallback, "endDate"),
  };
}

function getValue(primary: URLSearchParams, fallback: URLSearchParams | undefined, key: string): string | null {
  const value = primary.get(key) ?? fallback?.get(key) ?? null;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveCacheKey(input: {
  accountId: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const country = getAdvancedReportCountry(input.country);
  return buildAdvancedReportCacheKey({
    accountId: input.accountId ?? "",
    country: country.code,
    dateRange,
  });
}
