import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getPlacementOptimizationSummary } from "@/lib/placement-optimization/service";

export const dynamic="force-dynamic";export const runtime="nodejs";
const ROLES=new Set(["co","approver","pm","admin"]);
export async function GET(request:Request){const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});if(!ROLES.has(session.role))return NextResponse.json({error:"Your role cannot access placement optimization."},{status:403});const url=new URL(request.url);try{return NextResponse.json(await getPlacementOptimizationSummary({accountId:url.searchParams.get("accountId")??undefined,startDate:url.searchParams.get("startDate")??undefined,endDate:url.searchParams.get("endDate")??undefined}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load placements."},{status:502});}}
