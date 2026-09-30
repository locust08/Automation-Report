/** Safe categories only: never return credentials or raw provider error messages. */
export function campaignBlocker(code:string){
 const messages:Record<string,string>={
  stale_revision:'The source or saved revision changed. Refresh readiness and save a new immutable draft.',
  provider_creation_disabled:'Provider creation is disabled. Readiness and draft planning remain available.',
  meta_rate_limited:'Meta rate limit reached. Wait before checking readiness again; no automatic retry was sent.',
  tiktok_rate_limited:'TikTok rate limit reached. Wait before checking readiness again; no automatic retry was sent.',
  meta_connection:'Connect the Meta advertising account before checking campaign readiness.',
  tiktok_connection:'Connect the TikTok advertiser before checking campaign readiness.',
  meta_no_eligible_source:'No supported same-account Meta source ad was found in the bounded scan. Select an eligible existing ad.',
  tiktok_no_eligible_source:'No supported same-account TikTok source ad was found. Select a reusable video or currently authorized existing Spark video post and review the source diagnostics.',
  tiktok_discovery_incomplete:'More TikTok sources remain. Continue readiness with references.discovery.next_cursor before concluding that no eligible source exists.',
  tiktok_discovery_cursor:'The TikTok discovery cursor is invalid, expired or belongs to another scope. Restart readiness.',
  tiktok_discovery_changed:'The TikTok source catalog changed during discovery. Restart readiness.',
  tiktok_coverage:'TikTok account enumeration exceeds the verified coverage bound or returned invalid pagination. No complete-source claim was made; select an exact source ad.',
  tiktok_asset_review:'The selected TikTok video or identity could not be verified for this advertiser. Select authorized assets.',
  tiktok_asset_coverage:'TikTok returned malformed or incomplete asset coverage for the unresolved source. Creation stays blocked; verify that source before continuing. Do not automatically repeat a continuation that made no progress.',
  tiktok_budget_floor_unverified:'Verify the minimum daily budget for this advertiser and currency before creation.',
  meta_form_unavailable:'The source Meta lead form is not active or does not belong to the verified Page. Choose an active same-Page form.',
  meta_source_changed:'The Meta source, currency, timezone or minimum budget changed. Refresh and validate a new draft.',
  tiktok_source_or_budget_changed:'The TikTok source, currency, timezone or minimum budget changed. Refresh and validate a new draft.',
  meta_budget_floor:'Meta minimum daily budget could not be validated within the supported budget bound.',
  meta_currency_units_unsupported:'The Meta currency unit scale is not verified for this currency. Creation stays blocked until its provider unit conversion is supported.',
  meta_deadline:'Meta readiness reached its request deadline. Select a source ad or retry later.',
  tiktok_deadline:'TikTok readiness reached its request deadline. Completed source checks are retained, but the unresolved source must be verified before continuing. Do not automatically repeat a continuation that made no progress.',
 };
 const safe=/^(meta|tiktok)_[a-z0-9_]+$/.test(code)||['provider_creation_disabled','stale_revision'].includes(code);
 return {field:'readiness',code:safe?code:'request_failed',message:messages[code]??'Provider readiness could not be verified. Review the reported issue before creating a campaign.'};
}
