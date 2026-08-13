import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGoogleCampaignTypeOverview, fetchGooglePerformanceMaxOverview, fetchGooglePerformanceMaxPlacementRows, fetchGooglePlacementPerformanceRows } from "@/lib/reporting/google";
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
  if (!input.refresh) {
    const savedDashboard = await loadPlacementDashboard({
      customerId,
      customerName: `Google Ads ${customerId}`,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      refreshedAt,
      warnings: routing.messages,
    });
    if (savedDashboard.rows.length > 0) return savedDashboard;
  }
  const [resolvedCustomerName,performanceMaxOverview,campaignTypeOverview,standardRows,performanceMaxRows]=await Promise.all([
    fetchGoogleAccountName({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId}),
    fetchGooglePerformanceMaxOverview({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
    fetchGoogleCampaignTypeOverview({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
    fetchGooglePlacementPerformanceRows({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
    fetchGooglePerformanceMaxPlacementRows({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate}),
  ]);
  const rows=[...standardRows,...performanceMaxRows].filter((row,index,all)=>all.findIndex(candidate=>`${candidate.sourceView}:${candidate.resourceName}`===`${row.sourceView}:${row.resourceName}`)===index);
  const customerName=resolvedCustomerName ?? `Google Ads ${customerId}`;
  const persistenceWarnings: string[] = [];
  try {
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
  } catch (error) {
    persistenceWarnings.push(
      `The latest placement snapshot could not be saved, so the last successful saved results are shown. ${error instanceof Error ? error.message : "Supabase storage failed."}`,
    );
  }
  return await loadPlacementDashboard({
    customerId,
    customerName,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    refreshedAt,
    performanceMaxCampaignCount: performanceMaxOverview.campaignCount,
    campaignTypeOverview,
    warnings:[...routing.messages,...persistenceWarnings,...(rows.length===0?["This account has no placement impressions for the selected reporting period."]:[])],
  });
}
