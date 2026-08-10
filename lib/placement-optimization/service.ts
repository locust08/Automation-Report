import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGooglePerformanceMaxOverview, fetchGooglePerformanceMaxPlacementRows } from "@/lib/reporting/google";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import type { PlacementDashboardPayload, PlacementOptimizationRow } from "@/lib/placement-optimization/types";

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
  const dashboardRows:PlacementOptimizationRow[]=rows.map((row,index)=>({
    id:row.resourceName || `${customerId}-${index}`,
    resourceName:row.resourceName,
    placement:row.placement,
    displayName:row.displayName,
    placementType:row.placementType,
    targetUrl:row.targetUrl,
    campaignName:row.campaignName,
    adGroupName:row.adGroupName,
    impressions:row.impressions,
    clicks:row.clicks,
    spend:row.spend,
    conversions:row.conversions,
    videoViews:row.videoViews,
    classification:"Not analyzed",
    recommendedAction:"keep",
    confidence:0,
    reason:"Placement optimization is currently a read-only Google Ads report.",
    confirmationRequired:false,
    aiStatus:"not_required",
    reviewStatus:"pending_optimizer",
    currentDecision:null,
    reviewHistory:[],
  }));
  const websiteRows=dashboardRows.filter((row)=>row.placementType==="WEBSITE").sort((left,right)=>right.impressions-left.impressions);
  return {
    account:{customerId,customerName,startDate:dateRange.startDate,endDate:dateRange.endDate,refreshedAt},
    summary:{total:dashboardRows.length,needsReview:dashboardRows.length,awaitingApproval:0,kept:0,kiv:0,approved:0,rejected:0},
    performanceMax:{
      available:dashboardRows.length>0,
      campaignCount:performanceMaxOverview.campaignCount,
      totalImpressions:dashboardRows.reduce((sum,row)=>sum+row.impressions,0),
      uniqueSites:new Set(websiteRows.map((row)=>row.placement)).size,
      topSites:websiteRows.slice(0,5).map(({id,displayName,placement,targetUrl,campaignName,impressions})=>({id,displayName,placement,targetUrl,campaignName,impressions})),
    },
    rows:dashboardRows,
    changeSets:[],
    reports:[],
    warnings:[...routing.messages,...(dashboardRows.length===0?["This account has no Performance Max placement impressions for the selected reporting period."]:[])],
  };
}
