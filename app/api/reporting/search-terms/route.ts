import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import {
  loadSearchTermDashboard,
  runSearchTermAnalysis,
} from "@/lib/search-term-optimization/workflow";

export const dynamic = "force-dynamic";

function getInput(request: Request) {
  const context = parseRequestContext(new URL(request.url).searchParams);
  const accountId = context.googleAccountId ?? context.accountId;
  if (!accountId) throw new Error("A Google Ads customer ID is required.");
  return { accountId, startDate: context.startDate, endDate: context.endDate };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadSearchTermDashboard(getInput(request)));
  } catch (error) {
    return buildReportingErrorResponse(error, "Unable to load search-term optimization results.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json(await runSearchTermAnalysis(getInput(request)));
  } catch (error) {
    return buildReportingErrorResponse(error, "Unable to run search-term analysis.");
  }
}
