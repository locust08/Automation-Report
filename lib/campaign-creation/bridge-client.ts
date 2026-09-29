import {SignJWT} from 'jose';
import {bridgeEnvelopeSchema} from './contracts';

export type DashboardCampaignSession={sub:string;email:string;role:string;sessionBinding:string};
export type BridgeConfig={baseUrl:string;secret:string;pilotUserId:string};

export async function forwardCampaignCommand(session:DashboardCampaignSession,command:unknown,config:BridgeConfig,
  fetcher:typeof fetch=fetch){
  if(session.role!=='admin'||session.sub!==config.pilotUserId||!session.email||
    !/^[A-Za-z0-9_-]{43}$/.test(session.sessionBinding)||config.secret.length<32)throw new Error('campaign_access_denied');
  const base=new URL(config.baseUrl);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('campaign_backend_unavailable');
  const url=new URL('/v1/internal/campaign-creation',base),body=JSON.stringify(command);
  if(!body||new TextEncoder().encode(body).length>32768)throw new Error('campaign_invalid_request');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));
  const requestHash=Buffer.from(bytes).toString('base64url');
  const proof=await new SignJWT({dashboard_user_id:session.sub,email:session.email,session_binding:session.sessionBinding,request_hash:requestHash})
    .setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('ads-reporting').setAudience(url.href)
    .setSubject(session.sub).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(config.secret));
  const response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${proof}`,'Content-Type':'application/json',Accept:'application/json'},
    body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error(response.status===403?'campaign_access_denied':'campaign_backend_unavailable');
  const text=await response.text();if(new TextEncoder().encode(text).length>262144)throw new Error('campaign_backend_unavailable');
  return bridgeEnvelopeSchema.parse(JSON.parse(text));
}
