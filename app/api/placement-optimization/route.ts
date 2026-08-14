import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getPlacementOptimizationSummary } from "@/lib/placement-optimization/service";
import { isGoogleAdsAccessPathError } from "@/lib/reporting/google";

export const dynamic="force-dynamic";export const runtime="nodejs";
const ROLES=new Set(["co","approver","pm","admin"]);
export async function GET(request:Request){const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});if(!ROLES.has(session.role))return NextResponse.json({error:"Your role cannot access placement optimization."},{status:403});const url=new URL(request.url);try{return NextResponse.json(await getPlacementOptimizationSummary({accountId:url.searchParams.get("accountId")??undefined,startDate:url.searchParams.get("startDate")??undefined,endDate:url.searchParams.get("endDate")??undefined}));}catch(error){if(isGoogleAdsAccessPathError(error))return NextResponse.json({code:"GOOGLE_ADS_ACCESS_PATH_INVALID",error:"This Google Ads account cannot be loaded because its saved manager account does not have access.",accountId:error.payload.accountId,managerId:error.payload.loginCustomerId},{status:error.httpStatus});return NextResponse.json({code:"PLACEMENT_LOAD_FAILED",error:"Unable to load placements right now. Please try again."},{status:502});}}
