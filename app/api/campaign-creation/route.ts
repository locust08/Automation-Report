import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getServerAuthSession} from '@/lib/auth/server-session';
import {AUTH_COOKIE_NAME} from '@/lib/auth/session';
import {forwardCampaignCommand} from '@/lib/campaign-creation/bridge-client';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:Request){
  const session=await getServerAuthSession();
  if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(session.role!=='admin')return NextResponse.json({error:'Campaign access is required.'},{status:403});
  if(request.headers.get('Origin')!==new URL(request.url).origin)return NextResponse.json({error:'Campaign access is required.'},{status:403});
  if(process.env.DASHBOARD_CAMPAIGN_BACKEND_ENABLED!=='true')return NextResponse.json({error:'Campaign backend unavailable.'},{status:503});
  try{
    const command=JSON.parse(await request.text());
    const sessionToken=(await cookies()).get(AUTH_COOKIE_NAME)?.value;
    if(!sessionToken)throw new Error('campaign_access_denied');
    const sessionDigest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sessionToken)));
    const result=await forwardCampaignCommand({...session,sessionBinding:Buffer.from(sessionDigest).toString('base64url')},command,{
      baseUrl:process.env.DASHBOARD_CAMPAIGN_DIGITALBEE_URL??'',
      secret:process.env.DASHBOARD_CAMPAIGN_BRIDGE_KEY??'',
      pilotUserId:process.env.DASHBOARD_CAMPAIGN_PILOT_USER_ID??'',
    });
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Campaign backend unavailable. Check access and connection.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
