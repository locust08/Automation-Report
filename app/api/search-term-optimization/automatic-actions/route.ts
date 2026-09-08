import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getAutomaticActionHistory } from "@/lib/search-term-optimization/automatic-actions";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function GET(request:Request) {
  const session=await getServerAuthSession();
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const params=new URL(request.url).searchParams;
  const accountId=(params.get("accountId")??"").replace(/\D/g,"");
  const page=Math.max(1,Number.parseInt(params.get("page")??"1",10)||1);
  if(accountId.length!==10)return NextResponse.json({error:"A valid Google Ads account is required."},{status:400});
  try{return NextResponse.json(await getAutomaticActionHistory(accountId,page,10));}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load automatic action history."},{status:503});}
}
