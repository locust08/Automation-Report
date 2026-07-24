import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { parseRequestContext } from "@/lib/reporting/request";
import { getCampaignComparison } from "@/lib/reporting/service";
import { getImportedCampaignComparison } from "@/lib/meta-import/reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);

  if (!context.campaignType) {
    return NextResponse.json(
      { error: "Missing `campaignType` query parameter." },
      { status: 400 }
    );
  }

  if (!context.platform) {
    return NextResponse.json(
      {
        error: "Missing or invalid `platform` query parameter. Use `meta`, `google`, or `googleYoutube`.",
      },
      { status: 400 }
    );
  }

  try {
    if (context.source === "meta_csv") {
      if (context.platform !== "meta") {
        return NextResponse.json({ error: "Imported CSV reporting currently supports Meta only." }, { status: 400 });
      }
      return NextResponse.json(
        await getImportedCampaignComparison({
          accountId: context.accountId,
          metaAccountId: context.metaAccountId,
          googleAccountId: null,
          startDate: context.startDate,
          endDate: context.endDate,
          campaignType: context.campaignType,
          platform: "meta",
        })
      );
    }
    const payload = await getCampaignComparison({
      accountId: context.accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
      campaignType: context.campaignType,
      platform: context.platform,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(
      error,
      "Unexpected error while loading campaign comparison data."
    );
  }
}
