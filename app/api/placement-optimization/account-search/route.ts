import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getCredentials } from "@/lib/reporting/env";
import { fetchGooglePerformanceMaxOverview, type GooglePerformanceMaxOverview } from "@/lib/reporting/google";
import { searchNotionAdAccounts } from "@/lib/reporting/notion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new Map<string, { expiresAt: number; overview: GooglePerformanceMaxOverview }>();

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ accounts: [] });
  try {
    const credentials = getCredentials();
    if (!credentials.googleDeveloperToken) throw new Error("Google Ads developer token is unavailable.");
    const notionDatabaseId = process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || credentials.notionDatabaseId;
    const notion = await searchNotionAdAccounts({ query, notionAccessToken: credentials.notionAccessToken, notionDatabaseId, limit: 20 });
    const googleAccounts = notion.accounts.filter((account) => /^\d{10}$/.test(account.adAccountId.replace(/\D/g, "")));
    const accounts: Array<Record<string, unknown>> = [];
    for (const account of googleAccounts) {
      const customerId = account.adAccountId.replace(/\D/g, "");
      const cached = cache.get(customerId);
      try {
        const overview = cached && cached.expiresAt > Date.now()
          ? cached.overview
          : await fetchGooglePerformanceMaxOverview({
              customerId,
              apiVersion: credentials.googleAdsApiVersion,
              developerToken: credentials.googleDeveloperToken,
              accessToken: credentials.googleAccessToken,
              refreshToken: credentials.googleRefreshToken,
              clientId: credentials.googleClientId,
              clientSecret: credentials.googleClientSecret,
              loginCustomerId: credentials.googleLoginCustomerId,
              accessPath: account.accessPath,
              fallbackLoginCustomerId: credentials.googleLoginCustomerId,
              startDate: "",
              endDate: "",
            });
        cache.set(customerId, { expiresAt: Date.now() + 15 * 60 * 1000, overview });
        accounts.push({ ...account, ...overview });
      } catch (error) {
        accounts.push({ ...account, hasPerformanceMax: false, campaignCount: 0, campaigns: [], warning: error instanceof Error ? error.message : "Performance Max availability is unavailable." });
      }
    }
    accounts.sort((left, right) => Number(Boolean(right.hasPerformanceMax)) - Number(Boolean(left.hasPerformanceMax)) || String(left.accountName).localeCompare(String(right.accountName)));
    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check Performance Max accounts." }, { status: 500 });
  }
}
