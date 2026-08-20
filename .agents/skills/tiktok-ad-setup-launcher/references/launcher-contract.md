# TikTok launcher contract

## Two distinct drafts

- Planning draft: a locally stored media-plan revision with no TikTok object IDs.
- Platform draft: campaign, ad groups, and ads created in TikTok with `operation_status = DISABLE` and GET-verified.

The setup apply step produces the platform draft. It does not publish or enable delivery.

## Integrity-bound receipt

The receipt path is:

```text
outputs/state/tiktok_ads/setup_launcher/receipt_<revisionId>.json
```

The immutable revision, compiled setup, and launcher receipt all use `schemaVersion = 3`; earlier schemas are rejected rather than migrated during a launch. The launcher writes receipts atomically with mode `0600`, flushes the receipt file, atomically renames it, and flushes its parent directory before any provider POST. Its integrity hash binds together:

- immutable revision ID and hash;
- deterministic compiled-operation hash;
- exact fresh live advertiser ID, name, currency, and timezone;
- stable operation keys (`campaign`, `adgroup:<key>`, `ad:<key>`);
- provider resource IDs and deterministic operation-scoped provider request IDs;
- payload hashes, the expected values of the closed approved field sets enumerated below, verification request IDs, step states, and transition timestamps;
- an independently hashed, expiring activation preview.

Schema version 3 also binds the hard Search Placement-off invariant at every layer: the revision contains `searchResultEnabled = false`, the compiled ad-group operation contains `search_result_enabled: false`, and the compile, receipt-integrity, and activation material hashes cover that exact boolean.

The receipt is storage-neutral and can later be persisted through an approved repository adapter. The v1 launcher itself does not call Notion or Supabase.

## Exclusive revision lock

Preview, create, activation preview, and activation each hold one exclusive lock for the complete receipt read–provider operation–atomic write sequence. The lock is scoped to the immutable revision ID, and only its owner token may replace the receipt. A concurrent writer fails closed before submitting a POST.

The operating-system/SQLite lock is authoritative. If a process crashes, its kernel lock is released automatically. A later command may recover a stale owner marker only after it has acquired the exclusive lock, preventing time-based lock stealing from a live writer. The same durable SQLite transaction records whether the revision has ever initialized a receipt. First-time preview requires the explicit `--initialize-new-receipt` flag. If the initialization marker exists but the JSON receipt is missing, the launcher stops for manual provider reconciliation and never silently creates a replacement receipt.

This SQLite lock plus local JSON receipt is safe only for one process space on one persistent host when every participating process shares the same persistent filesystem. The launcher requires an explicit execution-mode declaration. The CLI value `--execution-mode single-persistent-host` maps to that supported boundary. An absent mode, `MULTI_HOST_OR_EPHEMERAL`, serverless runtime, horizontally scaled deployment, multi-host deployment, or ephemeral filesystem fails closed before receipt use or provider mutation.

Multi-host execution requires a shared transactional lock-and-receipt backend that provides one atomic per-revision writer boundary across every host. That backend must be implemented, reviewed, and tested before multi-host setup or activation is enabled; a shared object store without transactional locking is insufficient.

## Advertiser and schedule binding

At all four gates—preview, create, activation preview, and activate—the launcher performs a forced-fresh advertiser lookup for the exact revision advertiser ID. It requires exactly one live row and an exact match on ID, name, currency, and IANA timezone. Missing, duplicate, unrelated, or mismatched results stop the operation.

The builder stores advertiser-local calendar dates. During compilation, the launcher converts local start-of-day and end-of-day boundaries through the advertiser's IANA timezone into TikTok's required UTC+0 strings. The conversion is daylight-saving-aware. A schedule edit changes the revision and requires new approval; the launcher never rewrites an approved date to fit a stale receipt.

## Create state machine

| State | Meaning | Safe automatic next action |
| --- | --- | --- |
| `NOT_STARTED` | No POST was submitted. | Persist `ATTEMPTING`, then submit one POST. |
| `ATTEMPTING` | The intent was persisted but no response ID is safely stored. | Stop as ambiguous; manual reconciliation. |
| `CREATED_UNVERIFIED` | A provider ID is stored but GET verification did not complete. | Retry GET only. |
| `VERIFIED` | GET returned the exact provider ID, `operation_status = DISABLE`, and every applicable field in the closed approved material set. | Continue to the next dependent object. |
| `AMBIGUOUS` | The outcome cannot be proven from the receipt. | Stop; never retry POST automatically. |

The launcher writes `ATTEMPTING` before every POST. It stores the returned resource ID before GET verification. This makes a partial build resumable without duplicate create calls: verified steps are reused, and created-but-unverified steps receive GET only.

## Activation state machine

Activation is unavailable until every create step is `VERIFIED`. Activation preview performs a fresh GET readback of the closed approved field sets below, requires all resources to remain disabled and every applicable approved field to equal the compiled revision, then hashes the exact provider IDs, approved field values, and status payloads with `previewedAt` and `expiresAt`. An expired preview cannot authorize activation; create a new preview from current provider state.

The activation order is:

1. all ads;
2. all ad groups;
3. campaign last.

This keeps the parent campaign disabled until all child objects have been enabled and verified. Immediately before each status POST, the launcher checks the preview expiry and freshly verifies the exact resource ID, expected status, and every applicable field in the closed approved set. Immediately before the campaign-last enable POST, it rereads the complete graph: every ad and ad group must already be enabled and unchanged, while the campaign must still be disabled and unchanged. Activation uses `NOT_STARTED`, `ATTEMPTING`, `APPLIED_UNVERIFIED`, `VERIFIED`, and `AMBIGUOUS` states with the same rule: an uncertain POST is never automatically retried; `APPLIED_UNVERIFIED` resumes through GET only. After all steps verify, one final GET pass must confirm every resource is enabled and every applicable approved field is unchanged before the receipt can enter `ACTIVE`.

`ACTIVE` in this receipt means the requested primary operation status was GET-verified as enabled for every object. TikTok policy review and secondary delivery eligibility remain provider-controlled and should be synced separately before describing delivery as live.

## Payload contract

- Campaign: manual objective, no campaign budget optimization, disabled.
- Ad group: TikTok placement, `search_result_enabled = false`, validated targeting, dynamic daily budget, smooth pacing, approved objective settings, custom creative mode, UTC+0 schedule boundaries, disabled.
- Ad: one regular single-video creative with the approved identity, video, text, CTA, and objective destination, disabled.
- Status: exact provider ID arrays and `operation_status = ENABLE`.

The compiler assigns a deterministic provider `request_id` to each create operation from the immutable revision hash plus its stable operation key. Identical-looking ads or ad groups therefore retain distinct provider idempotency keys. The low-level preparer preserves that request ID and strips the launcher-only objective helper from child payloads. The shared client attempts each POST once.

V1 supports only `TRAFFIC`, `WEB_CONVERSIONS`, and `LEAD_GENERATION`. Every ad group uses `BUDGET_MODE_DYNAMIC_DAILY_BUDGET`. The approved allocation must cover the builder's conservative 125% provider budget envelope. That envelope is neither expected spend nor a provider-side hard cap. `VIDEO_VIEWS` remains fail-closed because its dynamic daily mode is allowlist-only and V1 excludes lifetime budgets.

## Closed approved material field set

Provider resource ID and `operation_status` are checked separately and must match exactly. Material authorization is limited to the following closed field sets. For each revision branch, every listed field that is applicable to the compiled operation must be present in the GET response and equal the compiled approved value. Arrays are compared canonically. A missing field, type change, boolean coercion, or value change is drift and fails closed.

- Campaign: `campaign_name`, `objective_type`, `budget_optimize_on`, and `special_industries` when included by the normalized revision.
- Ad group core and dependency: `campaign_id`, `adgroup_name`, `placement_type`, `placements`, `search_result_enabled`, `location_ids`, `gender`, `budget_mode`, `budget`, `schedule_type`, `schedule_start_time`, `schedule_end_time`, `bid_type`, `pacing`, and `creative_material_mode`.
- Ad group approved optional targeting: `age_groups`, `languages`, `interest_category_ids`, and `audience_ids` when included by the normalized revision.
- Ad group objective branch: `promotion_type`, `optimization_goal`, and `billing_event`; plus `promotion_target_type` for lead generation, and `pixel_id` and `optimization_event` for website-conversion or website-lead branches.
- Ad core and dependency: `adgroup_id`, `ad_name`, `ad_format`, `identity_type`, `identity_id`, `video_id`, `ad_text`, and `call_to_action`.
- Ad destination branch: `landing_page_url` for a website destination or `page_id` for an Instant Form destination.

`search_result_enabled` is always applicable to every supported ad group and must be the boolean `false` at create verification, activation preview, every pre-enable verification, resumed GET-only verification, and final enabled verification. It is never treated as optional.

Provider-generated operational metadata outside this set—such as review, delivery, timestamps, diagnostics, and other read-only provider fields—may be ignored for material equality. No targeting, budget, schedule, identity, creative, or destination field outside this enumerated set may be silently accepted as approval input; expanding the material contract requires a new reviewed schema and corresponding tests.

## Official provider references

Checked 2026-08-18 against current TikTok for Business documentation:

- [Campaign creation overview](https://business-api.tiktok.com/portal/docs/campaign-creation/v1.3)
- [Create a Manual Campaign](https://business-api.tiktok.com/portal/docs/create-a-campaign-guide/v1.3)
- [Create an ad group](https://business-api.tiktok.com/gateway/docs/index?doc_id=1739499616346114&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)
- [Create an ad](https://business-api.tiktok.com/portal/docs/create-an-ad/v1.3)
- [Update campaign operation statuses](https://business-api.tiktok.com/portal/docs/update-the-operation-statuses-of-campaigns/v1.3)

Provider enums, availability, budget minima, and account capabilities can change. A live preview must revalidate the selected account and assets, and a provider contract change requires a reviewed schema/test update.
