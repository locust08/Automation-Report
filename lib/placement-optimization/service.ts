import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGoogleCampaignTypeOverview } from "@/lib/reporting/google";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import type { PlacementDashboardPayload } from "@/lib/placement-optimization/types";
import { getPlacementCacheStatus } from "@/lib/placement-optimization/cache-client";

const DEFAULT_PROTOTYPE_ACCOUNT = "9858507935";

function placementInput(customerId:string,credentials:ReturnType<typeof getCredentials>,loginCustomerId:string|null|undefined,accessPath:string|null,startDate:string,endDate:string){return {customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken!,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId:loginCustomerId??null,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate,endDate};}

export async function getPlacementOptimizationSummary(input:{accountId?:string;startDate?:string;endDate?:string}):Promise<PlacementDashboardPayload>{
  const credentials=getCredentials(); if(!credentials.googleDeveloperToken)throw new Error("Google Ads developer token is unavailable.");
  const customerId=normalizeGoogleAccountId(input.accountId||process.env.GOOGLE_ADS_ACCOUNT_ID||DEFAULT_PROTOTYPE_ACCOUNT); const dateRange=buildDateRange(input.startDate??null,input.endDate??null);
  const routing=await resolveGoogleManagerIdsFromNotion({googleAccountIds:[customerId],notionAccessToken:credentials.notionAccessToken,notionDatabaseId:credentials.notionDatabaseId,fallbackLoginCustomerId:credentials.googleLoginCustomerId});
  const loginCustomerId=routing.loginCustomerIdByAccount[customerId]??credentials.googleLoginCustomerId; const accessPath=routing.accessPathByAccount[customerId]??null; const request=placementInput(customerId,credentials,loginCustomerId,accessPath,dateRange.startDate,dateRange.endDate);
  const [customerName,campaignTypeOverview]=await Promise.all([fetchGoogleAccountName(request),fetchGoogleCampaignTypeOverview(request)]);
  const resolvedName=customerName??`Google Ads ${customerId}`;
  const cache=await getPlacementCacheStatus({accountId:customerId,startDate:dateRange.startDate,endDate:dateRange.endDate}).catch(()=>null);
  const cachedTypes=new Map((cache?.summary?.campaignTypes??[]).map(item=>[item.channelType,item]));
  const campaignTypes=campaignTypeOverview.map(item=>cachedTypes.get(item.channelType)??({channelType:item.channelType,label:campaignTypeLabel(item.channelType),campaignCount:item.campaignCount,placementCount:0,impressions:0,spend:0,available:false}));
  for(const item of cachedTypes.values())if(!campaignTypes.some(candidate=>candidate.channelType===item.channelType))campaignTypes.push(item);
  const overview=cache?.summary;
  return {placementStorage:{status:"available"},placementCache:{status:cache?.status??"idle",stage:cache?.stage??null,generatedAt:cache?.updatedAt??null,expiresAt:cache?.expiresAt??null},account:{customerId,customerName:resolvedName,startDate:dateRange.startDate,endDate:dateRange.endDate,refreshedAt:cache?.updatedAt??new Date().toISOString()},summary:{total:overview?.placementCount??0,needsReview:overview?.placementCount??0,awaitingApproval:0,kept:0,kiv:0,approved:0,rejected:0},performanceMax:{available:campaignTypes.some(item=>item.channelType==="PERFORMANCE_MAX"&&item.available),campaignCount:campaignTypes.find(item=>item.channelType==="PERFORMANCE_MAX")?.campaignCount??0,totalImpressions:campaignTypes.find(item=>item.channelType==="PERFORMANCE_MAX")?.impressions??0,uniqueSites:overview?.uniqueSites??0,topSites:(overview?.topSites??[]).filter(item=>item.campaignType==="PERFORMANCE_MAX").map(item=>({id:item.id,displayName:item.displayName,placement:item.placement,targetUrl:item.targetUrl,campaignName:item.campaignName,impressions:item.impressions}))},campaignTypes,placementOverview:{campaignCount:campaignTypes.reduce((sum,item)=>sum+item.campaignCount,0),placementCount:overview?.placementCount??0,totalImpressions:overview?.totalImpressions??0,totalSpend:overview?.totalSpend??0,uniqueSites:overview?.uniqueSites??0,topSites:overview?.topSites??[]},rows:[],changeSets:[],reports:[],warnings:routing.messages};
}

function campaignTypeLabel(value:string){if(value==="VIDEO")return"Video / YouTube";if(value==="PERFORMANCE_MAX")return"Performance Max";if(value==="DEMAND_GEN"||value==="DISCOVERY")return"Demand Gen";return value.toLowerCase().split("_").map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");}
