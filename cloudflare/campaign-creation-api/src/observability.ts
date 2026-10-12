import {AsyncLocalStorage} from 'node:async_hooks';
import {PostHog} from 'posthog-node/edge';
import type {EventMessage} from 'posthog-node';
import {MONITOR_OBJECT,type ErrorMonitorBinding} from './error-monitoring/protocol';

// Mirrored in the separately deployed M04 package. Keep the privacy policy identical.
export interface ObservabilityEnv {
  POSTHOG_PROJECT_TOKEN?:string; POSTHOG_HOST?:string; POSTHOG_ENVIRONMENT?:string; POSTHOG_RELEASE?:string;
  CF_VERSION_METADATA?:{id:string};
  ERROR_MONITOR?:ErrorMonitorBinding; ERROR_MONITORING_ENABLED?:string;
}
export type Service='digitalbee-mcp'|'m04'|'digitalbee-gateway';
export type Operation='http.fetch'|'mcp.operation'|'oauth.exchange'|'scheduled.run'|'scheduled.bug_health'|'scheduled.snapshot_cleanup'|'telemetry.write'|'discovery.read'|'performance.read'|'inspection.read'|'diagnostics.read'|'budget.read'|'campaign.operation'|'campaign.audit'|'campaign.validate'|'campaign.queue_publish'|'campaign.preflight'|'campaign.dispatch_record'|'campaign.create'|'campaign.readback'|'queue.process'|'live_change.operation'|'diagnostic.synthetic'|'rpc.authority'|'rpc.read'|'gateway.forward'|'changes.adapter'|'budget.connector';
const operations=new Set<Operation>(['http.fetch','mcp.operation','oauth.exchange','scheduled.run','scheduled.bug_health','scheduled.snapshot_cleanup','telemetry.write','discovery.read','performance.read','inspection.read','diagnostics.read','budget.read','campaign.operation','campaign.audit','campaign.validate','campaign.queue_publish','campaign.preflight','campaign.dispatch_record','campaign.create','campaign.readback','queue.process','live_change.operation','diagnostic.synthetic','rpc.authority','rpc.read','gateway.forward','changes.adapter','budget.connector']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const expectedOutcome=Symbol('expected-outcome');
export function markExpected(error:unknown):void {
  try{if(error instanceof Error)Object.defineProperty(error,expectedOutcome,{value:true});}catch{}
}
const expectedCodes=new Set(['access_denied','provider_denied','invalid_request','invalid_input','missing_input','response_limit','conflict','stale_revision','idempotency_conflict','export_request_conflict','export_in_progress','export_request_expired','export_request_failed','stale_cursor','expired','output_limit','page_limit','capability_unavailable','unsupported_capability','unsupported_platform','unsupported_period','invalid_period','connection_required','unconfigured','acceptance_scope_required','settings_changed','mapping_changed','source_changed','invalid_mapping','missing_campaign_role','missing_write_grant','provider_creation_disabled','write_consent_required','connection_unavailable']);
export function expectedError(error:unknown):boolean {
  if(!(error instanceof Error))return false;
  if(expectedOutcome in error)return true;
  const typed=error as Error & {code?:unknown;outcome?:unknown;status?:unknown};
  const kind=error.constructor.name;
  if(['Denied','CampaignDenied','OperationControlError','OperationDispatchResponse','ZodError','JWTExpired','JWTClaimValidationFailed','JWSSignatureVerificationFailed','JWSInvalid','JWTInvalid','JOSEAlgNotAllowed'].includes(kind))return true;
  if(kind==='GatewayError'&&typeof typed.outcome==='string'&&['capability_unavailable','insufficient_scope','schema_revision_mismatch','stale_cursor','wrong_execution_category'].includes(typed.outcome))return true;
  if(['RepositoryError','CampaignRoleError'].includes(kind)&&typeof typed.status==='number'&&typed.status>=400&&typed.status<500)return true;
  if(kind==='ProviderError'&&typed.outcome==='rejected')return true;
  return expectedCodes.has(typeof typed.code==='string'?typed.code:error.message);
}
function category(error:unknown):string {
  if(error instanceof Error&&['TypeError','RangeError','SyntaxError','TimeoutError','AbortError'].includes(error.name))return error.name;
  return 'unexpected_error';
}
type References={correlationId?:unknown;receiptId?:unknown};
function references(value:References):Record<string,string>{
  const tags:Record<string,string>={};
  if(typeof value.correlationId==='string'&&uuid.test(value.correlationId))tags.correlation_id=value.correlationId;
  if(typeof value.receiptId==='string'&&uuid.test(value.receiptId))tags.receipt_id=value.receiptId;
  return tags;
}

type Invocation={client:PostHog;seen:WeakSet<object>};
const invocation=new AsyncLocalStorage<Invocation>();
/** Never give the SDK original messages, causes or custom properties. Bundle paths stay internal for chunk lookup; filterEvent removes them before transmission. */
function safeError(error:unknown,operation:Operation):Error {
  const safe=new Error(`Unexpected failure in ${operation}`);safe.name=category(error);safe.stack=`${safe.name}: ${safe.message}`;
  if(error instanceof Error&&typeof error.stack==='string'){
    const frames=error.stack.split('\n').flatMap(line=>{
      const match=line.match(/(?:^|[\s(])((?:[^\s()]*[\/\\])?(?:index|worker)\.js):(\d+):(\d+)\)?$/);
      return match?[`    at ${match[1]}:${match[2]}:${match[3]}`]:[];
    }).slice(-40);
    safe.stack+='\n'+frames.join('\n');
  }
  return safe;
}
export function captureUnexpected(error:unknown,operation:Operation,refs:References={}):string|undefined {
  try {
    const state=invocation.getStore();if(!state||expectedError(error))return;
    if(error!==null&&(typeof error==='object'||typeof error==='function')){if(state.seen.has(error))return;state.seen.add(error);}
    const op=operations.has(operation)?operation:'http.fetch',id=crypto.randomUUID();
    state.client.captureException(safeError(error,op),undefined,{operation:op,error_category:category(error),...references(refs)},id);
    return id;
  }catch{return;/* Monitoring cannot affect business behavior. */}
}
export function releaseFor(env:ObservabilityEnv,service:Service):string|undefined {
  const explicit=env.POSTHOG_RELEASE;
  if(explicit&&new RegExp(`^${service}@(?:[a-f0-9]{7,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$`).test(explicit))return explicit;
  const id=env.CF_VERSION_METADATA?.id;
  return id&&uuid.test(id)?`${service}@${id}`:undefined;
}

export function posthogConfiguration(env:ObservabilityEnv,service:Service){
  const release=releaseFor(env,service),environment=env.POSTHOG_ENVIRONMENT??'local';
  const host=env.POSTHOG_HOST,token=env.POSTHOG_PROJECT_TOKEN;
  const enabled=env.ERROR_MONITORING_ENABLED==='true'&&!!env.ERROR_MONITOR&&!!token&&/^phc_[A-Za-z0-9_-]+$/.test(token)&&host==='https://us.i.posthog.com'&&!!release&&['production','staging','development','local'].includes(environment);
  return {enabled,release,environment,host,token};
}
/** Rebuild, don't recursively redact: new SDK fields are excluded by default. */
export function filterEvent(event:EventMessage,service:Service,environment:string,release:string):EventMessage|null {
  try {
    if(event.event!=='$exception')return null;
    const properties=event.properties??{},rawOperation=properties.operation;
    const operation=typeof rawOperation==='string'&&operations.has(rawOperation as Operation)?rawOperation:'http.fetch';
    const errorCategory=['TypeError','RangeError','SyntaxError','TimeoutError','AbortError'].includes(properties.error_category)?properties.error_category:'unexpected_error';
    const raw=Array.isArray(properties.$exception_list)?properties.$exception_list.slice(0,1):[];
    const frames=raw.flatMap(exception=>Array.isArray(exception?.stacktrace?.frames)?exception.stacktrace.frames:[]).filter(frame=>typeof frame?.filename==='string'&&/(?:^|[\/\\])(?:index|worker)\.js$/.test(frame.filename)).slice(-40).map(frame=>({
      platform:'node:javascript',filename:frame.filename.replace(/^.*[\/\\]/,''),lineno:Number.isInteger(frame.lineno)?frame.lineno:undefined,colno:Number.isInteger(frame.colno)?frame.colno:undefined,in_app:true,
      ...(typeof frame.chunk_id==='string'&&uuid.test(frame.chunk_id)?{chunk_id:frame.chunk_id}:{})
    }));
    return {
      event:'$exception',distinctId:`worker:${service}`,uuid:typeof event.uuid==='string'&&uuid.test(event.uuid)?event.uuid:undefined,disableGeoip:true,
      properties:{service,environment,release,operation,error_category:errorCategory,...references({correlationId:properties.correlation_id,receiptId:properties.receipt_id}),
        $process_person_profile:false,$exception_level:'error',$exception_fingerprint:`${service}:${operation}:${errorCategory}`,
        $exception_list:[{type:errorCategory,value:`Unexpected failure in ${operation}`,mechanism:{type:'generic',handled:raw[0]?.mechanism?.handled!==false},stacktrace:{type:'raw',frames}}],
        ...(typeof properties.$release_id==='string'&&uuid.test(properties.$release_id)?{$release_id:properties.$release_id}:{})
      }
    };
  }catch{return null;}
}
/** An invocation owns its client/context. Business handlers always execute exactly once. */
export function observeWorker<E extends ObservabilityEnv,H extends object>(service:Service,handler:H):H {
  const output={...handler};
  for(const name of ['fetch','queue','scheduled'] as const){
    const original=(handler as Record<string,unknown>)[name];if(typeof original!=='function')continue;
    Object.assign(output,{[name]:async function(...args:unknown[]){
      const config=posthogConfiguration(args[1] as E,service);
      if(!config.enabled)return Reflect.apply(original,this,args);
      let client:PostHog;
      try{client=new PostHog(config.token!,{host:config.host,flushAt:1,flushInterval:0,fetchRetryCount:0,requestTimeout:5000,disableGeoip:true,disableSurveys:true,enableExceptionAutocapture:false,fetch:async(url,options)=>{
        if(url!==config.host+'/batch/'||options.method!=='POST')throw new Error('Unexpected monitoring transport');
        let stream=new Response(options.body as BodyInit).body!;if(new Headers(options.headers).get('content-encoding')==='gzip')stream=stream.pipeThrough(new DecompressionStream('gzip'));
        const raw=await new Response(stream).text();if(raw.length>262144)throw new Error('Monitoring batch too large');const batch=JSON.parse(raw);
        if(!Array.isArray(batch.batch)||batch.batch.length>100)throw new Error('Invalid monitoring batch');
        for(const event of batch.batch){const result=await (args[1] as E).ERROR_MONITOR!.getByName(MONITOR_OBJECT).fetch('https://error-monitor.internal/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});if(!result.ok)throw new Error('Monitoring coordinator unavailable');}
        return new Response('{}',{status:200});
      },before_send:event=>event?filterEvent(event,service,config.environment,config.release!):null});}catch{return Reflect.apply(original,this,args);}
      const ctx=args[2] as ExecutionContext|undefined,receiver=this,pending:Promise<unknown>[]=[],handlerArgs=[...args];
      if(ctx?.waitUntil){handlerArgs[2]=new Proxy(ctx,{get(target,key){
        if(key==='waitUntil')return (promise:Promise<unknown>)=>{pending.push(Promise.resolve(promise).catch(error=>{captureUnexpected(error,name==='queue'?'queue.process':name==='scheduled'?'scheduled.run':'http.fetch');}));target.waitUntil(promise);};
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }});}
      return invocation.run({client,seen:new WeakSet()},async()=>{
        try{return await Reflect.apply(original,receiver,handlerArgs);}
        catch(error){captureUnexpected(error,name==='queue'?'queue.process':name==='scheduled'?'scheduled.run':'http.fetch');throw error;}
        finally{
          try{const flush=(async()=>{let offset=0;while(offset<pending.length){const batch=pending.slice(offset);offset=pending.length;await Promise.allSettled(batch);}await client.shutdown(5000);})().catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(flush);}catch{/* Best effort; never replace the original result/error. */}
        }
      });
    }});
  }
  return output;
}

/** RPC methods use the same invocation-local lifecycle as event handlers. */
export async function observeRpc<T>(env:ObservabilityEnv,ctx:ExecutionContext,operation:Operation,run:()=>Promise<T>|T):Promise<T>{
 const wrapped=observeWorker('digitalbee-mcp',{async fetch(){try{return await run();}catch(error){captureUnexpected(error,operation);throw error;}}});
 return await Reflect.apply(wrapped.fetch,wrapped,[undefined,env,ctx]);
}
