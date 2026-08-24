-- M04-only forward compatibility for CampaignPlanV2. Existing immutable rows,
-- hashes, payloads, platform details, and audit data are not rewritten.

alter table public.m04_ads_meta_campaign_revision_details
  drop constraint acmrd_existing_post_eligibility;

create or replace function public.m04_ads_existing_post_eligibility_allowed(
  p_revision_id bigint,
  p_creative_specification jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when coalesce((revision.plan_payload ->> 'schema_version')::integer, 1) = 2
        then pg_catalog.jsonb_typeof(p_creative_specification -> 'eligibility_confirmed') = 'boolean'
      else pg_catalog.lower(coalesce(p_creative_specification ->> 'eligibility_confirmed', 'false')) = 'true'
    end
    from public.m04_ads_campaign_plan_revisions revision
    where revision.id = p_revision_id
  ), false);
$$;

revoke all on function public.m04_ads_existing_post_eligibility_allowed(bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.m04_ads_existing_post_eligibility_allowed(bigint, jsonb)
to service_role;

alter table public.m04_ads_meta_campaign_revision_details
  add constraint acmrd_existing_post_eligibility
  check (
    creative_format <> 'existing_post'
    or public.m04_ads_existing_post_eligibility_allowed(revision_id, creative_specification)
  ) not valid;

alter table public.m04_ads_meta_campaign_revision_details
  validate constraint acmrd_existing_post_eligibility;

alter table public.m04_ads_tiktok_campaign_revision_details
  drop constraint actrd_budget_mode;

create or replace function public.m04_ads_tiktok_budget_mode_allowed(
  p_revision_id bigint,
  p_budget_mode text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when coalesce((revision.plan_payload ->> 'schema_version')::integer, 1) = 2
        then p_budget_mode in ('daily', 'lifetime')
      else p_budget_mode = 'daily'
    end
    from public.m04_ads_campaign_plan_revisions revision
    where revision.id = p_revision_id
  ), false);
$$;

revoke all on function public.m04_ads_tiktok_budget_mode_allowed(bigint, text)
from public, anon, authenticated;
grant execute on function public.m04_ads_tiktok_budget_mode_allowed(bigint, text)
to service_role;

alter table public.m04_ads_tiktok_campaign_revision_details
  add constraint actrd_budget_mode
  check (public.m04_ads_tiktok_budget_mode_allowed(revision_id, budget_mode)) not valid;

alter table public.m04_ads_tiktok_campaign_revision_details
  validate constraint actrd_budget_mode;

-- The existing create RPC performs a second TikTok mode check before insert.
-- Widen only that V2 branch, while preserving the frozen V1 daily-only rule.
do $migration$
declare
  v_definition text;
  v_old text := 'or p_platform_detail ->> ''budget_mode'' is distinct from ''daily''';
  v_new text := 'or (coalesce((p_revision_payload ->> ''schema_version'')::integer, 1) = 1 and p_platform_detail ->> ''budget_mode'' is distinct from ''daily'') or (coalesce((p_revision_payload ->> ''schema_version'')::integer, 1) = 2 and (p_platform_detail ->> ''budget_mode'' is null or p_platform_detail ->> ''budget_mode'' not in (''daily'', ''lifetime'')))';
begin
  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'm04_ads_create_campaign_plan_draft'
    and p.pronargs = 11;

  if v_definition is null or pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'Expected M04 campaign creation RPC definition was not found';
  end if;

  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$migration$;
