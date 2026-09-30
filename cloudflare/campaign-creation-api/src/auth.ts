import {jwtVerify} from 'jose';
import {boundedJson, digest, scopeSchema, type Scope} from './contracts';

export interface AuthEnvironment {
  M04_ENABLED: string;
  M04_CONNECTION_REVISION: string;
  M04_PILOT_ACCOUNT: string;
  M04_PILOT_SERVICE: string;
  M04_PILOT_SUBJECT: string;
  M04_META_CREATION_ENABLED?:string;
  M04_META_PILOT_ACCOUNT?:string;
  M04_META_PILOT_SERVICE?:string;
  M04_TIKTOK_CREATION_ENABLED?:string;
  M04_TIKTOK_PILOT_ACCOUNT?:string;
  M04_TIKTOK_PILOT_SERVICE?:string;
  M04_SERVICE_TOKEN: string;
  M04_DELEGATION_KEY: string;
  DIGITALBEE_GRANT_VERIFY_URL: string;
  DIGITALBEE_GRANT_VERIFY_TOKEN: string;
  DIGITALBEE_AUTHORITY?: Fetcher;
}
export async function authenticate(request: Request, env: AuthEnvironment, tool: string, input: unknown, requestHash: string) {
  if (env.M04_ENABLED !== 'true' || !env.M04_SERVICE_TOKEN || env.M04_SERVICE_TOKEN.length < 32 || env.M04_DELEGATION_KEY?.length < 32)
    throw new Error('access_denied');
  const actual = new TextEncoder().encode(request.headers.get('Authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${env.M04_SERVICE_TOKEN}`);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= (actual[index] ?? 0) ^ expected[index];
  if (difference !== 0) throw new Error('access_denied');
  const {payload} = await jwtVerify(request.headers.get('X-DigitalBee-Delegation') ?? '', new TextEncoder().encode(env.M04_DELEGATION_KEY), {
    algorithms: ['HS256'], issuer: 'digitalbee', audience: new URL(request.url).origin, maxTokenAge: '30s',
    requiredClaims: ['exp', 'iat', 'sub', 'jti'],
  });
  // Preserve the signed scope's serialization order used by m18-m04-v1 request hashes.
  const rawScope=Object.fromEntries(Object.entries(payload).filter(([key])=>key in scopeSchema.shape));
  scopeSchema.parse(rawScope);
  const scope=rawScope as Scope;
  if (payload.sub !== scope.subject || payload.action !== tool || payload.requestHash !== requestHash ||
    requestHash !== await digest({tool, scope, input}) || scope.connectionRevision !== env.M04_CONNECTION_REVISION ||
    request.headers.get('X-Connection-Revision') !== scope.connectionRevision)
    throw new Error('access_denied');
  return scope;
}
/** DigitalBee is the current permission authority, checked at every stage and again before dispatch. */
export async function authorize(env: AuthEnvironment, scope: Scope, tool: string, fetcher?: typeof fetch) {
  if(scope.platform==='Meta'&&['campaign_gate1_create','campaign_action_prepare_gate1'].includes(tool)&&env.M04_META_CREATION_ENABLED!=='true')throw new Error('provider_creation_disabled');
  if(scope.platform==='TikTok'&&['campaign_gate1_create','campaign_action_prepare_gate1'].includes(tool)&&
    (env.M04_TIKTOK_CREATION_ENABLED!=='true'||env.M04_TIKTOK_PILOT_ACCOUNT!=='7647057541075271700'||
    env.M04_TIKTOK_PILOT_SERVICE!=='3e44fcc4-f701-8034-b219-c996dbdedbe6'||scope.platformAccountId!==env.M04_TIKTOK_PILOT_ACCOUNT||
    scope.accountPageId!==env.M04_TIKTOK_PILOT_SERVICE||!env.M04_PILOT_SUBJECT||scope.subject!==env.M04_PILOT_SUBJECT))throw new Error('provider_creation_disabled');
  const url = new URL(env.DIGITALBEE_GRANT_VERIFY_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    url.pathname !== '/v1/internal/grants/verify' || env.DIGITALBEE_GRANT_VERIFY_TOKEN?.length < 32)
    throw new Error('access_denied');
  const input = {...scope, action: `m04:${tool}`};
  const authorityFetch:typeof fetch=fetcher??(env.DIGITALBEE_AUTHORITY?(input,init)=>env.DIGITALBEE_AUTHORITY!.fetch(input,init):fetch);
  let response:Response;
  try{
    response = await authorityFetch(url, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: {Authorization: `Bearer ${env.DIGITALBEE_GRANT_VERIFY_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify(input)});
  }catch(error){
    console.warn(JSON.stringify({event:'m04_backend_failure',tool,category:'grant_transport'}));throw error;
  }
  if(!response.ok){await response.body?.cancel();throw new Error('access_denied');}
  const decision = await boundedJson(response, 8192);
  if (!response.ok || decision.allowed !== true || Object.entries(input).some(([key, value]) => decision[key] !== value))
    throw new Error('access_denied');
}

