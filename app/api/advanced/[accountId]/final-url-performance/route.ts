import { NextResponse } from "next/server";

import { buildFinalUrlPerformanceSection } from "@/lib/reporting/advanced-report";
import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getGoogleAdvancedAdUsageReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const routeParams = await params;
  const accountId = decodeURIComponent(routeParams.accountId);

  try {
    if (inferAccountPlatform(accountId) !== "google") {
      return NextResponse.json({
        section: buildFinalUrlPerformanceSection([]),
        warnings: ["Final URL Destination Performance is available for Google Ads accounts only."],
      });
    }

    const usage = await getGoogleAdvancedAdUsageReport({
      accountId: null,
      metaAccountId: null,
      googleAccountId: accountId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json({
      section: buildFinalUrlPerformanceSection(usage.finalUrlRows),
      warnings: usage.warnings,
    });
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading final URL performance.");
  }
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
