-- M04 Stage 2 local draft storage. This migration is deliberately additive:
-- it does not alter the existing M04 core or any provider/workflow table.

create table public.ads_google_campaign_revision_details (
  revision_id bigint primary key
    constraint acgrd_revision_fk
    references public.ads_campaign_plan_revisions(id) on delete restrict,
  campaign_type text not null
    constraint acgrd_campaign_type
    check (campaign_type in ('search', 'performance_max', 'demand_gen')),
  bidding_strategy text not null
    constraint acgrd_bidding_strategy
    check (bidding_strategy in (
      'maximize_clicks',
      'maximize_conversions',
      'target_cpa',
      'maximize_conversion_value',
      'target_roas'
    )),
  target_cpa numeric(20,6),
  target_roas numeric(20,6),
  network_settings jsonb not null default '{}'::jsonb,
  locations jsonb not null,
  languages jsonb not null,
  conversion_action text not null,
  campaign_structure jsonb not null,
  creative_specification jsonb not null,
  tracking jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint acgrd_bid_targets check (
    (bidding_strategy = 'target_cpa' and target_cpa > 0 and target_roas is null)
    or (bidding_strategy = 'target_roas' and target_roas > 0 and target_cpa is null)
    or (bidding_strategy not in ('target_cpa', 'target_roas') and target_cpa is null and target_roas is null)
  ),
  constraint acgrd_campaign_bidding check (
    (campaign_type = 'search')
    or (campaign_type in ('performance_max', 'demand_gen') and bidding_strategy in (
      'maximize_conversions', 'target_cpa', 'maximize_conversion_value', 'target_roas'
    ))
  ),
  constraint acgrd_network_object check (pg_catalog.jsonb_typeof(network_settings) = 'object'),
  constraint acgrd_locations_array check (
    pg_catalog.jsonb_typeof(locations) = 'array'
    and pg_catalog.jsonb_array_length(locations) > 0
  ),
  constraint acgrd_languages_array check (
    pg_catalog.jsonb_typeof(languages) = 'array'
    and pg_catalog.jsonb_array_length(languages) > 0
  ),
  constraint acgrd_conversion_action check (pg_catalog.btrim(conversion_action) <> ''),
  constraint acgrd_structure_object check (
    pg_catalog.jsonb_typeof(campaign_structure) = 'object'
    and campaign_structure <> '{}'::jsonb
  ),
  constraint acgrd_creative_object check (
    pg_catalog.jsonb_typeof(creative_specification) = 'object'
    and creative_specification <> '{}'::jsonb
  ),
  constraint acgrd_tracking_object check (pg_catalog.jsonb_typeof(tracking) = 'object')
);

create table public.ads_meta_campaign_revision_details (
  revision_id bigint primary key
    constraint acmrd_revision_fk
    references public.ads_campaign_plan_revisions(id) on delete restrict,
  objective text not null
    constraint acmrd_objective
    check (objective in ('traffic', 'leads', 'sales')),
  buying_type text not null
    constraint acmrd_buying_type
    check (buying_type = 'auction'),
  conversion_location text not null
    constraint acmrd_conversion_location
    check (conversion_location = 'website'),
  optimization_goal text not null
    constraint acmrd_optimization_goal
    check (optimization_goal in (
      'landing_page_views', 'link_clicks', 'offsite_conversions'
    )),
  billing_event text not null
    constraint acmrd_billing_event
    check (billing_event = 'impressions'),
  pixel_id text not null,
  conversion_event text not null,
  placements jsonb not null,
  audience jsonb not null,
  creative_format text not null
    constraint acmrd_creative_format
    check (creative_format in ('image', 'video', 'carousel', 'existing_post')),
  creative_specification jsonb not null,
  tracking jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint acmrd_pixel check (pg_catalog.btrim(pixel_id) <> ''),
  constraint acmrd_event check (pg_catalog.btrim(conversion_event) <> ''),
  constraint acmrd_placements_object check (
    pg_catalog.jsonb_typeof(placements) = 'object'
    and placements <> '{}'::jsonb
    and coalesce((
      placements ->> 'mode' = 'automatic'
      or (
        placements ->> 'mode' = 'manual'
        and pg_catalog.jsonb_typeof(placements -> 'values') = 'array'
        and pg_catalog.jsonb_array_length(placements -> 'values') > 0
      )
    ), false)
  ),
  constraint acmrd_audience_object check (
    pg_catalog.jsonb_typeof(audience) = 'object'
    and audience <> '{}'::jsonb
  ),
  constraint acmrd_creative_object check (
    pg_catalog.jsonb_typeof(creative_specification) = 'object'
    and creative_specification <> '{}'::jsonb
    and coalesce(creative_specification ->> 'format' = creative_format, false)
  ),
  constraint acmrd_existing_post_eligibility check (
    creative_format <> 'existing_post'
    or pg_catalog.lower(coalesce(creative_specification ->> 'eligibility_confirmed', 'false')) = 'true'
  ),
  constraint acmrd_tracking_object check (pg_catalog.jsonb_typeof(tracking) = 'object')
);

create table public.ads_tiktok_campaign_revision_details (
  revision_id bigint primary key
    constraint actrd_revision_fk
    references public.ads_campaign_plan_revisions(id) on delete restrict,
  objective text not null
    constraint actrd_objective
    check (objective in ('traffic', 'web_conversions', 'lead_generation')),
  campaign_type text not null
    constraint actrd_campaign_type
    check (campaign_type = 'auction'),
  budget_mode text not null
    constraint actrd_budget_mode
    check (budget_mode = 'daily'),
  optimization_goal text not null,
  pixel_id text not null,
  conversion_event text not null,
  placements jsonb not null,
  targeting jsonb not null,
  identity_type text not null
    constraint actrd_identity_type
    check (identity_type = 'regular'),
  identity_name text not null,
  creative_type text not null
    constraint actrd_creative_type
    check (creative_type = 'single_video'),
  video_id text not null,
  ad_text text not null,
  call_to_action text not null,
  spark_ad boolean not null default false
    constraint actrd_non_spark check (not spark_ad),
  tracking jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint actrd_optimization_goal check (
    optimization_goal in ('click', 'landing_page_view', 'complete_payment', 'lead')
  ),
  constraint actrd_pixel_configuration check (pg_catalog.btrim(pixel_id) <> ''),
  constraint actrd_event check (pg_catalog.btrim(conversion_event) <> ''),
  constraint actrd_placements_object check (
    pg_catalog.jsonb_typeof(placements) = 'object'
    and placements <> '{}'::jsonb
    and coalesce((
      placements ->> 'mode' = 'automatic'
      or (
        placements ->> 'mode' = 'manual'
        and placements -> 'values' = '["tiktok"]'::jsonb
      )
    ), false)
  ),
  constraint actrd_targeting_object check (
    pg_catalog.jsonb_typeof(targeting) = 'object'
    and targeting <> '{}'::jsonb
  ),
  constraint actrd_identity check (pg_catalog.btrim(identity_name) <> ''),
  constraint actrd_video check (pg_catalog.btrim(video_id) <> ''),
  constraint actrd_copy check (pg_catalog.btrim(ad_text) <> ''),
  constraint actrd_cta check (
    call_to_action in ('learn_more', 'shop_now', 'sign_up', 'apply_now')
  ),
  constraint actrd_tracking_object check (pg_catalog.jsonb_typeof(tracking) = 'object')
);

create trigger acgrd_append_only
before update or delete on public.ads_google_campaign_revision_details
for each row execute function ads_internal.reject_m04_row_mutation();

create trigger acmrd_append_only
before update or delete on public.ads_meta_campaign_revision_details
for each row execute function ads_internal.reject_m04_row_mutation();

create trigger actrd_append_only
before update or delete on public.ads_tiktok_campaign_revision_details
for each row execute function ads_internal.reject_m04_row_mutation();

alter table public.ads_google_campaign_revision_details enable row level security;
alter table public.ads_meta_campaign_revision_details enable row level security;
alter table public.ads_tiktok_campaign_revision_details enable row level security;

revoke all on table public.ads_google_campaign_revision_details
  from public, anon, authenticated, service_role;
revoke all on table public.ads_meta_campaign_revision_details
  from public, anon, authenticated, service_role;
revoke all on table public.ads_tiktok_campaign_revision_details
  from public, anon, authenticated, service_role;

grant select on table public.ads_google_campaign_revision_details to service_role;
grant select on table public.ads_meta_campaign_revision_details to service_role;
grant select on table public.ads_tiktok_campaign_revision_details to service_role;

create or replace function public.ads_create_campaign_plan_draft(
  p_client_id uuid,
  p_ad_account_id bigint,
  p_budget_package_id bigint,
  p_platform text,
  p_revision_payload jsonb,
  p_canonical_json text,
  p_expected_payload_hash text,
  p_platform_detail jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns table (
  plan_id bigint,
  revision_id bigint,
  revision_number integer,
  platform text,
  payload_hash text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_account public.ads_ad_accounts%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_payload_hash text;
  v_start_date date;
  v_end_date date;
  v_allocated_budget numeric(20,6);
  v_increment_amount numeric(20,6);
  v_daily_budget numeric(20,6);
  v_projected_total numeric(20,6);
  v_objective text;
  v_destination text;
  v_flight_days integer;
  v_platform_budget_increment numeric(20,6);
  v_expected_daily_budget numeric(20,6);
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  if p_client_id is null or p_ad_account_id is null or p_budget_package_id is null then
    raise exception 'Client, ad account, and budget package are required'
      using errcode = '22023';
  end if;

  if p_platform is null or p_platform not in ('google', 'meta', 'tiktok') then
    raise exception 'Unsupported campaign platform' using errcode = '22023';
  end if;

  if p_revision_payload is null
    or pg_catalog.jsonb_typeof(p_revision_payload) <> 'object'
    or p_canonical_json is null
    or p_canonical_json::jsonb <> p_revision_payload then
    raise exception 'Canonical JSON does not match the revision payload'
      using errcode = '22023';
  end if;

  if p_platform_detail is null or pg_catalog.jsonb_typeof(p_platform_detail) <> 'object' then
    raise exception 'Platform revision detail must be a JSON object'
      using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_canonical_json, 'UTF8'), 'sha256'),
    'hex'
  );

  if p_expected_payload_hash is null or v_payload_hash <> p_expected_payload_hash then
    raise exception 'Revision payload hash does not match canonical JSON'
      using errcode = '22023';
  end if;

  if p_revision_payload ->> 'platform' is distinct from p_platform then
    raise exception 'Revision payload platform does not match the requested platform'
      using errcode = '22023';
  end if;

  if (p_revision_payload ->> 'client_id')::uuid is distinct from p_client_id
    or (p_revision_payload ->> 'ad_account_id')::bigint is distinct from p_ad_account_id
    or (p_revision_payload ->> 'budget_package_id')::bigint is distinct from p_budget_package_id then
    raise exception 'Revision payload ownership identifiers do not match the request'
      using errcode = '22023';
  end if;

  -- Keep the same package-then-account lock order used by budget operations.
  select package.*
  into v_package
  from public.ads_budget_packages as package
  where package.id = p_budget_package_id
  for update;

  if not found then
    raise exception 'Budget package was not found' using errcode = 'P0002';
  end if;

  select account.*
  into v_account
  from public.ads_ad_accounts as account
  where account.id = p_ad_account_id
  for share;

  if not found then
    raise exception 'Ad account was not found' using errcode = 'P0002';
  end if;

  if v_account.client_id <> p_client_id
    or v_package.client_id <> p_client_id
    or v_account.platform <> p_platform then
    raise exception 'Client, account, package, and platform ownership must match'
      using errcode = '22023';
  end if;

  if not v_account.is_active
    or v_account.access_status <> 'verified'
    or v_account.access_verified_at is null then
    raise exception 'A verified active ad account is required' using errcode = '55000';
  end if;

  if v_package.status <> 'active' then
    raise exception 'An active budget package is required' using errcode = '55000';
  end if;

  if v_account.currency <> v_package.currency then
    raise exception 'Ad account and budget package currencies must match'
      using errcode = '22023';
  end if;

  if p_revision_payload ->> 'provider_account_id' is distinct from v_account.provider_account_id
    or p_revision_payload ->> 'currency' is distinct from v_account.currency
    or p_revision_payload ->> 'timezone' is distinct from v_account.timezone then
    raise exception 'Revision payload account metadata does not match the selected account'
      using errcode = '22023';
  end if;

  v_start_date := (p_revision_payload ->> 'start_date')::date;
  v_end_date := (p_revision_payload ->> 'end_date')::date;
  v_allocated_budget := (p_revision_payload ->> 'allocated_budget')::numeric(20,6);
  v_increment_amount := (p_revision_payload ->> 'increment_amount')::numeric(20,6);
  v_daily_budget := (p_revision_payload ->> 'daily_budget')::numeric(20,6);
  v_projected_total := (p_revision_payload ->> 'projected_total')::numeric(20,6);
  v_objective := p_revision_payload ->> 'objective';
  v_destination := p_revision_payload ->> 'destination';

  if v_start_date is null or v_end_date is null
    or v_start_date < v_package.start_date
    or v_end_date > v_package.end_date
    or v_end_date < v_start_date then
    raise exception 'Draft dates must fall within the budget package flight'
      using errcode = '22023';
  end if;

  if v_allocated_budget is null or v_allocated_budget <= 0
    or v_increment_amount is null or v_increment_amount < 0
    or v_daily_budget is null or v_daily_budget <= 0
    or v_projected_total is null or v_projected_total <= 0
    or pg_catalog.btrim(coalesce(v_objective, '')) = ''
    or pg_catalog.btrim(coalesce(v_destination, '')) = '' then
    raise exception 'Revision payload contains invalid planning values'
      using errcode = '22023';
  end if;

  if v_allocated_budget > v_package.envelope_amount - v_package.committed_amount then
    raise exception 'Budget package does not have enough available allocation'
      using errcode = '23514';
  end if;

  v_flight_days := (v_end_date - v_start_date) + 1;
  v_platform_budget_increment := case p_platform
    when 'google' then 0.01
    when 'meta' then 0.01
    else 1.00
  end;
  v_expected_daily_budget :=
    pg_catalog.floor((v_allocated_budget / v_flight_days) / v_platform_budget_increment)
    * v_platform_budget_increment;

  if v_daily_budget <> v_expected_daily_budget
    or v_projected_total <> v_daily_budget * v_flight_days
    or v_projected_total > v_allocated_budget
    or v_increment_amount <> 0 then
    raise exception 'Daily budget and projected total are not deterministic for the inclusive flight'
      using errcode = '22023';
  end if;

  if p_platform = 'google' then
    if v_objective not in ('sales', 'leads', 'website_traffic')
      or p_platform_detail ->> 'campaign_type' not in ('search', 'performance_max', 'demand_gen')
      or not coalesce((
        (
          p_platform_detail ->> 'campaign_type' = 'search'
          and p_revision_payload #>> '{placements,inventory}' = 'google_search'
          and p_platform_detail #>> '{creative_specification,format}' = 'responsive_search_ad'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,google_search}', 'false')) = 'true'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,search_partners}', 'missing')) in ('true', 'false')
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,display_network}', 'missing')) = 'false'
        )
        or (
          p_platform_detail ->> 'campaign_type' = 'performance_max'
          and p_revision_payload #>> '{placements,inventory}' = 'all_google_inventory'
          and p_platform_detail #>> '{creative_specification,format}' = 'performance_max_asset_group'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,google_search}', 'missing')) = 'false'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,search_partners}', 'missing')) = 'false'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,display_network}', 'missing')) = 'false'
        )
        or (
          p_platform_detail ->> 'campaign_type' = 'demand_gen'
          and p_revision_payload #>> '{placements,inventory}' = 'discover_youtube_gmail'
          and p_platform_detail #>> '{creative_specification,format}' = 'demand_gen_asset'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,google_search}', 'missing')) = 'false'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,search_partners}', 'missing')) = 'false'
          and pg_catalog.lower(coalesce(p_platform_detail #>> '{network_settings,display_network}', 'missing')) = 'false'
        )
      ), false) then
      raise exception 'Unsupported Google V1 campaign combination' using errcode = '22023';
    end if;
  elsif p_platform = 'meta' then
    if v_objective not in ('traffic', 'leads', 'sales')
      or p_platform_detail ->> 'objective' is distinct from v_objective
      or p_platform_detail ->> 'buying_type' is distinct from 'auction'
      or p_platform_detail ->> 'conversion_location' is distinct from 'website'
      or not coalesce((
        (
          v_objective = 'traffic'
          and p_platform_detail ->> 'optimization_goal' in ('landing_page_views', 'link_clicks')
          and p_platform_detail ->> 'conversion_event' = 'view_content'
        )
        or (
          v_objective = 'leads'
          and p_platform_detail ->> 'optimization_goal' = 'offsite_conversions'
          and p_platform_detail ->> 'conversion_event' = 'lead'
        )
        or (
          v_objective = 'sales'
          and p_platform_detail ->> 'optimization_goal' = 'offsite_conversions'
          and p_platform_detail ->> 'conversion_event' = 'purchase'
        )
      ), false) then
      raise exception 'Unsupported Meta V1 campaign combination' using errcode = '22023';
    end if;
  else
    if v_objective not in ('traffic', 'web_conversions', 'lead_generation')
      or p_platform_detail ->> 'objective' is distinct from v_objective
      or p_platform_detail ->> 'campaign_type' is distinct from 'auction'
      or p_platform_detail ->> 'budget_mode' is distinct from 'daily'
      or p_platform_detail ->> 'identity_type' is distinct from 'regular'
      or p_platform_detail ->> 'creative_type' is distinct from 'single_video'
      or pg_catalog.lower(p_platform_detail ->> 'spark_ad') is distinct from 'false'
      or not coalesce((
        (
          v_objective = 'traffic'
          and p_platform_detail ->> 'optimization_goal' in ('click', 'landing_page_view')
          and p_platform_detail ->> 'conversion_event' = 'page_view'
        )
        or (
          v_objective = 'web_conversions'
          and p_platform_detail ->> 'optimization_goal' = 'complete_payment'
          and p_platform_detail ->> 'conversion_event' = 'purchase'
        )
        or (
          v_objective = 'lead_generation'
          and p_platform_detail ->> 'optimization_goal' = 'lead'
          and p_platform_detail ->> 'conversion_event' = 'submit_form'
        )
      ), false) then
      raise exception 'Unsupported TikTok V1 campaign combination' using errcode = '22023';
    end if;
  end if;

  insert into public.ads_campaign_plans (
    client_id,
    budget_package_id,
    ad_account_id,
    platform,
    status,
    created_by_id,
    created_by_name,
    created_at,
    updated_at,
    lock_version
  ) values (
    p_client_id,
    p_budget_package_id,
    p_ad_account_id,
    p_platform,
    'draft',
    p_actor_id,
    v_actor_name,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    0
  )
  returning * into v_plan;

  insert into public.ads_campaign_plan_revisions (
    plan_id,
    revision_number,
    client_id,
    ad_account_id,
    budget_package_id,
    platform,
    provider_account_id,
    currency,
    timezone,
    start_date,
    end_date,
    allocated_budget,
    increment_amount,
    daily_budget,
    projected_total,
    objective,
    destination,
    plan_payload,
    canonical_json,
    payload_hash,
    created_by_id,
    created_by_name,
    created_at
  ) values (
    v_plan.id,
    1,
    p_client_id,
    v_account.id,
    v_package.id,
    p_platform,
    v_account.provider_account_id,
    v_account.currency,
    v_account.timezone,
    v_start_date,
    v_end_date,
    v_allocated_budget,
    v_increment_amount,
    v_daily_budget,
    v_projected_total,
    v_objective,
    v_destination,
    p_revision_payload,
    p_canonical_json,
    v_payload_hash,
    p_actor_id,
    v_actor_name,
    pg_catalog.clock_timestamp()
  )
  returning * into v_revision;

  if p_platform = 'google' then
    insert into public.ads_google_campaign_revision_details (
      revision_id,
      campaign_type,
      bidding_strategy,
      target_cpa,
      target_roas,
      network_settings,
      locations,
      languages,
      conversion_action,
      campaign_structure,
      creative_specification,
      tracking
    ) values (
      v_revision.id,
      p_platform_detail ->> 'campaign_type',
      p_platform_detail ->> 'bidding_strategy',
      nullif(p_platform_detail ->> 'target_cpa', '')::numeric(20,6),
      nullif(p_platform_detail ->> 'target_roas', '')::numeric(20,6),
      p_platform_detail -> 'network_settings',
      p_platform_detail -> 'locations',
      p_platform_detail -> 'languages',
      p_platform_detail ->> 'conversion_action',
      p_platform_detail -> 'campaign_structure',
      p_platform_detail -> 'creative_specification',
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  elsif p_platform = 'meta' then
    insert into public.ads_meta_campaign_revision_details (
      revision_id,
      objective,
      buying_type,
      conversion_location,
      optimization_goal,
      billing_event,
      pixel_id,
      conversion_event,
      placements,
      audience,
      creative_format,
      creative_specification,
      tracking
    ) values (
      v_revision.id,
      p_platform_detail ->> 'objective',
      p_platform_detail ->> 'buying_type',
      p_platform_detail ->> 'conversion_location',
      p_platform_detail ->> 'optimization_goal',
      p_platform_detail ->> 'billing_event',
      p_platform_detail ->> 'pixel_id',
      p_platform_detail ->> 'conversion_event',
      p_platform_detail -> 'placements',
      p_platform_detail -> 'audience',
      p_platform_detail ->> 'creative_format',
      p_platform_detail -> 'creative_specification',
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  else
    insert into public.ads_tiktok_campaign_revision_details (
      revision_id,
      objective,
      campaign_type,
      budget_mode,
      optimization_goal,
      pixel_id,
      conversion_event,
      placements,
      targeting,
      identity_type,
      identity_name,
      creative_type,
      video_id,
      ad_text,
      call_to_action,
      spark_ad,
      tracking
    ) values (
      v_revision.id,
      p_platform_detail ->> 'objective',
      p_platform_detail ->> 'campaign_type',
      p_platform_detail ->> 'budget_mode',
      p_platform_detail ->> 'optimization_goal',
      nullif(p_platform_detail ->> 'pixel_id', ''),
      p_platform_detail ->> 'conversion_event',
      p_platform_detail -> 'placements',
      p_platform_detail -> 'targeting',
      p_platform_detail ->> 'identity_type',
      p_platform_detail ->> 'identity_name',
      p_platform_detail ->> 'creative_type',
      p_platform_detail ->> 'video_id',
      p_platform_detail ->> 'ad_text',
      p_platform_detail ->> 'call_to_action',
      coalesce((p_platform_detail ->> 'spark_ad')::boolean, false),
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  end if;

  update public.ads_campaign_plans
  set active_revision_id = v_revision.id,
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id
  returning * into v_plan;

  perform ads_internal.append_campaign_audit(
    v_plan.id,
    v_revision.id,
    null,
    null,
    'campaign_plan_draft_created',
    null,
    'draft',
    p_actor_id,
    p_trusted_ip,
    p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'revision_number', v_revision.revision_number,
      'payload_hash', v_revision.payload_hash,
      'platform_detail_table', case p_platform
        when 'google' then 'ads_google_campaign_revision_details'
        when 'meta' then 'ads_meta_campaign_revision_details'
        else 'ads_tiktok_campaign_revision_details'
      end
    )
  );

  return query
  select
    v_plan.id,
    v_revision.id,
    v_revision.revision_number,
    v_revision.platform,
    v_revision.payload_hash,
    v_plan.status;
end;
$$;

revoke all on function public.ads_create_campaign_plan_draft(
  uuid, bigint, bigint, text, jsonb, text, text, jsonb, uuid, inet, text
) from public, anon, authenticated, service_role;

grant execute on function public.ads_create_campaign_plan_draft(
  uuid, bigint, bigint, text, jsonb, text, text, jsonb, uuid, inet, text
) to service_role;
