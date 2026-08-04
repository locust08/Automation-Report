import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import {
  GoogleHealthScanError,
  scanGoogleAdsHealthStage,
} from "@/lib/reporting/google-health";
import type { GoogleAdsHealthStage } from "@/lib/reporting/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  const url = new URL(request.url);
  const stageValue = url.searchParams.get("stage")?.trim() ?? "core";
  const scanId = url.searchParams.get("scanId")?.trim().slice(0, 80) ?? "";
  const scanAtValue = url.searchParams.get("scanAt")?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "Select a Google Ads account first." }, { status: 400 });
  }
  if (!isHealthStage(stageValue)) {
    return NextResponse.json({ error: "Invalid Google Ads Health stage." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await scanGoogleAdsHealthStage({
        accountId,
        stage: stageValue,
        bypassCache: url.searchParams.has("cacheRefresh"),
        scanId,
        scanAt: scanAtValue ? new Date(scanAtValue) : undefined,
      })
    );
  } catch (error) {
    if (error instanceof GoogleHealthScanError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return buildReportingErrorResponse(
      error,
      "Unexpected error while loading Google Ads Health."
    );
  }
}

function isHealthStage(value: string): value is GoogleAdsHealthStage {
  return value === "core" || value === "policy" || value === "delivery" || value === "destination";
}
