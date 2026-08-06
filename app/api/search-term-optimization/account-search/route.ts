import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getCredentials } from "@/lib/reporting/env";
import { fetchGoogleOptimizationOverview, type GoogleOptimizationOverview } from "@/lib/reporting/google";
import { searchNotionAdAccounts } from "@/lib/reporting/notion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new Map<string, { expiresAt: number; overview: GoogleOptimizationOverview }>();

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
    const accounts = [] as Array<Record<string, unknown>>;
    for (let offset = 0; offset < notion.accounts.length; offset += 2) {
      const chunk = notion.accounts.slice(offset, offset + 2);
      const enriched = await Promise.all(chunk.map(async (account) => {
        const customerId = account.adAccountId.replace(/\D/g, "");
        const cached = cache.get(customerId);
        let overview: GoogleOptimizationOverview;
        try {
          if (cached && cached.expiresAt > Date.now()) overview = cached.overview;
          else {
            overview = await fetchGoogleOptimizationOverview({
              customerId, apiVersion: credentials.googleAdsApiVersion, developerToken: credentials.googleDeveloperToken!,
              accessToken: credentials.googleAccessToken, refreshToken: credentials.googleRefreshToken,
              clientId: credentials.googleClientId, clientSecret: credentials.googleClientSecret,
              loginCustomerId: credentials.googleLoginCustomerId, accessPath: account.accessPath,
              fallbackLoginCustomerId: credentials.googleLoginCustomerId, startDate: "", endDate: "",
            });
            cache.set(customerId, { expiresAt: Date.now() + 15 * 60 * 1000, overview });
          }
          return { ...account, optimizationScore: overview.optimizationScore, campaigns: overview.campaigns };
        } catch (error) {
          return { ...account, optimizationScore: null, campaigns: [], warning: error instanceof Error ? error.message : "Google performance is unavailable." };
        }
      }));
      accounts.push(...enriched);
    }
    accounts.sort((left, right) => (Number(left.optimizationScore ?? Number.POSITIVE_INFINITY) - Number(right.optimizationScore ?? Number.POSITIVE_INFINITY)) || String(left.accountName).localeCompare(String(right.accountName)));
    return NextResponse.json({ accounts: accounts.slice(0, 20) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retrieve account priorities." }, { status: 500 });
  }
}
