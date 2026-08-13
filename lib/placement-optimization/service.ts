import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGoogleCampaignTypeOverview, fetchGooglePerformanceMaxOverview, fetchGooglePerformanceMaxPlacementRows, fetchGooglePlacementPerformanceRows } from "@/lib/reporting/google";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import { loadPlacementDashboard, persistPlacements } from "@/lib/placement-optimization/supabase-repository";
import type { PlacementDashboardPayload } from "@/lib/placement-optimization/types";
import { loadPlacementSummary, PlacementJobCancelledError, replacePlacementRowsInBatches, updatePlacementJob, upsertPlacementRun } from "@/lib/placement-optimization/relational-repository";

const DEFAULT_PROTOTYPE_ACCOUNT = "9858507935";

function placementInput(customerId:string,credentials:ReturnType<typeof getCredentials>,loginCustomerId:string|null|undefined,accessPath:string|null,startDate:string,endDate:string){return {customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken!,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId:loginCustomerId??null,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate,endDate};}

export async function getPlacementOptimizationSummary(input:{accountId?:string;startDate?:string;endDate?:string}):Promise<PlacementDashboardPayload>{
  const credentials=getCredentials(); if(!credentials.googleDeveloperToken)throw new Error("Google Ads developer token is unavailable.");
  const customerId=normalizeGoogleAccountId(input.accountId||process.env.GOOGLE_ADS_ACCOUNT_ID||DEFAULT_PROTOTYPE_ACCOUNT); const dateRange=buildDateRange(input.startDate??null,input.endDate??null);
  const routing=await resolveGoogleManagerIdsFromNotion({googleAccountIds:[customerId],notionAccessToken:credentials.notionAccessToken,notionDatabaseId:credentials.notionDatabaseId,fallbackLoginCustomerId:credentials.googleLoginCustomerId});
  const loginCustomerId=routing.loginCustomerIdByAccount[customerId]??credentials.googleLoginCustomerId; const accessPath=routing.accessPathByAccount[customerId]??null; const request=placementInput(customerId,credentials,loginCustomerId,accessPath,dateRange.startDate,dateRange.endDate);
  const [customerName,campaignTypeOverview]=await Promise.all([fetchGoogleAccountName(request),fetchGoogleCampaignTypeOverview(request)]);
  return loadPlacementSummary({customerId,customerName:customerName??`Google Ads ${customerId}`,startDate:dateRange.startDate,endDate:dateRange.endDate,campaignTypeOverview,warnings:routing.messages});
}

export async function runPlacementAnalysisJob(input:{jobId:string;accountId:string;startDate:string;endDate:string}){
  const credentials=getCredentials(); if(!credentials.googleDeveloperToken)throw new Error("Google Ads developer token is unavailable."); const customerId=normalizeGoogleAccountId(input.accountId);
  const routing=await resolveGoogleManagerIdsFromNotion({googleAccountIds:[customerId],notionAccessToken:credentials.notionAccessToken,notionDatabaseId:credentials.notionDatabaseId,fallbackLoginCustomerId:credentials.googleLoginCustomerId}); const loginCustomerId=routing.loginCustomerIdByAccount[customerId]??credentials.googleLoginCustomerId; const accessPath=routing.accessPathByAccount[customerId]??null; const request=placementInput(customerId,credentials,loginCustomerId,accessPath,input.startDate,input.endDate);
  try{await updatePlacementJob(input.jobId,{status:"running",stage:"Retrieving campaign types"}); const [customerName,campaignTypeOverview,standardRows,performanceMaxRows]=await Promise.all([fetchGoogleAccountName(request),fetchGoogleCampaignTypeOverview(request),fetchGooglePlacementPerformanceRows(request),fetchGooglePerformanceMaxPlacementRows(request)]); const rows=[...standardRows,...performanceMaxRows].filter((row,index,all)=>all.findIndex(candidate=>`${candidate.sourceView}:${candidate.resourceName}`===`${row.sourceView}:${row.resourceName}`)===index); const campaignTypes=campaignTypeOverview.map(item=>{const matching=rows.filter(row=>row.campaignType===item.channelType);return {channelType:item.channelType,label:item.channelType==="VIDEO"?"Video / YouTube":item.channelType==="PERFORMANCE_MAX"?"Performance Max":item.channelType==="DEMAND_GEN"||item.channelType==="DISCOVERY"?"Demand Gen":item.channelType.toLowerCase().split("_").map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(" "),campaignCount:item.campaignCount,placementCount:matching.length,impressions:matching.reduce((sum,row)=>sum+row.impressions,0),spend:matching.reduce((sum,row)=>sum+row.spend,0),available:matching.length>0};}); await updatePlacementJob(input.jobId,{stage:"Preparing placement batches",total_rows:rows.length}); const run=await upsertPlacementRun({jobId:input.jobId,customerId,customerName:customerName??`Google Ads ${customerId}`,startDate:input.startDate,endDate:input.endDate,analyzedAt:new Date().toISOString(),campaignTypes,rows}); await replacePlacementRowsInBatches(run.id,input.jobId,rows); await updatePlacementJob(input.jobId,{status:"completed",stage:"Placement analysis completed",processed_rows:rows.length,total_rows:rows.length,finished_at:new Date().toISOString()});}
  catch(error){if(error instanceof PlacementJobCancelledError){await updatePlacementJob(input.jobId,{status:"cancelled",stage:"Placement analysis cancelled",finished_at:new Date().toISOString()});return;} await updatePlacementJob(input.jobId,{status:"failed",stage:"Placement analysis failed",error:error instanceof Error?error.message:"Placement analysis failed.",finished_at:new Date().toISOString()});throw error;}
}

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
