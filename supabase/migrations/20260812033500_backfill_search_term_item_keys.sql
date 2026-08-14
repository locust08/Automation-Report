begin;

update public.ad_automation_search_term_decisions as decision
set item_key =
  coalesce(item.value ->> 'campaignId', '') || '|' ||
  coalesce(item.value ->> 'adGroupId', '') || '|' ||
  lower(regexp_replace(btrim(coalesce(item.value ->> 'searchTerm', '')), '\s+', ' ', 'g'))
from public.ad_automation_search_term_analysis_runs as run
cross join lateral jsonb_array_elements(run.recommendations) with ordinality as item(value, position)
where decision.analysis_run_id = run.id
  and decision.item_key is null
  and decision.recommendation_key ~ '^\d+$'
  and item.position = decision.recommendation_key::bigint + 1;

commit;
