import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const diagnosticsMode = searchParams.get("diagnostics") === "1";

  try {
    const payload = await getPreviewReport({
      accountId: context.accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
      diagnosticsMode,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading preview data.");
  }
}
