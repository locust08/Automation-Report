import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getPreviewReport } from "@/lib/reporting/service";
import { getImportedPreviewReport } from "@/lib/meta-import/reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);
  const diagnosticsMode = searchParams.get("diagnostics") === "1";
  const includeInactiveMeta = searchParams.get("includeInactiveMeta") === "1";

  try {
    if (context.source === "meta_csv") {
      return NextResponse.json(
        await getImportedPreviewReport({
          accountId: context.accountId,
          metaAccountId: context.metaAccountId,
          googleAccountId: null,
          tiktokAccountId: null,
          startDate: context.startDate,
          endDate: context.endDate,
        })
      );
    }
    const payload = await getPreviewReport({
      accountId: context.accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      tiktokAccountId: context.tiktokAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
      diagnosticsMode,
      metaIncludeInactivePreview: includeInactiveMeta,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while loading preview data.");
  }
}
