import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getDailyCapacity } from "@/lib/search-term-optimization/durable-analysis";

export const dynamic="force-dynamic";
export async function GET(){const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await getDailyCapacity());}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load daily analysis capacity."},{status:503});}}
