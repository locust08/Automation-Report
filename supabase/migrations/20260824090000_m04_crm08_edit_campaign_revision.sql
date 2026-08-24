create or replace function public.m04_ads_update_campaign_plan_draft(
  p_plan_id bigint,
  p_expected_plan_lock_version bigint,
  p_revision_payload jsonb,
  p_canonical_json text,
  p_expected_payload_hash text,
  p_platform_detail jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.m04_ads_campaign_plan_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.m04_ads_campaign_plan_revisions%rowtype;
begin
  select * into strict v_revision
  from public.m04_ads_create_campaign_plan_revision(
    p_plan_id, p_expected_plan_lock_version, p_revision_payload, p_canonical_json,
    p_expected_payload_hash, p_actor_id, p_trusted_ip, p_trusted_user_agent
  );

  if v_revision.platform = 'google' then
    insert into public.m04_ads_google_campaign_revision_details (
      revision_id, campaign_type, bidding_strategy, target_cpa, target_roas,
      network_settings, locations, languages, conversion_action,
      campaign_structure, creative_specification, tracking
    ) values (
      v_revision.id, p_platform_detail ->> 'campaign_type', p_platform_detail ->> 'bidding_strategy',
      nullif(p_platform_detail ->> 'target_cpa', '')::numeric(20,6),
      nullif(p_platform_detail ->> 'target_roas', '')::numeric(20,6),
      p_platform_detail -> 'network_settings', p_platform_detail -> 'locations',
      p_platform_detail -> 'languages', p_platform_detail ->> 'conversion_action',
      p_platform_detail -> 'campaign_structure', p_platform_detail -> 'creative_specification',
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  elsif v_revision.platform = 'meta' then
    insert into public.m04_ads_meta_campaign_revision_details (
      revision_id, objective, buying_type, conversion_location, optimization_goal,
      billing_event, pixel_id, conversion_event, placements, audience,
      creative_format, creative_specification, tracking
    ) values (
      v_revision.id, p_platform_detail ->> 'objective', p_platform_detail ->> 'buying_type',
      p_platform_detail ->> 'conversion_location', p_platform_detail ->> 'optimization_goal',
      p_platform_detail ->> 'billing_event', p_platform_detail ->> 'pixel_id',
      p_platform_detail ->> 'conversion_event', p_platform_detail -> 'placements',
      p_platform_detail -> 'audience', p_platform_detail ->> 'creative_format',
      p_platform_detail -> 'creative_specification',
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  elsif v_revision.platform = 'tiktok' then
    insert into public.m04_ads_tiktok_campaign_revision_details (
      revision_id, objective, campaign_type, budget_mode, optimization_goal,
      pixel_id, conversion_event, placements, targeting, identity_type,
      identity_name, creative_type, video_id, ad_text, call_to_action, spark_ad, tracking
    ) values (
      v_revision.id, p_platform_detail ->> 'objective', p_platform_detail ->> 'campaign_type',
      p_platform_detail ->> 'budget_mode', p_platform_detail ->> 'optimization_goal',
      nullif(p_platform_detail ->> 'pixel_id', ''), p_platform_detail ->> 'conversion_event',
      p_platform_detail -> 'placements', p_platform_detail -> 'targeting',
      p_platform_detail ->> 'identity_type', p_platform_detail ->> 'identity_name',
      p_platform_detail ->> 'creative_type', p_platform_detail ->> 'video_id',
      p_platform_detail ->> 'ad_text', p_platform_detail ->> 'call_to_action',
      coalesce((p_platform_detail ->> 'spark_ad')::boolean, false),
      coalesce(p_platform_detail -> 'tracking', '{}'::jsonb)
    );
  else
    raise exception 'Unsupported campaign platform' using errcode = '22023';
  end if;

  return v_revision;
end;
$$;

revoke all on function public.m04_ads_update_campaign_plan_draft(
  bigint, bigint, jsonb, text, text, jsonb, uuid, inet, text
) from public, anon, authenticated, service_role;

grant execute on function public.m04_ads_update_campaign_plan_draft(
  bigint, bigint, jsonb, text, text, jsonb, uuid, inet, text
) to service_role;
