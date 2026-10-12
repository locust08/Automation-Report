import * as Sentry from '@sentry/cloudflare';

// Mirrored in the separately deployed M04 package. Keep the privacy policy identical.
export interface ObservabilityEnv {
  SENTRY_DSN?:string; SENTRY_ENVIRONMENT?:string; SENTRY_RELEASE?:string;
  CF_VERSION_METADATA?:{id:string};
}
export type Service='digitalbee-mcp'|'m04';
export type Operation='http.fetch'|'mcp.operation'|'oauth.exchange'|'scheduled.run'|'scheduled.bug_health'|'scheduled.snapshot_cleanup'|'telemetry.write'|'discovery.read'|'performance.read'|'inspection.read'|'diagnostics.read'|'budget.read'|'campaign.operation'|'campaign.audit'|'campaign.validate'|'campaign.queue_publish'|'campaign.preflight'|'campaign.dispatch_record'|'campaign.create'|'campaign.readback'|'queue.process'|'live_change.operation'|'diagnostic.synthetic';
const operations=new Set<Operation>(['http.fetch','mcp.operation','oauth.exchange','scheduled.run','scheduled.bug_health','scheduled.snapshot_cleanup','telemetry.write','discovery.read','performance.read','inspection.read','diagnostics.read','budget.read','campaign.operation','campaign.audit','campaign.validate','campaign.queue_publish','campaign.preflight','campaign.dispatch_record','campaign.create','campaign.readback','queue.process','live_change.operation','diagnostic.synthetic']);
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
export function captureUnexpected(error:unknown,operation:Operation,refs:References={}):void {
  try {
    if(expectedError(error)||!Sentry.isEnabled())return;
    Sentry.withScope(scope=>{
      scope.setTags({operation,error_category:category(error),...references(refs)});
      // Original messages, causes and properties are removed by beforeSend.
      Sentry.captureException(error);
    });
  }catch{/* Observability must never affect authorization, responses or retry decisions. */}
}
export function releaseFor(env:ObservabilityEnv,service:Service):string|undefined {
  const explicit=env.SENTRY_RELEASE;
  if(explicit&&new RegExp(`^${service}@(?:[a-f0-9]{7,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$`).test(explicit))return explicit;
  const id=env.CF_VERSION_METADATA?.id;
  return id&&uuid.test(id)?`${service}@${id}`:undefined;
}
function validDsn(dsn:string|undefined):boolean {
  if(!dsn)return false;
  try{const url=new URL(dsn);return url.protocol==='https:'&&/^[a-f0-9]{32}$/.test(url.username)&&!url.password&&/^\/[0-9]+$/.test(url.pathname)&&!url.search&&!url.hash&&/^(?:[a-z0-9-]+\.)*ingest(?:\.[a-z]+)?\.sentry\.io$/.test(url.hostname);}catch{return false;}
}
/** Rebuild, don't redact recursively: new SDK fields are excluded by default. */
export function filterEvent(event:Sentry.ErrorEvent,hint:Sentry.EventHint,service:Service,environment:string,release:string):Sentry.ErrorEvent|null {
  try {
    if(expectedError(hint.originalException))return null;
    const rawOperation=event.tags?.operation;
    const operation=typeof rawOperation==='string'&&operations.has(rawOperation as Operation)?rawOperation:'http.fetch';
    const errorCategory=category(hint.originalException);
    const values=event.exception?.values?.slice(-1).map(exception=>({
      type:errorCategory,value:`Unexpected failure in ${operation}`,
      // Only deployed bundle coordinates. No local paths, function names or source content.
      stacktrace:{frames:exception.stacktrace?.frames?.filter(frame=>frame.filename==='index.js'||frame.filename==='worker.js').slice(-40).map(frame=>({filename:'index.js',lineno:Number.isInteger(frame.lineno)?frame.lineno:undefined,colno:Number.isInteger(frame.colno)?frame.colno:undefined,in_app:true}))??[]},
      mechanism:{type:'generic',handled:exception.mechanism?.handled!==false},
    }));
    return {
      type:undefined,event_id:typeof event.event_id==='string'&&/^[a-f0-9]{32}$/.test(event.event_id)?event.event_id:undefined,timestamp:typeof event.timestamp==='number'?event.timestamp:undefined,platform:'javascript',level:'error',environment,release,
      tags:{service,operation,error_category:errorCategory,...references({correlationId:event.tags?.correlation_id,receiptId:event.tags?.receipt_id})},
      ...(values?.length?{exception:{values}}:{message:`Unexpected failure in ${operation}`}),
      fingerprint:[service,operation,errorCategory],
    };
  }catch{return null;}
}
export function sentryOptions(env:ObservabilityEnv,service:Service):Sentry.CloudflareOptions {
  const release=releaseFor(env,service),environment=env.SENTRY_ENVIRONMENT??'local';
  const enabled=validDsn(env.SENTRY_DSN)&&!!release&&['production','staging','development','local'].includes(environment);
  return {
    dsn:enabled?env.SENTRY_DSN:undefined,enabled,environment,release,
    dataCollection:{userInfo:false,cookies:false,httpHeaders:false,httpBodies:[],urlQueryParams:false,graphQL:{document:false,variables:false},genAI:{inputs:false,outputs:false},databaseQueryData:false,queues:false,stackFrameVariables:false,frameContextLines:0},
    cacheClient:false,defaultIntegrations:[],integrations:[],maxBreadcrumbs:0,beforeBreadcrumb:()=>null,
    beforeSendLog:()=>null,beforeSendMetric:()=>null,
    sendClientReports:false,tracePropagationTargets:[],rpcTracePropagationBindings:[],
    beforeSend:(event,hint)=>release?filterEvent(event,hint,service,environment,release):null,
    traceLifecycle:'static',beforeSendTransaction:()=>null,
    initialScope:{tags:{service,operation:'http.fetch'}},
  };
}
/** Missing or invalid configuration bypasses the SDK entirely. Never replay a handler. */
export function observeWorker<E extends ObservabilityEnv,H extends object>(service:Service,handler:H):H {
  const exported=handler as ExportedHandler<E>;
  const output={...handler};
  for(const name of ['fetch','queue','scheduled'] as const){
    const original=exported[name];
    if(!original)continue;
    Object.assign(output,{[name]:async function(...args:unknown[]){
      const env=args[1] as E;
      if(!sentryOptions(env,service).enabled)return Reflect.apply(original,this,args);
      // Per-invocation state lets SDK setup/flush failures fall back without replaying business work.
      let started=false,threw=false,result:unknown,originalError:unknown;
      const receiver=this;
      const invoke=(handlerArgs:unknown[])=>{
        started=true;
        try{result=Reflect.apply(original,receiver,handlerArgs);return result;}
        catch(error){threw=true;originalError=error;throw error;}
      };
      try{
        const guarded={ [name]:function(...handlerArgs:unknown[]){
          try{Sentry.getCurrentScope().setTag('operation',name==='queue'?'queue.process':name==='scheduled'?'scheduled.run':'http.fetch');}catch{}
          return invoke(handlerArgs);
        }};
        const wrapped=Sentry.withSentry((bindings:E)=>sentryOptions(bindings,service),guarded as ExportedHandler<E>);
        return await Reflect.apply(wrapped[name]!,receiver,args);
      }catch{
        if(threw)throw originalError;
        if(started)return await result;
        return invoke(args);
      }
    }});
  }
  return output;
}
