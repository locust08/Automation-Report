alter table public.ads_field_changes drop constraint if exists ads_field_changes_entity_type_check;
alter table public.ads_field_changes add constraint ads_field_changes_entity_type_check
  check (entity_type in ('campaign', 'ad_group', 'ad'));
