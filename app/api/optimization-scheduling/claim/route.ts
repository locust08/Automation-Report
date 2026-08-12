import { NextResponse } from "next/server";
import { claimDueOptimizationSchedules } from "@/lib/optimization-scheduling/service";

export const dynamic="force-dynamic";
export const runtime="nodejs";

function authorized(request:Request){const expected=process.env.REPORT_AUTOMATION_SECRET||process.env.CRON_SECRET;return Boolean(expected)&&request.headers.get("authorization")===`Bearer ${expected}`;}
export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({runs:await claimDueOptimizationSchedules()});
}
