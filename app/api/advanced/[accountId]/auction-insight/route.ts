import { NextResponse } from "next/server";

import {
  buildAuctionVisibilitySection,
  buildFinalUrlPerformanceSection,
} from "@/lib/reporting/advanced-report";
import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import {
  getGoogleAdvancedAdUsageReport,
  getGoogleAdvancedAuctionInsightRows,
} from "@/lib/reporting/service";

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
        section: buildAuctionVisibilitySection({
          accountId,
          accountPlatform: "meta",
          auctionRows: [],
          finalUrlRows: [],
        }),
        warnings: ["Auction Insight is available for Google Ads accounts only."],
      });
    }

    const [auction, usage] = await Promise.all([
      getGoogleAdvancedAuctionInsightRows({
        accountId: null,
        metaAccountId: null,
        googleAccountId: accountId,
        startDate: context.startDate,
        endDate: context.endDate,
      }),
      getGoogleAdvancedAdUsageReport({
        accountId: null,
        metaAccountId: null,
        googleAccountId: accountId,
        startDate: context.startDate,
        endDate: context.endDate,
      }),
    ]);

    return NextResponse.json({
      section:
        buildAuctionVisibilitySection({
          accountId,
          accountPlatform: "google",
          auctionRows: auction.rows,
          finalUrlRows: usage.finalUrlRows,
        }) ?? null,
      finalUrlPerformance: buildFinalUrlPerformanceSection(usage.finalUrlRows),
      warnings: [...auction.warnings, ...usage.warnings],
    });
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading auction insight.");
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
