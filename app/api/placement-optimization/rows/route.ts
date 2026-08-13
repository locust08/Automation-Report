import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildDateRange } from "@/lib/reporting/date";
import { loadPlacementRowsPage } from "@/lib/placement-optimization/relational-repository";

export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:Request){const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const url=new URL(request.url);const accountId=(url.searchParams.get("accountId")??"").replace(/\D/g,"");if(accountId.length!==10)return NextResponse.json({error:"A valid account is required."},{status:400});const range=buildDateRange(url.searchParams.get("startDate"),url.searchParams.get("endDate"));try{return NextResponse.json(await loadPlacementRowsPage({customerId:accountId,startDate:range.startDate,endDate:range.endDate,page:Math.max(1,Number(url.searchParams.get("page")??1)),pageSize:Math.min(100,Math.max(1,Number(url.searchParams.get("pageSize")??20))),campaignType:url.searchParams.get("campaignType")??undefined,placementType:url.searchParams.get("placementType")??undefined,reviewStatus:url.searchParams.get("reviewStatus")??undefined}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load placement rows."},{status:500});}}
