import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { listOptimizationSchedules, saveOptimizationSchedules, type OptimizationSchedule } from "@/lib/optimization-scheduling/service";
import { getDailyCapacity } from "@/lib/search-term-optimization/durable-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session=await getServerAuthSession();
  if (!session || session.role!=="admin") return NextResponse.json({error:"Administrator access is required."},{status:403});
  try{
    const [schedules,capacity]=await Promise.all([listOptimizationSchedules(),getDailyCapacity()]);
    return NextResponse.json({schedules,capacity});
  }
  catch(error){const message=error instanceof Error?error.message:"Unable to load schedules.";return NextResponse.json({error:message.includes("PGRST205")?"Optimization Scheduling is ready, but its Supabase migration still needs to be applied.":message},{status:500});}
}

export async function PUT(request:Request) {
  const session=await getServerAuthSession();
  if (!session || session.role!=="admin") return NextResponse.json({error:"Administrator access is required."},{status:403});
  try {
    const body=await request.json() as {schedules?:OptimizationSchedule[]};
    return NextResponse.json({schedules:await saveOptimizationSchedules(body.schedules??[])});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to save schedules."},{status:400});
  }
}
