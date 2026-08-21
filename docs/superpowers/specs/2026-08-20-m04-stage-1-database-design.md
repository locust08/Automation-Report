# M04 Stage 1 Database Design

## Goal

Create the additive Supabase contract for M04 campaign planning and two-gate launch orchestration without implementing provider adapters, API routes, dashboard behavior, deployment, or live delivery.

The authoritative product contract is the live Notion module [M04 — Cross-Platform Campaign Planning and Launch](https://app.notion.com/p/3b14fcc4f70181a8be2dcaf0ae84da17) and the approved staged execution plan supplied for this branch. This design covers Stage 1 only.

## Selected approach

Use eleven normalized `public` tables, immutable evidence rows, and narrowly granted transactional database functions. Shared identifiers that M03 already anticipates use `bigint generated always as identity`; provider identifiers remain normalized text. A small set of denormalized revision columns enforces currency, date, allocation, account, and M03 invariants while the full platform-specific plan remains in JSONB for Stage 2 schemas.

All invariant-bearing writes go through service-role-only functions. Authenticated approved-domain operators receive read-only access through RLS; browser inserts, updates, deletes, and workflow RPC execution remain unavailable. Every function uses a blank search path and schema-qualified objects. External provider calls remain outside transactions.

Two alternatives were rejected:

1. Direct service-role CRUD plus triggers would make lock ordering, approval/hash binding, idempotency, and audit completeness depend on every caller.
2. A separate allocation-ledger or queue subsystem would add tables outside the approved Stage 1 contract before runtime evidence shows they are needed.

## Stage boundary

Included:

- eleven M04 tables, constraints, indexes, comments, RLS, policies, grants, and append-only protections;
- revision insertion and SHA-256 verification;
- atomic budget reservation and release;
- immutable approval/hash locking and initial build creation;
- expiring Gate 1/Gate 2 claims and idempotent retry acquisition;
- validated plan/build transitions and audit events;
- immutable QA evidence and final M05 handoff creation;
- M03 launch-eligibility compatibility; and
- pgTAP plus real two-session budget-concurrency tests.

Excluded:

- TypeScript campaign schemas and platform increment calculations;
- Google, Meta, or TikTok calls;
- API routes, feature flags, dashboard workflow, deployment, migration of a remote database, live advertising accounts, and M05 monitoring behavior.

## Data model

### Account and budget roots

`ads_ad_accounts` stores one normalized account with `id bigint`, `client_id uuid`, `platform`, `provider_account_id`, account name, ISO-style currency, IANA-style timezone text, access status/evidence/timestamps, and active state. `(platform, provider_account_id)` is unique. The platform is `google`, `meta`, or `tiktok`.

`ads_budget_packages` stores `client_id`, package key/name, currency, inclusive flight dates, positive envelope, committed amount, lifecycle status, and lock version. A check enforces `0 <= committed_amount <= envelope_amount` and `end_date >= start_date`.

### Plans, revisions, and approvals

`ads_campaign_plans` binds one client, package, ad account, platform, active revision, approved revision/hash, reservation, state, creator, timestamps, and lock version. Plans use these states:

```text
draft
awaiting_approval
approved
launch_in_progress
launched
cancelled
```

`ads_campaign_plan_revisions` is immutable and versioned per plan. It stores the client/account/package snapshot; platform and provider account; currency and timezone; inclusive dates; allocation, increment, daily budget, and projected total; objective and destination; complete payload JSONB; exact canonical JSON text; SHA-256 hash; author; and database timestamp. The database requires `canonical_json::jsonb = plan_payload` and recomputes the hash before insert.

`ads_campaign_approvals` is append-only. It binds the plan, revision, and hash; records an explicit decision, expiry, idempotency key, optional superseded approval, operator identity, trusted network context, and database time. A new active revision makes the plan's old approval pointer ineligible without rewriting approval history.

### Builds, resources, claims, and QA

`ads_campaign_builds` binds a plan, approved revision/hash, approval, package, and exact `ad_account_id bigint` required by M03. It stores Gate 1/Gate 2 and final readback state, delivery timing, verification evidence, timestamps, and lock version. States are:

```text
pending_gate_1
gate_1_in_progress
gate_1_failed
qa_failed
reconciliation_required
ready_to_deliver
gate_2_in_progress
gate_2_failed
delivery_unverified
verified
handoff_complete
cancelled
```

`ads_campaign_build_resources` maps a stable logical key to provider IDs. It preserves the M03 columns `build_id`, `resource_type`, `provider_resource_id`, and `verified_at`. A non-null provider ID cannot be replaced, verified mappings cannot regress, and hard deletes are rejected.

`ads_campaign_gate_attempts` stores one persisted intent/claim per attempt: build, gate, action, claim token, request idempotency key, retry parent, attempt number, approved revision/hash snapshot, status, intent, claim expiry, actor/network context, outcome, and error. A partial unique index permits one unreleased claim per build/gate; the function expires stale rows while holding the build lock.

`ads_campaign_qa_results` is append-only expected-versus-observed evidence for one attempt/resource/field. It distinguishes Gate 1, Gate 2, and reconciliation evidence and records match, mismatch, missing, unexpected, or error outcomes.

### Audit and handoff

`ads_campaign_audit_events` is immutable. Every row names at least one plan, revision, build, or attempt and stores the event, previous/next state, database-resolved operator, trusted IP/user-agent, metadata, and `clock_timestamp()`.

`ads_campaign_monitoring_handoffs` is immutable and unique by build. It contains only the client/platform/account identity, approved revision/hash, provider campaign and child IDs, dates, currency, allocation, final readback, and verification time needed by a future M05 implementation.

All evidence relationships use `ON DELETE RESTRICT`. No M04 workflow table uses cascading deletion to erase history.

## Security model

All eleven public tables enable RLS. `anon` receives no table privilege. `authenticated` receives `SELECT` only and only rows admitted by `ads_internal.is_approved_operator()`. That helper resolves `(select auth.uid())` through `auth.users` and active `ad_automation_report_users`, then requires an exact lowercased email domain of `locus-t.com.my` or `digitalbee.ai`. It does not use user-editable metadata.

Transactional public functions are `SECURITY DEFINER`, use `SET search_path = ''`, derive the actor email/name/role from the database, reject inactive or non-approved-domain actor IDs, revoke execute from `PUBLIC`, `anon`, and `authenticated`, and grant execute only to `service_role`. Mutable tables grant service-role access needed for provider receipt recording; immutable tables reject update/delete with an internal trigger.

## Transactional interfaces

```sql
public.ads_create_campaign_plan_revision(
  p_plan_id bigint,
  p_expected_plan_lock_version bigint,
  p_revision_payload jsonb,
  p_canonical_json text,
  p_expected_payload_hash text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_plan_revisions
```

```sql
public.ads_reserve_campaign_budget(
  p_plan_id bigint,
  p_revision_id bigint,
  p_expected_revision_hash text,
  p_expected_plan_lock_version bigint,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_plans
```

```sql
public.ads_release_campaign_budget(
  p_plan_id bigint,
  p_expected_plan_lock_version bigint,
  p_reason text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_plans
```

```sql
public.ads_approve_campaign_plan_revision(
  p_plan_id bigint,
  p_revision_id bigint,
  p_expected_revision_hash text,
  p_expected_plan_lock_version bigint,
  p_approval_expires_at timestamptz,
  p_request_idempotency_key text,
  p_comment text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_builds
```

```sql
public.ads_transition_campaign_plan(
  p_plan_id bigint,
  p_expected_lock_version bigint,
  p_expected_from_status text,
  p_to_status text,
  p_reason text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_plans
```

```sql
public.ads_acquire_campaign_gate_claim(
  p_build_id bigint,
  p_gate smallint,
  p_action text,
  p_request_idempotency_key text,
  p_expected_revision_id bigint,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_gate_attempts
```

```sql
public.ads_acquire_campaign_retry_claim(
  p_build_id bigint,
  p_prior_attempt_id bigint,
  p_request_idempotency_key text,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_gate_attempts
```

```sql
public.ads_record_campaign_resource_outcome(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_logical_resource_key text,
  p_outcome text,
  p_provider_resource_id text,
  p_provider_parent_resource_id text,
  p_provider_response jsonb,
  p_error_details jsonb
) returns public.ads_campaign_build_resources
```

```sql
public.ads_append_campaign_qa_result(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_build_resource_id bigint,
  p_phase text,
  p_field_path text,
  p_required boolean,
  p_expected_value jsonb,
  p_observed_value jsonb,
  p_result text,
  p_mismatch_code text,
  p_mismatch_detail text,
  p_readback_evidence jsonb
) returns public.ads_campaign_qa_results
```

```sql
public.ads_finalize_campaign_gate_claim(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_provider_outcome text,
  p_final_readback_evidence jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_builds
```

```sql
public.ads_create_campaign_monitoring_handoff(
  p_build_id bigint,
  p_expected_build_lock_version bigint,
  p_expected_revision_hash text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_campaign_monitoring_handoffs
```

## Locking and recovery

Budget functions lock the plan first and package second, calculate the reservation delta, and run a conditional update whose predicate keeps committed amount within the envelope. Repeating the same revision reservation is a no-op. Release is explicit and audited.

Claim functions lock the build, resolve an identical idempotency key first, expire stale claims, and insert the claim plus Gate 1 logical-resource intents before returning. A different active claim returns SQLSTATE `55P03`. Ambiguous outcomes enter `reconciliation_required`; they never become retryable mutation claims until readback records the resource as proven missing.

The generic transition function cannot set `ready_to_deliver`, `verified`, or `handoff_complete`. Gate finalization derives those sensitive states from persisted QA/readback evidence. `verified_at` on a campaign resource means final provider delivery readback, not Gate 1 QA.

Review hardening adds these invariants without changing any public function signature:

- Every operation on an existing build locks the build before the plan and never changes lock-order branches after taking its first row lock. A build has at most one active claim across both gates.
- Exact approval, gate-claim, and retry idempotency keys are identity-checked before mutable approval-expiry or workflow-state checks. They return only the already-persisted row; provider receipts and finalization still require a live claim token, and every new key requires the current unexpired approval.
- `ads_approve_campaign_plan_revision` may append a same-revision superseding approval for the exact existing nonterminal build in `approved` or `launch_in_progress`. Renewal requires a new key, a strictly later future expiry, unchanged plan/revision/hash/account/package identity, and creates no second build. It advances both plan and build locks. Verified, handed-off, and cancelled builds cannot be renewed.
- An approved plan must transition to `draft` or `cancelled`, atomically cancelling and auditing its exact `pending_gate_1` build, before budget release. Direct release from `approved` is rejected.
- `gate_1_failed` and `qa_failed` can acquire only Gate 1 reconciliation; `gate_2_failed` can acquire only Gate 2 reconciliation. No failed state permits a direct create, retry, or delivery shortcut.
- A partial retry may complete successfully while the build remains `gate_1_failed`. Gate 1 readiness is calculated over every persisted logical build resource using causal evidence after that resource's latest mutation; every resource requires a provider ID and an authoritative matching QA or later successful reconciliation result before the build becomes `ready_to_deliver`.
- Finalization and ambiguous-resource recording require the build to remain in the in-progress state for the attempt's gate. Ambiguous state changes append attributed audit evidence atomically.
- Monitoring handoff identity comes from the immutable approved revision and must match the locked build and launch-in-progress plan. Mutable account-directory values cannot rewrite the launch identity.

## M03 compatibility

M03 requires exact bigint joins and exact terminal state names. A verified M04 campaign is eligible only when:

- `ads_ad_accounts.id = ads_campaign_builds.ad_account_id`;
- the account `provider_account_id` matches the M03 account ID;
- a `campaign` build resource matches the provider campaign ID;
- that resource has non-null `verified_at`; and
- the build is `verified` or `handoff_complete`.

The existing M03 function is replaced additively without changing its two-text-argument signature, JSON result contract, ACL, or legacy-adoption precedence. Its dynamic verified-build query adds `account.platform = 'google'` so a coincident Meta/TikTok numeric ID cannot authorize a Google-only M03 change.

## Verification

The Stage 1 suite contains:

- `m04_schema_security.test.sql` for eleven-table shape, types, FKs, indexes, RLS, policies, table/function ACLs, and approved/blocked domains;
- `m04_workflow.test.sql` for revision immutability, hash mismatch, currency/date/access/budget blocks, approval expiry/supersession, transitions, and audit attribution;
- `m04_claims_handoff.test.sql` for claim idempotency/expiry, Gate 2 blocking, ambiguous outcomes, resource/QA immutability, delivery verification, and minimal handoff;
- `m04_m03_compatibility.test.sql` for legacy and verified-build eligibility without cross-platform false positives; and
- a PowerShell/psql two-session race proving two individually valid reservations cannot over-allocate one package.

The hardening verification additionally covers claim-versus-cancellation lock ordering in both winner orders, approval renewal and expiry recovery, failed-state reconciliation, full-intent subset-retry completion, build-wide claim exclusion, attributed ambiguity audit, immutable handoff identity, and successful generic database lifecycles for Meta and TikTok.

The repository has two pre-existing full-chain blockers: duplicate `20260805` migration versions and a historical migration that alters tables absent from the checked-in chain. Stage 1 does not rewrite deployed migration history. Focused tests therefore use a disposable local Supabase database with the required existing M03 contract followed by the generated M04 migration; the full-chain reset remains a separately reported baseline gap.

## Safety

No remote Supabase project is linked or mutated. No provider, advertising, Doppler, production, deployment, or live-delivery credential is required. `supabase/.temp/` remains ignored and uncommitted. No provider call exists in Stage 1, and no Notion progress checkbox is changed before the separately authorized Stage 7.
