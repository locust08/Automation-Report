import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGooglePlacementPerformanceRows, type GooglePlacementPerformanceRow } from "@/lib/reporting/google";
import { resolveGoogleManagerIdsFromNotion } from "@/lib/reporting/notion";
import { loadPlacementDashboard, persistPlacements } from "@/lib/placement-optimization/sqlite-repository";
import type { PlacementDashboardPayload, PlacementDecision } from "@/lib/placement-optimization/types";

const DEFAULT_PROTOTYPE_ACCOUNT = "9858507935";
type Analysis = { classification:string;recommendedAction:PlacementDecision;confidence:number;reason:string;confirmationRequired:boolean;aiStatus:"generated"|"rules_fallback"|"not_required" };

export async function getPlacementOptimizationDashboard(input:{accountId?:string;startDate?:string;endDate?:string;refresh?:boolean}):Promise<PlacementDashboardPayload>{
  const credentials=getCredentials();
  if(!credentials.googleDeveloperToken)throw new Error("Google Ads developer token is unavailable.");
  const customerId=normalizeGoogleAccountId(input.accountId || process.env.GOOGLE_ADS_ACCOUNT_ID || DEFAULT_PROTOTYPE_ACCOUNT);
  const dateRange=buildDateRange(input.startDate ?? null,input.endDate ?? null);
  const routing=await resolveGoogleManagerIdsFromNotion({googleAccountIds:[customerId],notionAccessToken:credentials.notionAccessToken,notionDatabaseId:credentials.notionDatabaseId,fallbackLoginCustomerId:credentials.googleLoginCustomerId});
  const loginCustomerId=routing.loginCustomerIdByAccount[customerId] ?? credentials.googleLoginCustomerId;
  const accessPath=routing.accessPathByAccount[customerId] ?? null;
  const customerName=await fetchGoogleAccountName({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId}) ?? `Google Ads ${customerId}`;
  const refreshedAt=new Date().toISOString();
  try{
    const rows=await fetchGooglePlacementPerformanceRows({customerId,apiVersion:credentials.googleAdsApiVersion,developerToken:credentials.googleDeveloperToken,accessToken:credentials.googleAccessToken,refreshToken:credentials.googleRefreshToken,clientId:credentials.googleClientId,clientSecret:credentials.googleClientSecret,loginCustomerId,accessPath,fallbackLoginCustomerId:credentials.googleLoginCustomerId,startDate:dateRange.startDate,endDate:dateRange.endDate});
    const analyses=await analyzePlacements(rows,customerName);
    persistPlacements({customerId,customerName,startDate:dateRange.startDate,endDate:dateRange.endDate,refreshedAt,rows:rows.map((row,index)=>({...row,analysis:analyses[index]}))});
    return loadPlacementDashboard({customerId,customerName,startDate:dateRange.startDate,endDate:dateRange.endDate,refreshedAt,warnings:[...routing.messages,...(rows.length===0?["Google Ads returned no non-Search placement rows for the selected reporting period."]:[])]});
  }catch(error){
    const cached=loadPlacementDashboard({customerId,customerName,startDate:dateRange.startDate,endDate:dateRange.endDate,refreshedAt,warnings:[...routing.messages,`Live refresh failed; showing cached placement data. ${error instanceof Error?error.message:"Unknown error"}`]});
    if(cached.rows.length>0)return cached; throw error;
  }
}

function ruleAnalysis(row:GooglePlacementPerformanceRow):Analysis{
  const text=`${row.displayName} ${row.placement} ${row.targetUrl ?? ""}`.toLowerCase();
  if(row.placement.toLowerCase()==="other")return{classification:"Aggregated placement",recommendedAction:"keep",confidence:100,reason:"Google aggregated low-traffic placements into Other; an individual exclusion cannot be created.",confirmationRequired:false,aiStatus:"not_required"};
  if(row.placementType==="UNKNOWN"||row.placementType==="UNSPECIFIED")return{classification:"Unknown placement",recommendedAction:"kiv",confidence:80,reason:"Google did not provide a supported placement type.",confirmationRequired:true,aiStatus:"rules_fallback"};
  if(/(^|\W)(kids?|games?|gaming|torrent|casino|bet|adult|free download|apk)(\W|$)/i.test(text)&&row.conversions===0)return{classification:"Potentially low-quality content",recommendedAction:"exclude",confidence:88,reason:"The placement name matches a configured risk signal and has no conversions.",confirmationRequired:false,aiStatus:"rules_fallback"};
  if((row.spend>0||row.clicks>=2)&&row.conversions===0)return{classification:"Spend without conversions",recommendedAction:"kiv",confidence:65,reason:"The placement consumed spend or clicks without a conversion and needs contextual review.",confirmationRequired:true,aiStatus:"rules_fallback"};
  return{classification:"No clear risk",recommendedAction:"keep",confidence:75,reason:"No deterministic risk signal was found.",confirmationRequired:false,aiStatus:"not_required"};
}

async function analyzePlacements(rows:GooglePlacementPerformanceRow[],customerName:string):Promise<Analysis[]>{
  const base=rows.map(ruleAnalysis);const apiKey=process.env.OPENAI_API_KEY?.trim();if(!apiKey)return base;
  const candidateIndexes=base.map((item,index)=>({item,index})).filter(({item})=>item.recommendedAction!=="keep").slice(0,50).map(({index})=>index);if(candidateIndexes.length===0)return base;
  try{
    const candidates=candidateIndexes.map(index=>({index,name:rows[index].displayName,placement:rows[index].placement,type:rows[index].placementType,url:rows[index].targetUrl,spend:rows[index].spend,clicks:rows[index].clicks,conversions:rows[index].conversions,rule:base[index]}));
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_PLACEMENT_MODEL?.trim()||"gpt-5-mini",input:`Classify Google Ads placements for ${customerName}. Return JSON only as {\"results\":[{\"index\":number,\"classification\":string,\"recommendedAction\":\"exclude\"|\"keep\"|\"kiv\",\"confidence\":0-100,\"reason\":string,\"confirmationRequired\":boolean}]}. Be conservative; unclear cases must be KIV. Placements: ${JSON.stringify(candidates)}`}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`OpenAI returned ${response.status}`);const payload=await response.json() as {output_text?:string;output?:Array<{content?:Array<{type?:string;text?:string}>}>};const text=payload.output_text??payload.output?.flatMap(item=>item.content??[]).find(item=>item.type==="output_text")?.text;if(!text)throw new Error("OpenAI returned no output.");
    const parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,"")) as {results?:Array<{index:number;classification:string;recommendedAction:PlacementDecision;confidence:number;reason:string;confirmationRequired:boolean}>};
    for(const item of parsed.results??[]){if(!candidateIndexes.includes(item.index)||!["exclude","keep","kiv"].includes(item.recommendedAction))continue;base[item.index]={classification:item.classification,recommendedAction:item.recommendedAction,confidence:Math.max(0,Math.min(100,Math.round(item.confidence))),reason:item.reason,confirmationRequired:Boolean(item.confirmationRequired),aiStatus:"generated"};}
  }catch{/* deterministic fallback remains visible through aiStatus */}
  return base;
}
