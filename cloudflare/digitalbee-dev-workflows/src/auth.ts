import {parseWorkflowRequest,type WorkflowRequest} from './protocol';

export interface AuthEnv {DB:D1Database;DEPLOYMENT_TIER?:string;WORKFLOW_SERVICE_TOKEN?:string;WORKFLOW_DELEGATION_KEY?:string}
type Claims={iss:string;aud:string;sub:string;iat:number;exp:number;jti:string;action:string;service_id:string;platform:string;provider_account_id:string;mapping_revision:string;request_hash:string;employee_revision:number};
const encoder=new TextEncoder();
const b64=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),char=>char.charCodeAt(0));
const equal=(left:string,right:string)=>{const a=encoder.encode(left),b=encoder.encode(right),length=Math.max(a.length,b.length);let diff=a.length^b.length;for(let i=0;i<length;i++)diff|=(a[i%a.length]??0)^(b[i%b.length]??0);return diff===0;};
export async function sha256(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function verifyJwt(token:string,key:string):Promise<Claims>{
  const parts=token.split('.');if(parts.length!==3)throw new Error('invalid delegation');const [header,payload,signature]=parts as [string,string,string];
  const parsedHeader=JSON.parse(new TextDecoder().decode(b64(header))) as Record<string,unknown>;if(parsedHeader.alg!=='HS256'||parsedHeader.typ!=='JWT')throw new Error('invalid delegation');
  const cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',cryptoKey,b64(signature),encoder.encode(`${header}.${payload}`)))throw new Error('invalid delegation');
  return JSON.parse(new TextDecoder().decode(b64(payload))) as Claims;
}
export async function authenticate(env:AuthEnv,bearer:string|undefined,input:unknown,now=Math.floor(Date.now()/1000)):Promise<WorkflowRequest>{
  if(env.DEPLOYMENT_TIER!=='dev'||!env.WORKFLOW_SERVICE_TOKEN||!env.WORKFLOW_DELEGATION_KEY||!bearer||!equal(bearer.replace(/^Bearer\s+/i,''),env.WORKFLOW_SERVICE_TOKEN))throw new Error('unauthorized');
  const request=parseWorkflowRequest(input),claims=await verifyJwt(request.delegation,env.WORKFLOW_DELEGATION_KEY);
  if(claims.iss!=='digitalbee-dev'||claims.aud!=='digitalbee-dev-workflows'||claims.sub!==request.subject||claims.iat>now+5||claims.exp<=now||claims.exp-claims.iat>30||!claims.jti||claims.action!==request.action||claims.service_id!==request.serviceId||claims.platform!==request.platform||claims.provider_account_id!==request.providerAccountId||claims.mapping_revision!==request.mappingRevision||claims.request_hash!==request.requestHash||claims.employee_revision!==request.employeeRevision)throw new Error('unauthorized');
  if(await sha256(JSON.stringify(request.payload))!==request.requestHash)throw new Error('unauthorized');
  try{await env.DB.prepare('INSERT INTO dev_delegation_replay(jti,subject_hash,expires_at,created_at) VALUES(?,?,?,?)').bind(claims.jti,await sha256(request.subject),claims.exp,now).run();}catch{throw new Error('replayed delegation');}
  return request;
}
