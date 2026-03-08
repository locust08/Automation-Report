import { NextResponse } from "next/server";

import { parseRequestContext } from "@/lib/reporting/request";
import { getCampaignComparison } from "@/lib/reporting/service";

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
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while loading campaign comparison data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
