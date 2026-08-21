create or replace function public.m04_ads_run_mock_workflow(
  p_plan_id bigint,
  p_actor_id uuid,
  p_request_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.m04_ads_campaign_plans%rowtype;
  v_revision public.m04_ads_campaign_plan_revisions%rowtype;
  v_approval public.m04_ads_campaign_approvals%rowtype;
  v_build public.m04_ads_campaign_builds%rowtype;
  v_gate_1 public.m04_ads_campaign_gate_attempts%rowtype;
  v_gate_2 public.m04_ads_campaign_gate_attempts%rowtype;
  v_resource public.m04_ads_campaign_build_resources%rowtype;
  v_actor_name text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_campaign_id text;
begin
  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Mock workflow idempotency key is required' using errcode='22023';
  end if;
  select actor_name into strict v_actor_name
  from m04_ads_internal.resolve_m04_actor(p_actor_id);
  select * into strict v_plan from public.m04_ads_campaign_plans where id=p_plan_id for update;
  select * into strict v_revision from public.m04_ads_campaign_plan_revisions
  where id=v_plan.active_revision_id and plan_id=v_plan.id;
  select * into v_build from public.m04_ads_campaign_builds where plan_id=v_plan.id and revision_id=v_revision.id;
  if found then
    return pg_catalog.jsonb_build_object('plan_id',v_plan.id,'build_id',v_build.id,'status',v_build.status,'mock',true);
  end if;
  if v_plan.status <> 'draft' then
    raise exception 'Mock workflow requires a draft plan' using errcode='55000';
  end if;

  update public.m04_ads_budget_packages set committed_amount=committed_amount+v_revision.allocated_budget,
    updated_at=v_now, lock_version=lock_version+1
  where id=v_plan.budget_package_id and status='active'
    and committed_amount+v_revision.allocated_budget <= envelope_amount;
  if not found then raise exception 'Mock workflow budget is unavailable' using errcode='23514'; end if;

  insert into public.m04_ads_campaign_approvals(
    plan_id,revision_id,revision_hash,decision,expires_at,request_idempotency_key,
    comment,approved_by_id,approved_by_name,trusted_user_agent
  ) values (v_plan.id,v_revision.id,v_revision.payload_hash,'approved',v_now+interval '24 hours',
    p_request_idempotency_key||':approval','Offline mock approval',p_actor_id,v_actor_name,'m04-offline-mock')
  returning * into v_approval;

  insert into public.m04_ads_campaign_builds(
    plan_id,revision_id,revision_hash,approval_id,budget_package_id,ad_account_id,platform,
    status,gate_1_started_at,gate_1_completed_at,gate_2_started_at,gate_2_completed_at,
    delivery_started_at,delivered_at,verified_at,final_readback_evidence
  ) values (v_plan.id,v_revision.id,v_revision.payload_hash,v_approval.id,v_plan.budget_package_id,
    v_plan.ad_account_id,v_plan.platform,'handoff_complete',v_now,v_now,v_now,v_now,v_now,v_now,v_now,
    pg_catalog.jsonb_build_object('mock',true,'delivery_status','simulated_active'))
  returning * into v_build;

  v_campaign_id := 'mock-'||v_plan.platform||'-campaign-'||v_build.id;
  perform pg_catalog.set_config('m04_ads_internal.gate_2_finalizer','on',true);
  insert into public.m04_ads_campaign_build_resources(
    build_id,logical_resource_key,resource_type,provider_resource_id,provider_response,verified_at
  ) values (v_build.id,'campaign','campaign',v_campaign_id,
    pg_catalog.jsonb_build_object('mock',true,'delivery_status','simulated_active'),v_now)
  returning * into v_resource;
  perform pg_catalog.set_config('m04_ads_internal.gate_2_finalizer','',true);

  insert into public.m04_ads_campaign_gate_attempts(
    build_id,gate,action,request_idempotency_key,attempt_number,revision_id,revision_hash,status,
    intent,claim_expires_at,released_at,actor_id,actor_name,trusted_user_agent,provider_outcome,outcome
  ) values (v_build.id,1,'create',p_request_idempotency_key||':gate1',1,v_revision.id,v_revision.payload_hash,
    'succeeded',pg_catalog.jsonb_build_object('mock',true),v_now+interval '5 minutes',v_now,p_actor_id,v_actor_name,
    'm04-offline-mock','created',pg_catalog.jsonb_build_object('mock',true,'provider_resource_id',v_campaign_id))
  returning * into v_gate_1;
  insert into public.m04_ads_campaign_qa_results(
    attempt_id,build_resource_id,phase,field_path,required,expected_value,observed_value,result,readback_evidence
  ) values (v_gate_1.id,v_resource.id,'gate_1','delivery.status',true,'"disabled"','"disabled"','match',
    pg_catalog.jsonb_build_object('mock',true));

  insert into public.m04_ads_campaign_gate_attempts(
    build_id,gate,action,request_idempotency_key,attempt_number,revision_id,revision_hash,status,
    intent,claim_expires_at,released_at,actor_id,actor_name,trusted_user_agent,provider_outcome,outcome
  ) values (v_build.id,2,'deliver',p_request_idempotency_key||':gate2',2,v_revision.id,v_revision.payload_hash,
    'succeeded',pg_catalog.jsonb_build_object('mock',true,'delivery_request','activate_now'),v_now+interval '5 minutes',
    v_now,p_actor_id,v_actor_name,'m04-offline-mock','delivered',pg_catalog.jsonb_build_object('mock',true,'delivery_status','simulated_active'))
  returning * into v_gate_2;
  insert into public.m04_ads_campaign_qa_results(
    attempt_id,build_resource_id,phase,field_path,required,expected_value,observed_value,result,readback_evidence
  ) values (v_gate_2.id,v_resource.id,'gate_2','delivery.status',true,'"simulated_active"','"simulated_active"','match',
    pg_catalog.jsonb_build_object('mock',true));

  insert into public.m04_ads_campaign_monitoring_handoffs(
    build_id,client_id,platform,ad_account_id,provider_account_id,revision_id,revision_hash,
    provider_campaign_id,provider_child_ids,start_date,end_date,currency,allocated_budget,
    final_readback_evidence,verified_at
  ) values (v_build.id,v_revision.client_id,v_plan.platform,v_plan.ad_account_id,v_revision.provider_account_id,
    v_revision.id,v_revision.payload_hash,v_campaign_id,'[]',v_revision.start_date,v_revision.end_date,
    v_revision.currency,v_revision.allocated_budget,pg_catalog.jsonb_build_object('mock',true,'published_to_m05',false),v_now);

  update public.m04_ads_campaign_plans set status='launched',approved_revision_id=v_revision.id,
    approved_revision_hash=v_revision.payload_hash,reserved_revision_id=v_revision.id,
    reserved_budget=v_revision.allocated_budget,updated_at=v_now,lock_version=lock_version+1 where id=v_plan.id;
  insert into public.m04_ads_campaign_audit_events(plan_id,revision_id,build_id,event_type,from_status,to_status,
    actor_id,actor_name,trusted_user_agent,metadata)
  values(v_plan.id,v_revision.id,v_build.id,'mock_workflow_completed','draft','launched',p_actor_id,v_actor_name,
    'm04-offline-mock',pg_catalog.jsonb_build_object('mock',true,'provider_calls',0));
  return pg_catalog.jsonb_build_object('plan_id',v_plan.id,'build_id',v_build.id,'status','handoff_complete','mock',true);
end;
$$;

revoke all on function public.m04_ads_run_mock_workflow(bigint,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.m04_ads_run_mock_workflow(bigint,uuid,text) to service_role;
