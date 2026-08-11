import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { getCredentials } from "@/lib/reporting/env";
import { searchNotionAdAccounts } from "@/lib/reporting/notion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ accounts: [] });
  }

  try {
    const credentials = getCredentials();
    const notionDatabaseId =
      process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || credentials.notionDatabaseId;
    const payload = await searchNotionAdAccounts({
      query,
      notionAccessToken: credentials.notionAccessToken,
      notionDatabaseId,
      limit: 10,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while searching Notion accounts.");
  }
}
