import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGooglePerformanceMaxOverview, fetchGooglePerformanceMaxPlacementRows } from "@/lib/reporting/google";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import { loadPlacementDashboard, persistPlacements } from "@/lib/placement-optimization/supabase-repository";
import type { PlacementDashboardPayload } from "@/lib/placement-optimization/types";

const DEFAULT_PROTOTYPE_ACCOUNT = "9858507935";

export async function getPlacementOptimizationDashboard(input:{accountId?:string;startDate?:string;endDate?:string;refresh?:boolean}):Promise<PlacementDashboardPayload>{
  const credentials=getCredentials();
  if(!credentials.googleDeveloperToken)throw new Error("Google Ads developer token is unavailable.");
  const customerId=normalizeGoogleAccountId(input.accountId || process.env.GOOGLE_ADS_ACCOUNT_ID || DEFAULT_PROTOTYPE_ACCOUNT);
  const dateRange=buildDateRange(input.startDate ?? null,input.endDate ?? null);
  const routing=await resolveGoogleManagerIdsFromNotion({googleAccountIds:[customerId],notionAccessToken:credentials.notionAccessToken,notionDatabaseId:credentials.notionDatabaseId,fallbackLoginCustomerId:credentials.googleLoginCustomerId});
  const loginCustomerId=routing.loginCustomerIdByAccount[customerId] ?? credentials.googleLoginCustomerId;
  const accessPath=routing.accessPathByAccount[customerId] ?? null;
  const refreshedAt=new Date().toISOString();
  const [resolvedCustomerName,performanceMaxOverview,rows]=await Promise.all([
    fetchGoogleAccountName({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId}),
    fetchGooglePerformanceMaxOverview({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
    fetchGooglePerformanceMaxPlacementRows({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
  ]);
  const customerName=resolvedCustomerName ?? `Google Ads ${customerId}`;
  await persistPlacements({
    customerId,
    customerName,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    refreshedAt,
    rows: rows.map((row) => ({
      ...row,
      analysis: {
        classification: "Awaiting review",
        recommendedAction: "keep" as const,
        confidence: 0,
        reason: "Internal placement history only. No Google Ads change has been applied.",
        confirmationRequired: false,
        aiStatus: "not_required" as const,
      },
    })),
  });
  return await loadPlacementDashboard({
    customerId,
    customerName,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    refreshedAt,
    performanceMaxCampaignCount: performanceMaxOverview.campaignCount,
    warnings:[...routing.messages,...(rows.length===0?["This account has no Performance Max placement impressions for the selected reporting period."]:[])],
  });
}
