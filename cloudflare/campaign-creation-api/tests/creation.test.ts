import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SignJWT} from 'jose';
import {authenticate} from '../src/auth';
import {digest, planSchema, type Plan, type Scope} from '../src/contracts';
import {buildOperations, Google, ProviderError} from '../src/google';
import {execute,processReservedCreation,sweepCreationOutbox, type Dependencies, type Environment} from '../src/service';
import {Store} from '../src/store';
import {database} from './db';

const scope: Scope = {subject: 'actor', grantRevision: 1, accountPageId: '00000000-0000-4000-8000-000000000001',
  clientId: '00000000-0000-4000-8000-000000000002', platform: 'Google', platformAccountId: '2315114913',
  connectionRevision: 'm04-test', providerRevision: 'provider-test', googleLoginCustomerId: '4114685827'};
const search: Plan = {name: 'DigitalBee Acceptance — Search — TEST', campaign_type: 'search', currency: 'MYR',
  timezone: 'Asia/Kuala_Lumpur', daily_budget: '10', final_url: 'https://www.locus-t.com.my/',
  locations: ['geoTargetConstants/2458'], languages: ['languageConstants/1000'], ad_group_name: 'Search test',
  keywords: ['locus t'], headlines: ['LOCUS-T', 'Digital Marketing', 'Search Marketing'], descriptions: ['Read our digital marketing services.', 'Visit our website to learn more.']};
const demand: Plan = {name: 'DigitalBee Acceptance — Demand Gen — TEST', campaign_type: 'demand_gen', currency: 'MYR',
  timezone: 'Asia/Kuala_Lumpur', daily_budget: '10', final_url: 'https://www.locus-t.com.my/',
  locations: ['geoTargetConstants/2458'], languages: ['languageConstants/1000'], ad_group_name: 'Demand Gen test',
  headlines: ['LOCUS-T'], descriptions: ['Read our digital marketing services.'], business_name: 'LOCUS-T',
  landscape_images: ['customers/2315114913/assets/11'], square_images: ['customers/2315114913/assets/12'],
  logos: ['customers/2315114913/assets/13'], audience: 'customers/2315114913/audiences/14'};
let fixture: Awaited<ReturnType<typeof database>>, env: Environment, deps: Dependencies, store: Store;
beforeEach(async () => {
  fixture = await database(); store = new Store(fixture.db);
  env = {DB: fixture.db, M04_ENABLED: 'true', M04_CONNECTION_REVISION: scope.connectionRevision,
    M04_PILOT_ACCOUNT: scope.platformAccountId, M04_PILOT_SERVICE: scope.accountPageId, M04_PILOT_SUBJECT: scope.subject,
    M04_SERVICE_TOKEN: 't'.repeat(32), M04_DELEGATION_KEY: 'k'.repeat(32), DIGITALBEE_GRANT_VERIFY_URL: 'https://digitalbee.test/v1/internal/grants/verify', DIGITALBEE_GRANT_VERIFY_TOKEN: 'v'.repeat(32),
    GOOGLE_ADS_CLIENT_ID: 'synthetic', GOOGLE_ADS_CLIENT_SECRET: 'synthetic', GOOGLE_ADS_REFRESH_TOKEN: 'synthetic',
    CREATION_QUEUE:{send:vi.fn().mockResolvedValue(undefined)} as unknown as Queue<{operationId:string}>};
  const provider = {validate: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue(['customers/2315114913/campaigns/99']),
    readback: vi.fn().mockResolvedValue({campaign: {id: '99', status: 'PAUSED'}, ad_group: {id: '100', status: 'PAUSED'}})};
  deps = {authorize: vi.fn().mockResolvedValue(undefined), provider: () => provider};
});
afterEach(() => {vi.restoreAllMocks(); fixture.dispose();});
const call = (tool: string, input: Record<string, any>, s = scope) => execute(env, s, tool, input, 'request-hash', deps);
const process=(id:string)=>processReservedCreation(env,id,deps);
async function draft(plan: Plan = search) {
  const result = await call('campaign_draft_save', {service_id: scope.accountPageId, idempotency_key: crypto.randomUUID(), source: {kind: 'brief', fields: plan}});
  return {service_id: scope.accountPageId, workflow_id: result.workflow_ref!, revision_id: result.revision_ref!};
}
async function approved(plan: Plan = search) {
  const revision = await draft(plan);
  await call('campaign_draft_validate', {...revision, idempotency_key: crypto.randomUUID()});
  const prepared = await call('campaign_action_prepare', {...revision, idempotency_key: crypto.randomUUID(), action: 'approve'});
  await call('campaign_revision_approve', {...revision, idempotency_key: crypto.randomUUID(), challenge: prepared.challenge!.token, confirmation_hash: prepared.challenge!.confirmation_hash});
  return revision;
}
async function creation(plan: Plan = search) {
  const revision = await approved(plan), prepared = await call('campaign_action_prepare', {...revision, idempotency_key: crypto.randomUUID(), action: 'gate1'});
  return {...revision, idempotency_key: crypto.randomUUID(), challenge: prepared.challenge!.token, confirmation_hash: prepared.challenge!.confirmation_hash};
}
describe('real paused creation boundary', () => {
  it('lists only current-scope workflows so both interfaces can reopen the same draft',async()=>{
    const first=await draft(),second=await draft({...search,name:'Second test'});
    const listed=await call('campaign_workflows_list',{service_id:scope.accountPageId});
    expect(listed.outcome).toBe('success');
    expect(listed.data?.workflows).toEqual(expect.arrayContaining([
      expect.objectContaining({workflow_ref:first.workflow_id,revision_ref:first.revision_id}),
      expect.objectContaining({workflow_ref:second.workflow_id,revision_ref:second.revision_id}),
    ]));
    const other=await call('campaign_workflows_list',{service_id:scope.accountPageId},{...scope,subject:'other'});
    expect(other.data?.workflows).toEqual([]);
  });
  it('returns a durable receipt without calling Google creation in the card request',async()=>{
    const input=await creation(),provider=deps.provider(env,scope);
    const outcome=await call('campaign_gate1_create',input);
    expect(outcome).toMatchObject({outcome:'success',receipt_ref:input.idempotency_key,data:{status:'reserved'}});
    expect(provider.create).not.toHaveBeenCalled();
    expect(await store.operation(input.idempotency_key,scope)).toMatchObject({status:'reserved'});
  });
  it('keeps native paused readback under the verified receipt during reconciliation',async()=>{
    const input=await creation();await call('campaign_gate1_create',input);
    await store.dispatched(input.idempotency_key);
    const receipt=await call('campaign_operation_get',{service_id:scope.accountPageId,idempotency_key:input.idempotency_key});
    expect(receipt).toMatchObject({outcome:'success',data:{status:'verified',readback:{campaign:{status:'PAUSED'},ad_group:{status:'PAUSED'}}}});
  });
  it('preserves the signed scope field order when the queue reads a production outbox entry',async()=>{
    // DigitalBee signs and stores this order; Zod's schema lists clientId earlier.
    const liveScope:Scope={subject:scope.subject,grantRevision:scope.grantRevision,accountPageId:scope.accountPageId,
      platform:scope.platform,platformAccountId:scope.platformAccountId,connectionRevision:scope.connectionRevision,
      clientId:scope.clientId,providerRevision:scope.providerRevision,googleLoginCustomerId:scope.googleLoginCustomerId};
    const saved=await call('campaign_draft_save',{service_id:liveScope.accountPageId,idempotency_key:crypto.randomUUID(),
      source:{kind:'brief',fields:search}},liveScope);
    const revision={service_id:liveScope.accountPageId,workflow_id:saved.workflow_ref!,revision_id:saved.revision_ref!};
    await call('campaign_draft_validate',{...revision,idempotency_key:crypto.randomUUID()},liveScope);
    const approval=await call('campaign_action_prepare',{...revision,idempotency_key:crypto.randomUUID(),action:'approve'},liveScope);
    await call('campaign_revision_approve',{...revision,idempotency_key:crypto.randomUUID(),challenge:approval.challenge!.token,
      confirmation_hash:approval.challenge!.confirmation_hash},liveScope);
    const prepared=await call('campaign_action_prepare',{...revision,idempotency_key:crypto.randomUUID(),action:'gate1'},liveScope);
    const input={...revision,idempotency_key:crypto.randomUUID(),challenge:prepared.challenge!.token,
      confirmation_hash:prepared.challenge!.confirmation_hash};
    expect((await call('campaign_gate1_create',input,liveScope)).data?.status).toBe('reserved');
    await process(input.idempotency_key);
    expect((await store.operation(input.idempotency_key,liveScope))?.status).toBe('verified');
    expect(deps.provider(env,liveScope).create).toHaveBeenCalledTimes(1);
  });
  it('returns the receipt while a slow provider preflight is still pending in the queue',async()=>{
    const input=await creation(),provider=deps.provider(env,scope);
    let release!:()=>void;
    vi.mocked(provider.validate).mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const receipt=await call('campaign_gate1_create',input);
    expect(receipt).toMatchObject({outcome:'success',data:{status:'reserved'}});
    const processing=process(input.idempotency_key);
    await vi.waitFor(()=>expect(provider.validate).toHaveBeenCalledTimes(2));
    expect((await store.operation(input.idempotency_key,scope))?.status).toBe('reserved');
    expect(provider.create).not.toHaveBeenCalled();
    release();await processing;
    expect((await store.operation(input.idempotency_key,scope))?.status).toBe('verified');
  });
  it('does not repeat Google validation while preparing the paused-creation card',async()=>{
    const revision=await approved(),provider=deps.provider(env,scope),prior=vi.mocked(provider.validate).mock.calls.length;
    const prepared=await call('campaign_action_prepare',{...revision,idempotency_key:crypto.randomUUID(),action:'gate1'});
    expect(prepared.challenge?.action).toBe('gate1');expect(provider.validate).toHaveBeenCalledTimes(prior);
  });
  it('recovers a failed queue publication from the durable outbox',async()=>{
    const input=await creation(),send=vi.mocked(env.CREATION_QUEUE!.send);
    send.mockRejectedValueOnce(new Error('queue unavailable'));
    expect((await call('campaign_gate1_create',input)).data?.status).toBe('reserved');
    expect((await store.outbox(input.idempotency_key))?.enqueued_at).toBeNull();
    await sweepCreationOutbox(env);
    expect(send).toHaveBeenCalledTimes(2);
    await process(input.idempotency_key);
    expect((await store.operation(input.idempotency_key,scope))?.status).toBe('verified');
  });
  it('appends an immutable revision to the same workflow and clears earlier approval',async()=>{
    const original=await approved(),key=crypto.randomUUID(),edited={...search,name:search.name+' — Card Edit'};
    const save={...original,idempotency_key:key,source:{kind:'brief',fields:edited}};
    const first=await call('campaign_draft_save',save);
    expect(first.workflow_ref).toBe(original.workflow_id);
    expect(first.revision_ref).not.toBe(original.revision_id);
    expect((await call('campaign_draft_save',save)).revision_ref).toBe(first.revision_ref);
    const read=await call('campaign_workflow_get',{service_id:scope.accountPageId,workflow_id:original.workflow_id});
    expect(read).toMatchObject({revision_ref:first.revision_ref,receipt_ref:null,data:{status:'draft',plan:{name:edited.name},revision_history:[{revision_id:original.revision_id,name:search.name},{revision_id:first.revision_ref,name:edited.name}]}});
    await expect(call('campaign_draft_validate',{...original,idempotency_key:crypto.randomUUID()})).rejects.toThrow('stale_revision');
    expect((await call('campaign_draft_validate',{...original,revision_id:first.revision_ref,idempotency_key:crypto.randomUUID()})).data?.status).toBe('validated');
    expect((await store.revisions(original.workflow_id)).map(r=>r.revision_id)).toEqual([original.revision_id,first.revision_ref]);
  });
  it('allows authorized receipt reads after write revocation but rejects account mapping drift',async()=>{
    const input=await creation();await call('campaign_gate1_create',input);await process(input.idempotency_key);
    const read={service_id:scope.accountPageId,idempotency_key:input.idempotency_key};
    expect((await call('campaign_operation_get',read,{...scope,grantRevision:2,providerRevision:'rotated'})).outcome).toBe('success');
    expect((await call('campaign_workflow_get',{service_id:scope.accountPageId,workflow_id:input.workflow_id},{...scope,grantRevision:2})).receipt_ref).toBe(input.idempotency_key);
    await expect(call('campaign_operation_get',read,{...scope,clientId:'00000000-0000-4000-8000-000000000003'})).rejects.toThrow('access_denied');
    expect(deps.provider(env,scope).create).toHaveBeenCalledTimes(1);
  });
  it.each([search, demand])('validates and creates %s once with a provider receipt', async plan => {
    const input = await creation(plan), provider = deps.provider(env, scope);
    expect((await call('campaign_gate1_create', input)).data?.status).toBe('reserved');
    await process(input.idempotency_key);
    expect((await call('campaign_gate1_create', input)).data?.duplicate_submission).toBe(true);
    await process(input.idempotency_key);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(provider.validate).toHaveBeenCalled();
    expect(await store.operation(input.idempotency_key, scope)).toMatchObject({status: 'verified'});
  });
  it('claims concurrent submissions once', async () => {
    const input = await creation();
    await Promise.allSettled([call('campaign_gate1_create', input), call('campaign_gate1_create', input)]);
    await Promise.allSettled([process(input.idempotency_key),process(input.idempotency_key)]);
    expect(deps.provider(env, scope).create).toHaveBeenCalledTimes(1);
  });
  it.each(['actor', 'grant', 'provider', 'revision', 'token', 'confirmation', 'expiry'])('rejects %s drift before provider dispatch', async mode => {
    const input = await creation(); let selected = scope;
    if (mode === 'actor') selected = {...scope, subject: 'other'};
    if (mode === 'grant') selected = {...scope, grantRevision: 2};
    if (mode === 'provider') selected = {...scope, providerRevision: 'changed'};
    if (mode === 'revision') input.revision_id = crypto.randomUUID();
    if (mode === 'token') input.challenge = 'invalid-token';
    if (mode === 'confirmation') input.confirmation_hash = 'invalid-hash';
    if (mode === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    await Promise.allSettled([call('campaign_gate1_create', input, selected)]);
    expect(deps.provider(env, scope).create).not.toHaveBeenCalled();
  });
  it('fails closed if audit persistence fails', async () => {
    const input = await creation();
    await fixture.db.prepare("CREATE TRIGGER audit_down BEFORE INSERT ON m04_audit BEGIN SELECT RAISE(ABORT,'storage failed'); END").run();
    await expect(call('campaign_gate1_create', input)).rejects.toThrow('conflict');
    expect(deps.provider(env, scope).create).not.toHaveBeenCalled();
    expect(await store.operation(input.idempotency_key, scope)).toBeNull();
  });
  it('checks revoked permission immediately before dispatch', async () => {
    const input = await creation();await call('campaign_gate1_create',input);
    vi.mocked(deps.authorize).mockReset().mockRejectedValue(new Error('access_denied'));
    await process(input.idempotency_key);
    expect((await store.operation(input.idempotency_key,scope))?.status).toBe('rejected');
    expect(deps.provider(env, scope).create).not.toHaveBeenCalled();
  });
  it('records a failed preflight without dispatching creation', async () => {
    const input = await creation();await call('campaign_gate1_create',input);
    vi.mocked(deps.provider(env,scope).validate).mockRejectedValueOnce(new ProviderError('unavailable','google_response'));
    await process(input.idempotency_key);
    expect((await store.operation(input.idempotency_key,scope))?.status).toBe('rejected');
    expect(deps.provider(env,scope).create).not.toHaveBeenCalled();
  });
  it('reconciles an uncertain response with reads without duplicating creation', async () => {
    const input = await creation(), provider = deps.provider(env, scope);
    vi.mocked(provider.create).mockRejectedValueOnce(new ProviderError('unknown', 'lost_response'));
    expect((await call('campaign_gate1_create', input)).data?.status).toBe('reserved');
    await process(input.idempotency_key);
    await process(input.idempotency_key);
    expect((await call('campaign_gate1_create', input)).data?.duplicate_submission).toBe(true);
    expect((await call('campaign_operation_get', {service_id: scope.accountPageId, idempotency_key: input.idempotency_key})).outcome).toBe('success');
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
  it('never substitutes a demo after a real rejection', async () => {
    const input = await creation(); vi.mocked(deps.provider(env, scope).create).mockRejectedValueOnce(new ProviderError('rejected', 'validation'));
    await call('campaign_gate1_create',input);await process(input.idempotency_key);
    expect((await store.operation(input.idempotency_key, scope))?.status).toBe('rejected');
  });
  it('keeps activation, scheduling and resume unavailable', async () => {
    for (const tool of ['campaign_gate2_activate', 'campaign_creation_resume']) expect((await call(tool, {service_id: scope.accountPageId})).outcome).toBe('locked');
    expect(deps.provider(env, scope).create).not.toHaveBeenCalled();
  });
  it('keeps revisions and receipt identity immutable', async () => {
    const input = await creation(); await call('campaign_gate1_create', input);await process(input.idempotency_key);
    await expect(fixture.db.prepare('UPDATE m04_workflows SET plan_hash=? WHERE id=?').bind('changed', input.workflow_id).run()).rejects.toThrow('Immutable');
    await expect(fixture.db.prepare('UPDATE m04_operations SET subject=? WHERE id=?').bind('other', input.idempotency_key).run()).rejects.toThrow('Immutable');
    await expect(store.finish((await store.workflow(input.workflow_id, scope))!, input.idempotency_key, 'unknown', {})).rejects.toThrow();
  });
});
describe('provider and signed delegation', () => {
  it.each([search, demand])('builds dedicated atomic paused structures for %s', plan => {
    const ops = buildOperations(scope, plan, 'test-id');
    expect(ops[0].campaignBudgetOperation.create).toMatchObject({amountMicros: '10000000', explicitlyShared: false, period: 'DAILY'});
    expect(ops[1].campaignOperation.create.status).toBe('PAUSED');
    expect(ops[2].adGroupOperation.create.status).toBe('PAUSED');
    expect(ops.at(-1)!.adGroupAdOperation.create.status).toBe('PAUSED');
    expect(ops.every(op => Object.values(op).every((value: any) => !!value.create && !value.update && !value.remove))).toBe(true);
    if (plan.campaign_type === 'demand_gen') expect(ops[2].adGroupOperation.create).not.toHaveProperty('type');
  });
  it('rejects cross-account assets and invalid or incomplete briefs', () => {
    expect(() => buildOperations(scope, {...demand, audience: 'customers/9999999999/audiences/14'}, 'test')).toThrow('asset_ownership');
    expect(planSchema.safeParse({...search, headlines: ['one']}).success).toBe(false);
    expect(planSchema.safeParse({...search, campaign_type: 'performance_max'}).success).toBe(false);
  });
  it('does not retry a lost mutation response and disables partial failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({access_token: 'synthetic'})).mockRejectedValueOnce(new Error('lost'));
    const google = new Google(env, scope, fetcher);
    await expect(google.create(search, 'test')).rejects.toMatchObject({outcome: 'unknown'});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({partialFailure: false, validateOnly: false});
  });
  it('accepts only exact delegation scope, action, account and payload bindings', async () => {
    const input = {service_id: scope.accountPageId}, tool = 'campaign_templates_list', requestHash = await digest({tool, scope, input});
    const proof = await new SignJWT({...scope, action: tool, requestHash}).setProtectedHeader({alg: 'HS256'}).setIssuer('digitalbee').setAudience('https://m04.test').setSubject(scope.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(env.M04_DELEGATION_KEY));
    const request = new Request('https://m04.test/v1/mcp/campaign-creation/templates', {headers: {Authorization: `Bearer ${env.M04_SERVICE_TOKEN}`, 'X-DigitalBee-Delegation': proof, 'X-Connection-Revision': scope.connectionRevision}});
    expect(await authenticate(request, env, tool, input, requestHash)).toEqual(scope);
    await expect(authenticate(request, env, tool, {...input, changed: true}, requestHash)).rejects.toThrow();
    await expect(authenticate(request, {...env, M04_ENABLED: 'false'}, tool, input, requestHash)).rejects.toThrow();
    await expect(authenticate(request, {...env, M04_PILOT_ACCOUNT: '9999999999'}, tool, input, requestHash)).rejects.toThrow();
  });
});
