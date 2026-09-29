import {authorize, type AuthEnvironment} from './auth';
import {digest,mappingDigest, planSchema,metaPlanSchema,tiktokPlanSchema, scopeSchema, result, type Result, type Scope} from './contracts';
import {buildOperations, Google, ProviderError, providerName, type GoogleCredentials} from './google';
import {Meta,metaProviderName,type MetaCredentials} from './meta';
import {TikTok,tiktokProviderName,type TikTokCredentials} from './tiktok';
import {Store, type Workflow} from './store';
import {z} from 'zod';
import {campaignBlocker} from './blockers';
export type Environment = AuthEnvironment & GoogleCredentials & MetaCredentials & TikTokCredentials & {DB:D1Database;CREATION_QUEUE?:Queue<{operationId:string}>};
export type Provider = Pick<Google, 'validate' | 'create' | 'readback'>;
export interface Dependencies {authorize: typeof authorize; provider: (env: Environment, scope: Scope) => Provider}
const defaults: Dependencies = {authorize, provider: (env, scope) => new Google(env, scope)};
const reference = (w: Workflow) => ({workflow_ref: w.id, revision_ref: w.revision_id});
const backendRevision=(env:Environment,scope:Scope)=>scope.platform==='Meta'
  ?digest([env.META_API_VERSION,env.META_ACCESS_TOKEN])
  :scope.platform==='TikTok'?digest([env.TIKTOK_ACCESS_TOKEN,env.M04_TIKTOK_MIN_DAILY_BUDGET,env.M04_TIKTOK_BUDGET_CURRENCY])
  :digest([env.GOOGLE_ADS_CONNECTION_REVISION,env.GOOGLE_ADS_CLIENT_ID,env.GOOGLE_ADS_CLIENT_SECRET,env.GOOGLE_ADS_REFRESH_TOKEN,env.GOOGLE_ADS_DEVELOPER_TOKEN]);
const schemaFor=(platform:Scope['platform'])=>platform==='Meta'?metaPlanSchema:platform==='TikTok'?tiktokPlanSchema:planSchema;
async function sameScope(w: Workflow, s: Scope, backendRevision:string) {
  if (w.account_id !== s.platformAccountId || w.permission_revision !== s.grantRevision ||
    w.connection_revision !== s.connectionRevision || w.provider_revision !== s.providerRevision||w.scope_hash!==await digest(s)||w.backend_revision!==backendRevision)
    throw new Error('stale_revision');
}
export async function execute(env: Environment, scope: Scope, tool: string, input: Record<string, any>, requestHash: string,
  deps: Dependencies = defaults): Promise<Result> {
  const check=()=>deps.authorize(env,scope,tool==='campaign_action_prepare'?`${tool}_${input.action}`:tool);
  const backendRev=await backendRevision(env,scope);
  if (input.service_id !== scope.accountPageId) throw new Error('access_denied');
  await check();
  const store = new Store(env.DB), google = deps.provider(env, scope), meta=new Meta(env,scope),tiktok=new TikTok(env,scope);
  if (tool === 'campaign_gate2_activate' || tool === 'campaign_creation_resume' ||
    tool === 'campaign_action_prepare' && !['approve', 'gate1'].includes(input.action))
    return result('locked', {caveats: ['Activation, scheduling and mutation retries are not accepted. Use operation status to reconcile.']});
  if (tool === 'campaign_templates_list') {
    const references=scope.platform==='Meta'?await meta.referenceAssets():scope.platform==='TikTok'?await tiktok.referenceAssets():await new Google(env,scope).referenceAssets();
    await check();
    return result('success', {data: {templates: [], supported_campaign_types: scope.platform==='Meta'?['meta_existing_ad']:scope.platform==='TikTok'?['tiktok_existing_ad']:['search', 'demand_gen'], brief_schema: z.toJSONSchema(schemaFor(scope.platform)), references,mode: 'real_paused'}});
  }
  if(tool==='campaign_workflows_list'){
    const workflows=await store.workflows(scope,backendRev,input.limit??20);
    await check();
    return result('success',{data:{workflows:workflows.map(w=>({workflow_ref:w.id,revision_ref:w.revision_id,
      status:w.status,name:JSON.parse(w.plan_json).name,updated_at:new Date(w.updated_at).toISOString()})),provider_action:false}});
  }
  if (tool === 'campaign_draft_save') {
    if (input.source.kind !== 'brief') return result('clarification_required', {validation_issues: [{field: 'source', code: 'unsupported_source', message: 'Provide a campaign brief.'}]});
    const parsed = schemaFor(scope.platform).safeParse(input.source.fields);
    if (!parsed.success) return result('clarification_required', {validation_issues: parsed.error.issues.slice(0, 20).map(issue => ({field: issue.path.join('.'), code: issue.code, message: issue.message.slice(0, 500)}))});
    if(scope.platform==='Google')buildOperations(scope, planSchema.parse(parsed.data), 'validation'); // Reject cross-account asset references before persisting a draft.
    else if(scope.platform==='Meta'){
      const plan=metaPlanSchema.parse(parsed.data),references=await meta.referenceAssets(plan.source_ad_id),source=references.sources[0];
      if(!source||source.source_ad_id!==plan.source_ad_id||source.source_campaign_id!==plan.source_campaign_id||
        source.source_adset_id!==plan.source_adset_id||source.source_fingerprint!==plan.source_fingerprint||plan.currency!==references.account.currency||plan.timezone!==references.account.timezone_name||plan.daily_budget!==source.minimum_daily_budget)
        throw new Error('stale_revision');
    }else{
      const source=(await tiktok.referenceAssets()).sources[0],plan=tiktokPlanSchema.parse(parsed.data);
      if(!source||source.resource_status!=='ready'||source.source_ad_id!==plan.source_ad_id||source.source_campaign_id!==plan.source_campaign_id||
        source.source_adgroup_id!==plan.source_adgroup_id||source.source_fingerprint!==plan.source_fingerprint)throw new Error('stale_revision');
    }
    if(Boolean(input.workflow_id)!==Boolean(input.revision_id))throw new Error('invalid_request');
    let w:Workflow;
    if(input.workflow_id){
      const previous=await store.workflow(input.workflow_id,scope);
      if(!previous)throw new Error('stale_revision');
      await sameScope(previous,scope,backendRev);
      if(previous.mapping_hash!==await mappingDigest(scope))throw new Error('access_denied');
      const prior=schemaFor(scope.platform).parse(JSON.parse(previous.plan_json));
      if(prior.campaign_type!==parsed.data.campaign_type||prior.currency!==parsed.data.currency||prior.timezone!==parsed.data.timezone)throw new Error('conflict');
      w=await store.saveRevision(previous,scope,parsed.data,input.idempotency_key,input.revision_id);
    }else w=await store.save(scope, parsed.data, input.idempotency_key,backendRev);
    await check();
    return result('success', {...reference(w), allowed_next_actions: ['campaign_draft_validate'], data: {status: w.status, plan: JSON.parse(w.plan_json), revision_hash:w.plan_hash, provider_action: false}});
  }
  if (tool === 'campaign_operation_get') {
    const operation = await store.operation(input.idempotency_key, scope);
    if (!operation) return result('unavailable', {caveats: ['Creation receipt not found.']});
    const w = await store.workflow(operation.workflow_id, scope);
    if (!w) throw new Error('access_denied');
    if(w.mapping_hash!==await mappingDigest(scope))throw new Error('access_denied');
    if (['dispatched', 'unknown'].includes(operation.status)) {
      try {
        const data = scope.platform==='Meta'
          ?await meta.readback(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,operation.id,store)
          :scope.platform==='TikTok'?await tiktok.readback(tiktokPlanSchema.parse(JSON.parse(w.plan_json)),w.id,operation.id,store)
          :await google.readback(planSchema.parse(JSON.parse(w.plan_json)), w.id);
        await check();
        await store.finish(w, operation.id, 'verified', data);
        return result('success', {...reference(w), receipt_ref: operation.id, data: {status:'verified',readback:data,provider_action:false}});
      } catch { /* Never repeat an uncertain provider mutation. */ }
    }
    await check();
    return result(operation.status === 'verified' ? 'success' : operation.status === 'rejected' ? 'unavailable' : 'unknown',
      {...reference(w), receipt_ref: operation.id, data: {status: operation.status, readback: operation.result_json ? JSON.parse(operation.result_json) : null},
        caveats: operation.status === 'verified' ? [] : ['No automatic creation retry.']});
  }
  const w = await store.workflow(input.workflow_id, scope);
  if (!w) return result('unavailable', {caveats: ['Draft not found.']});
  if(tool==='campaign_workflow_get'){
    if(w.mapping_hash!==await mappingDigest(scope))throw new Error('access_denied');
    const operation=await store.operationForWorkflow(w.id,scope);
    await check();
    const revisions=await store.revisions(w.id);
    return result('success',{...reference(w),receipt_ref:operation?.id??null,allowed_next_actions:operation?['campaign_operation_get']:[],data:{status:w.status,plan:JSON.parse(w.plan_json),revision_hash:w.plan_hash,revision_history:revisions.map(r=>({revision_id:r.revision_id,revision_number:r.revision_number,revision_hash:r.plan_hash,name:JSON.parse(r.plan_json).name,created_at:r.created_at})),mode:'real_paused',provider_action:false}});
  }
  await sameScope(w, scope,backendRev);
  if (input.revision_id && input.revision_id !== w.revision_id) throw new Error('stale_revision');
  const plan = scope.platform==='Meta'?metaPlanSchema.parse(JSON.parse(w.plan_json)):scope.platform==='TikTok'?tiktokPlanSchema.parse(JSON.parse(w.plan_json)):planSchema.parse(JSON.parse(w.plan_json));
  if (tool === 'campaign_workflow_get') return result('success', {...reference(w), data: {status: w.status, plan, revision_hash: w.plan_hash, mode: 'real_paused'}});
  if (tool === 'campaign_draft_validate') {
    if (!['draft', 'validated'].includes(w.status)) throw new Error('conflict');
    try { if(scope.platform==='Meta')await meta.validate(metaPlanSchema.parse(plan),w.id);else if(scope.platform==='TikTok')await tiktok.validate(tiktokPlanSchema.parse(plan),w.id);else await google.validate(planSchema.parse(plan), w.id); }
    catch (error) {
      const budget=error instanceof ProviderError&&(error.code.includes('BUDGET_')||error.code==='meta_1885272');
      return result('clarification_required', {...reference(w), validation_issues: [{field:budget?'daily_budget':'configuration', code: error instanceof ProviderError ? error.code.slice(0,100) : 'validation_unavailable', message:budget?'The provider rejected this daily budget. Revise and validate before approval.':'Provider validation has not passed. Check assets and targeting before approval.'}]});
    }
    await check();
    if (w.status !== 'validated') await store.status(w, 'validated');
    return result('success', {...reference(w), allowed_next_actions: ['campaign_action_prepare'], data: {status: 'validated', plan, validate_only: true, provider_action: false}});
  }
  if (tool === 'campaign_action_prepare') {
    if (w.status !== (input.action === 'approve' ? 'validated' : 'approved')) throw new Error('conflict');
    // The saved immutable revision already passed validateOnly. The creation worker validates again before dispatch.
    const metaPreview=scope.platform==='Meta'?await meta.validate(metaPlanSchema.parse(plan),w.id):null;
    const tiktokPreview=scope.platform==='TikTok'?await tiktok.validate(tiktokPlanSchema.parse(plan),w.id):null;
    const resourcePlan=scope.platform==='Meta'?[{kind:'campaign',status:'PAUSED',objective:metaPreview!.source.objective},
      {kind:'adset',status:'PAUSED',daily_budget:plan.daily_budget,currency:plan.currency,targeting:metaPreview!.adset.targeting,
        optimization_goal:metaPreview!.adset.optimization_goal,regional_regulation_identities:metaPreview!.adset.regional_regulation_identities},
      {kind:'ad',status:'PAUSED',creative_id:metaPreview!.source.creative_id,final_url:metaPreview!.source.final_url}]
      :scope.platform==='TikTok'?[{kind:'campaign',status:'DISABLE',objective:tiktokPreview!.source.objective},
        {kind:'adgroup',status:'DISABLE',daily_budget:plan.daily_budget,currency:plan.currency,location_ids:tiktokPreview!.group.location_ids,
          optimization_goal:tiktokPreview!.group.optimization_goal},
        {kind:'ad',status:'DISABLE',video_id:tiktokPreview!.source.video_id,identity_id:tiktokPreview!.source.identity_id,
          final_url:tiktokPreview!.source.final_url}]
      :buildOperations(scope,planSchema.parse(plan),w.id);
    const display = scope.platform==='Meta'?{
      action:input.action,stage:input.action==='approve'?'approve_revision':'create_paused',revision_hash:w.plan_hash,
      draft:{name:metaProviderName(metaPlanSchema.parse(plan),w.id),platform:'Meta',account:{service_id:scope.accountPageId,label:scope.platformAccountId},
        objective:metaPreview!.source.objective,budget:{amount:Number(plan.daily_budget),currency:plan.currency,period:'daily'},
        schedule:{mode:'draft',start_at:null,end_at:null,timezone:plan.timezone},
        targeting_summary:JSON.stringify({geo_locations:metaPreview!.adset.targeting.geo_locations,
          age_min:metaPreview!.adset.targeting.age_min,age_max:metaPreview!.adset.targeting.age_max,
          optimization_goal:metaPreview!.adset.optimization_goal}),
        creative_summary:JSON.stringify({source_ad_id:metaPreview!.source.source_ad_id,creative_id:metaPreview!.source.creative_id,
          page_id:metaPreview!.adset.promoted_object?.page_id??null,final_url:metaPreview!.source.final_url}),
        validation_status:'ready',warnings:[]},provider_objects:[],qa_status:'not_applicable',
      consequences:input.action==='approve'?['Confirm this immutable revision. No Meta resource is created.']:
        ['Create one Meta campaign, ad set and ad with PAUSED status. Activation and scheduling remain unavailable.'],
    }:scope.platform==='TikTok'?{
      action:input.action,stage:input.action==='approve'?'approve_revision':'create_paused',revision_hash:w.plan_hash,
      draft:{name:tiktokProviderName(tiktokPlanSchema.parse(plan),w.id),platform:'TikTok',account:{service_id:scope.accountPageId,label:scope.platformAccountId},
        objective:tiktokPreview!.source.objective,budget:{amount:Number(plan.daily_budget),currency:plan.currency,period:'daily'},
        schedule:{mode:'draft',start_at:null,end_at:null,timezone:plan.timezone},
        targeting_summary:JSON.stringify({location_ids:tiktokPreview!.group.location_ids,age_groups:tiktokPreview!.group.age_groups,
          optimization_goal:tiktokPreview!.group.optimization_goal}),
        creative_summary:JSON.stringify({source_ad_id:tiktokPreview!.source.source_ad_id,video_id:tiktokPreview!.source.video_id,
          identity_id:tiktokPreview!.source.identity_id,final_url:tiktokPreview!.source.final_url}),
        validation_status:'ready',warnings:[]},provider_objects:[],qa_status:'not_applicable',
      consequences:input.action==='approve'?['Confirm this immutable revision. No TikTok resource is created.']:
        ['Create one TikTok campaign, ad group and ad with DISABLE status. Activation and scheduling remain unavailable.'],
    }:{
      action: input.action, stage: input.action === 'approve' ? 'approve_revision' : 'create_paused', revision_hash: w.plan_hash,
      draft: {name: providerName(planSchema.parse(plan), w.id), platform: 'Google', account: {service_id: scope.accountPageId, label: scope.platformAccountId},
        objective: plan.campaign_type === 'search' ? 'Search — maximize clicks' : 'Demand Gen — maximize conversions',
        budget: {amount: Number(plan.daily_budget), currency: plan.currency, period: 'daily'},
        schedule: {mode: 'draft', start_at: null, end_at: null, timezone: plan.timezone},
        targeting_summary: JSON.stringify({location_count: planSchema.parse(plan).locations.length, language_count: planSchema.parse(plan).languages.length,
          ...(plan.campaign_type === 'search' ? {keyword_count: plan.keywords.length, match_type: 'EXACT'} : {audience:plan.campaign_type==='demand_gen'?plan.audience:null}),full_targeting:'See complete provider resource plan.'}),
        creative_summary: JSON.stringify({final_url: planSchema.parse(plan).final_url, headlines: planSchema.parse(plan).headlines, descriptions:planSchema.parse(plan).descriptions,
          ...(plan.campaign_type === 'demand_gen' ? {business_name: plan.business_name, asset_count:plan.landscape_images.length+plan.square_images.length+plan.logos.length, full_assets:'See complete provider resource plan.'} : {})}),
        validation_status: 'ready', warnings: []}, provider_objects: [], qa_status: 'not_applicable',
      consequences: input.action === 'approve' ? ['Approve this exact immutable revision. No provider resources are created.']
        : ['Create one dedicated daily budget, one paused campaign, one paused ad group, one paused ad and the displayed targeting.', 'Existing campaigns are untouched. Activation and scheduling remain unavailable.'],
    };
    const confirmationHash = await digest({scope, workflow: w.id, revision: w.revision_id, resource_plan: resourcePlan, display});
    const challenge = await store.prepare(w, input.action, confirmationHash, requestHash);
    return result('success', {...reference(w), challenge, confirmation: {...display, confirmation_hash: confirmationHash, expires_at: challenge.expires_at}, data: {resource_plan: resourcePlan}});
  }
  if (tool === 'campaign_revision_approve') {
    await store.approve(w, input);
    await check();
    return result('success', {...reference(w), allowed_next_actions: ['campaign_action_prepare'], data: {status: 'approved', provider_action: false}});
  }
  if (tool === 'campaign_gate1_create') {
    const existing = await store.operation(input.idempotency_key, scope);
    if (existing) {
      if (existing.workflow_id !== w.id || existing.request_hash !== requestHash) throw new Error('idempotency_conflict');
      return result(existing.status === 'verified' ? 'success' : 'unknown', {...reference(w), receipt_ref: existing.id, data: {status: existing.status, duplicate_submission: true}});
    }
    if(!env.CREATION_QUEUE)throw new Error('unavailable');
    await store.reserve(w, input, requestHash, scope);
    try{await env.CREATION_QUEUE.send({operationId:input.idempotency_key});await store.markEnqueued(input.idempotency_key);}
    catch(error){console.warn(JSON.stringify({event:'m04_queue_publish_failure',operation_id:input.idempotency_key}));}
    return result('success', {...reference(w), receipt_ref: input.idempotency_key, allowed_next_actions:['campaign_operation_get'],data:{status:'reserved',provider_action:false}});
  }
  return result('unavailable');
}

/** A queue redelivery may reconcile a dispatched operation, but can never send another mutation. */
export async function processReservedCreation(env:Environment,operationId:string,deps:Dependencies=defaults):Promise<void>{
  const store=new Store(env.DB),outbox=await store.outbox(operationId);
  if(!outbox)throw new Error('outbox_missing');
  const storedScope:unknown=JSON.parse(outbox.scope_json);
  scopeSchema.parse(storedScope); // Validate without reordering keys used by the saved scope hash.
  const scope=storedScope as Scope,operation=await store.operation(operationId,scope);
  if(!operation)return;
  const w=await store.workflow(operation.workflow_id,scope);
  if(!w)return;
  const plan=scope.platform==='Meta'?metaPlanSchema.parse(JSON.parse(w.plan_json)):scope.platform==='TikTok'?tiktokPlanSchema.parse(JSON.parse(w.plan_json)):planSchema.parse(JSON.parse(w.plan_json)),
    google=deps.provider(env,scope),meta=new Meta(env,scope),tiktok=new TikTok(env,scope);
  const readback=async()=>{try{const data=scope.platform==='Meta'
    ?await meta.readback(metaPlanSchema.parse(plan),w.id,operationId,store)
    :scope.platform==='TikTok'?await tiktok.readback(tiktokPlanSchema.parse(plan),w.id,operationId,store)
    :await google.readback(planSchema.parse(plan),w.id);
    await store.finish(w,operationId,'verified',{...data,provider_action:true});}catch{/* A dispatched mutation is never repeated. */}};
  if(['verified','rejected'].includes(operation.status))return;
  if(['dispatched','unknown'].includes(operation.status)){await readback();return;}
  if(operation.status!=='reserved')return;
  try{
    await deps.authorize(env,scope,'campaign_gate1_create');
    await sameScope(w,scope,await backendRevision(env,scope));
    if(scope.platform==='Meta')await meta.validate(metaPlanSchema.parse(plan),w.id);
    else if(scope.platform==='TikTok')await tiktok.validate(tiktokPlanSchema.parse(plan),w.id);
    else await google.validate(planSchema.parse(plan),w.id);
    await deps.authorize(env,scope,'campaign_gate1_create');
  }catch(error){await store.rejectReserved(w,operationId,error instanceof ProviderError?error.code:'preflight_unavailable');return;}
  try{await store.dispatched(operationId);}catch{await readback();return;}
  let resources:string[];
  try{resources=scope.platform==='Meta'?await meta.create(metaPlanSchema.parse(plan),w.id,operationId,store):scope.platform==='TikTok'?await tiktok.create(tiktokPlanSchema.parse(plan),w.id,operationId,store):await google.create(planSchema.parse(plan),w.id);}
  catch(error){
    const partial=scope.platform!=='Google'&&Boolean((await store.providerStep(operationId,'campaign'))?.provider_id);
    const status=error instanceof ProviderError&&error.outcome==='rejected'&&!partial?'rejected':'unknown';
    await store.finish(w,operationId,status,{provider_action:status==='unknown'?'unknown':false,reason:error instanceof ProviderError?error.code:'provider_response',
      ...(scope.platform!=='Google'?{provider_steps:await store.providerSteps(operationId)}:{})});
    if(status==='unknown')await readback();
    return;
  }
  try{const data=scope.platform==='Meta'?await meta.readback(metaPlanSchema.parse(plan),w.id,operationId,store):scope.platform==='TikTok'?await tiktok.readback(tiktokPlanSchema.parse(plan),w.id,operationId,store):await google.readback(planSchema.parse(plan),w.id);
    await store.finish(w,operationId,'verified',{...data,provider_resources:resources,provider_action:true});}
  catch{await store.finish(w,operationId,'unknown',{provider_resources:resources,provider_action:'accepted',verification:'pending'});}
}

export async function sweepCreationOutbox(env:Environment){
  if(!env.CREATION_QUEUE)throw new Error('queue_unavailable');
  const store=new Store(env.DB);
  for(const row of await store.pendingOutbox()){
    await env.CREATION_QUEUE.send({operationId:row.operation_id});
    await store.markEnqueued(row.operation_id);
  }
}

