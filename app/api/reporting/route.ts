import { NextResponse } from "next/server";

import { parseRequestContext } from "@/lib/reporting/request";
import { getOverallReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const context = parseRequestContext(searchParams);

  try {
    const payload = await getOverallReport({
      accountId: context.accountId,
      metaAccountId: context.metaAccountId,
      googleAccountId: context.googleAccountId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while loading overall report data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
