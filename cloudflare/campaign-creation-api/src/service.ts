import {authorize, type AuthEnvironment} from './auth';
import {digest,mappingDigest, planSchema, result, type Result, type Scope} from './contracts';
import {buildOperations, Google, ProviderError, providerName, type GoogleCredentials} from './google';
import {Store, type Workflow} from './store';
import {z} from 'zod';
export type Environment = AuthEnvironment & GoogleCredentials & {DB:D1Database};
export type Provider = Pick<Google, 'validate' | 'create' | 'readback'>;
export interface Dependencies {authorize: typeof authorize; provider: (env: Environment, scope: Scope) => Provider}
const defaults: Dependencies = {authorize, provider: (env, scope) => new Google(env, scope)};
const reference = (w: Workflow) => ({workflow_ref: w.id, revision_ref: w.revision_id});
async function sameScope(w: Workflow, s: Scope, backendRevision:string) {
  if (w.account_id !== s.platformAccountId || w.permission_revision !== s.grantRevision ||
    w.connection_revision !== s.connectionRevision || w.provider_revision !== s.providerRevision||w.scope_hash!==await digest(s)||w.backend_revision!==backendRevision)
    throw new Error('stale_revision');
}
export async function execute(env: Environment, scope: Scope, tool: string, input: Record<string, any>, requestHash: string,
  deps: Dependencies = defaults): Promise<Result> {
  const check=()=>deps.authorize(env,scope,tool==='campaign_action_prepare'?`${tool}_${input.action}`:tool);
  const backendRevision=await digest([env.GOOGLE_ADS_CONNECTION_REVISION,env.GOOGLE_ADS_CLIENT_ID,env.GOOGLE_ADS_CLIENT_SECRET,env.GOOGLE_ADS_REFRESH_TOKEN,env.GOOGLE_ADS_DEVELOPER_TOKEN]);
  if (input.service_id !== scope.accountPageId) throw new Error('access_denied');
  await check();
  const store = new Store(env.DB), google = deps.provider(env, scope);
  if (tool === 'campaign_gate2_activate' || tool === 'campaign_creation_resume' ||
    tool === 'campaign_action_prepare' && !['approve', 'gate1'].includes(input.action))
    return result('locked', {caveats: ['Activation, scheduling and mutation retries are not accepted. Use operation status to reconcile.']});
  if (tool === 'campaign_templates_list') {
    const references=await new Google(env,scope).referenceAssets();
    await check();
    return result('success', {data: {templates: [], supported_campaign_types: ['search', 'demand_gen'], brief_schema: z.toJSONSchema(planSchema), references,mode: 'real_paused'}});
  }
  if (tool === 'campaign_draft_save') {
    if (input.source.kind !== 'brief') return result('clarification_required', {validation_issues: [{field: 'source', code: 'unsupported_source', message: 'Provide a Search or Demand Gen brief.'}]});
    const parsed = planSchema.safeParse(input.source.fields);
    if (!parsed.success) return result('clarification_required', {validation_issues: parsed.error.issues.slice(0, 20).map(issue => ({field: issue.path.join('.'), code: issue.code, message: issue.message.slice(0, 500)}))});
    buildOperations(scope, parsed.data, 'validation'); // Reject cross-account asset references before persisting a draft.
    if(Boolean(input.workflow_id)!==Boolean(input.revision_id))throw new Error('invalid_request');
    let w:Workflow;
    if(input.workflow_id){
      const previous=await store.workflow(input.workflow_id,scope);
      if(!previous)throw new Error('stale_revision');
      await sameScope(previous,scope,backendRevision);
      if(previous.mapping_hash!==await mappingDigest(scope))throw new Error('access_denied');
      const prior=planSchema.parse(JSON.parse(previous.plan_json));
      if(prior.campaign_type!==parsed.data.campaign_type||prior.currency!==parsed.data.currency||prior.timezone!==parsed.data.timezone)throw new Error('conflict');
      w=await store.saveRevision(previous,scope,parsed.data,input.idempotency_key,input.revision_id);
    }else w=await store.save(scope, parsed.data, input.idempotency_key,backendRevision);
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
        const data = await google.readback(planSchema.parse(JSON.parse(w.plan_json)), w.id);
        await check();
        await store.finish(w, operation.id, 'verified', data);
        return result('success', {...reference(w), receipt_ref: operation.id, data: {...data, status: 'verified', provider_action: false}});
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
  await sameScope(w, scope,backendRevision);
  if (input.revision_id && input.revision_id !== w.revision_id) throw new Error('stale_revision');
  const plan = planSchema.parse(JSON.parse(w.plan_json));
  if (tool === 'campaign_workflow_get') return result('success', {...reference(w), data: {status: w.status, plan, revision_hash: w.plan_hash, mode: 'real_paused'}});
  if (tool === 'campaign_draft_validate') {
    if (!['draft', 'validated'].includes(w.status)) throw new Error('conflict');
    try { await google.validate(plan, w.id); }
    catch (error) {
      const budget=error instanceof ProviderError&&error.code.includes('BUDGET_');
      return result('clarification_required', {...reference(w), validation_issues: [{field:budget?'daily_budget':'configuration', code: error instanceof ProviderError ? error.code.slice(0,100) : 'validation_unavailable', message:budget?'Google rejected this daily budget. Revise the preview and validate before approval.':'Google validation has not passed. Check assets and targeting before approval.'}]});
    }
    await check();
    if (w.status !== 'validated') await store.status(w, 'validated');
    return result('success', {...reference(w), allowed_next_actions: ['campaign_action_prepare'], data: {status: 'validated', plan, validate_only: true, provider_action: false}});
  }
  if (tool === 'campaign_action_prepare') {
    if (w.status !== (input.action === 'approve' ? 'validated' : 'approved')) throw new Error('conflict');
    await google.validate(plan, w.id);
    await check();
    const display = {
      action: input.action, stage: input.action === 'approve' ? 'approve_revision' : 'create_paused', revision_hash: w.plan_hash,
      draft: {name: providerName(plan, w.id), platform: 'Google', account: {service_id: scope.accountPageId, label: scope.platformAccountId},
        objective: plan.campaign_type === 'search' ? 'Search — maximize clicks' : 'Demand Gen — maximize conversions',
        budget: {amount: Number(plan.daily_budget), currency: plan.currency, period: 'daily'},
        schedule: {mode: 'draft', start_at: null, end_at: null, timezone: plan.timezone},
        targeting_summary: JSON.stringify({location_count: plan.locations.length, language_count: plan.languages.length,
          ...(plan.campaign_type === 'search' ? {keyword_count: plan.keywords.length, match_type: 'EXACT'} : {audience: plan.audience}),full_targeting:'See complete provider resource plan.'}),
        creative_summary: JSON.stringify({final_url: plan.final_url, headlines: plan.headlines, descriptions: plan.descriptions,
          ...(plan.campaign_type === 'demand_gen' ? {business_name: plan.business_name, asset_count:plan.landscape_images.length+plan.square_images.length+plan.logos.length, full_assets:'See complete provider resource plan.'} : {})}),
        validation_status: 'ready', warnings: []}, provider_objects: [], qa_status: 'not_applicable',
      consequences: input.action === 'approve' ? ['Approve this exact immutable revision. No provider resources are created.']
        : ['Create one dedicated daily budget, one paused campaign, one paused ad group, one paused ad and the displayed targeting.', 'Existing campaigns are untouched. Activation and scheduling remain unavailable.'],
    };
    const confirmationHash = await digest({scope, workflow: w.id, revision: w.revision_id, resource_plan: buildOperations(scope, plan, w.id), display});
    const challenge = await store.prepare(w, input.action, confirmationHash, requestHash);
    return result('success', {...reference(w), challenge, confirmation: {...display, confirmation_hash: confirmationHash, expires_at: challenge.expires_at}, data: {resource_plan: buildOperations(scope, plan, w.id)}});
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
    // Only the atomic challenge claim can select a provider dispatch. Validate-only first, then reauthorize.
    await google.validate(plan, w.id);
    await check();
    await store.reserve(w, input, requestHash);
    await check();
    await store.dispatched(input.idempotency_key);
    let providerResources: string[];
    try { providerResources = await google.create(plan, w.id); }
    catch (error) {
      const status = error instanceof ProviderError && error.outcome === 'rejected' ? 'rejected' : 'unknown';
      await store.finish(w, input.idempotency_key, status, {provider_action: status === 'unknown' ? 'unknown' : false});
      return result(status === 'unknown' ? 'unknown' : 'unavailable', {...reference(w), receipt_ref: input.idempotency_key, allowed_next_actions: ['campaign_operation_get'], caveats: ['Creation was not verified. Reconcile this receipt; do not resubmit.']});
    }
    let readback;
    try {
      readback = await google.readback(plan, w.id);
      await store.finish(w, input.idempotency_key, 'verified', {...readback, provider_resources: providerResources});
    } catch {
      await store.finish(w, input.idempotency_key, 'unknown', {provider_resources: providerResources, provider_action: 'accepted', verification: 'pending'});
      // Do not expose provider data if authorization changed during execution.
      await check();
      return result('unknown', {...reference(w), receipt_ref: input.idempotency_key, allowed_next_actions: ['campaign_operation_get'], caveats: ['Paused creation readback is pending. No automatic retry.']});
    }
    await check();
    return result('success', {...reference(w), receipt_ref: input.idempotency_key, data: {...readback, provider_resources: providerResources, status: 'verified'}});
  }
  return result('unavailable');
}
