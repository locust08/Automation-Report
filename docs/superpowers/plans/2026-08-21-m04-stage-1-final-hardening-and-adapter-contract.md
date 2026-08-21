# M04 Stage 1 Final Hardening and Campaign-Creation Adapter Contract Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining M04 Stage 1 database and local-verification defects while leaving a stable, provider-neutral database contract that future Google, Meta, and TikTok campaign-creation adapters can consume without redesigning workflow integrity.

**Architecture:** M04 remains the sole owner of plans, immutable revisions, approvals, build state, claims, provider-resource receipts, QA, launch verification, audit, and M03 handoff. Future provider adapters remain server-side consumers of the existing service-role RPCs; platform-specific campaign fields stay in `ads_campaign_plan_revisions.plan_payload`, and platform resource graphs use stable logical keys in `ads_campaign_build_resources`. No provider adapter, API route, UI, deployment, or live provider call is implemented in this plan.

**Tech Stack:** Supabase CLI 2.115.0, PostgreSQL 17, PL/pgSQL, JSONB, pgTAP, PowerShell 5.1, psql 18.

**Spec:** `docs/superpowers/specs/2026-08-20-m04-stage-1-database-design.md`

## Global Constraints

- Work only on `M04-Cross-Platform-Campaign-Planning-and-Launch` from clean checkpoint `f7282a896a412c602d6387ccf9079d76b5a28b01` or its direct descendants.
- Stage 1 only: Supabase schema/functions, database tests, local runners, and human-facing database integration documentation.
- Do not implement Google, Meta, or TikTok campaign creation, provider adapters, API routes, dashboard code, M03 post-launch behavior, M05 behavior, or Stage 2 campaign schemas.
- Preserve all current public M04 RPC names, argument types, return types, `SECURITY DEFINER`, empty `search_path`, and service-role-only execute grants.
- Preserve the eleven-table normalized schema unless a failing test proves a column is indispensable; prefer versioned JSON contracts over provider-specific tables.
- Platform-specific plan data belongs in immutable `plan_payload`; provider IDs and graph identity belong in `ads_campaign_build_resources` using stable `(build_id, logical_resource_key)` identity and extensible non-empty `resource_type` values.
- Every future creation adapter must use the RPC sequence documented in `README_campaign_creation.md`; direct workflow-table mutation is unsupported.
- Use only disposable local Supabase projects. Never link or mutate a remote project, use provider credentials, deploy, merge, activate delivery, or apply a production migration.
- Never use `git add .`, destructive Git commands, history rewriting, force push, or commit `supabase/.temp/`.
- Every production behavior change follows RED → GREEN. Test/setup/parser failures do not count as behavioral RED.
- Cleanup failures in local runners are fatal and must preserve diagnostics rather than report a green result.

---

### Task 1: Fail-closed claim snapshots and complete cross-platform delivery evidence

**Files:**
- Modify: `supabase/tests/m04_claims_handoff.test.sql`
- Modify: `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- Modify: `supabase/tests/concurrency/m04_state_enhanced_setup.psql`
- Modify: `supabase/tests/concurrency/m04_state_enhanced_assert.psql`
- Modify: `scripts/test-m04-state-concurrency.ps1`
- Create: `supabase/tests/concurrency/m04_expiry_boundary_blocker.psql`
- Create: `supabase/tests/concurrency/m04_expiry_boundary_rpc.psql`
- Modify: `docs/superpowers/specs/2026-08-20-m04-stage-1-database-design.md`

**Interfaces:**
- Consumes: existing build → plan lock order, immutable revision/build identity, service-role-only public RPCs, and generic resource rows.
- Produces: fail-closed claim/retry validation, one captured lease clock, versioned Gate 2 intent evidence, complete-resource verification, and complete handoff.
- Preserves: all public signatures, table columns, grants, RLS, M03 eligibility signature/result, and provider-neutral resource types.

- [ ] **Step 1: Write NULL-outcome regressions**

Add pgTAP cases proving SQL `NULL` is rejected by `ads_record_campaign_resource_outcome` with SQLSTATE `22023` and message `Provider resource outcome is invalid`, and by `ads_finalize_campaign_gate_claim` with SQLSTATE `22023` and message `Gate provider outcome is invalid`. Include a fully otherwise-ready Gate 2 fixture and snapshot plan/build/approval/attempt/resource/QA/audit/handoff/M03-eligibility state so each rejection is side-effect free.

- [ ] **Step 2: Verify the NULL tests RED for the intended unsafe branch**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite claims
```

Expected: only the new NULL cases fail because SQL three-valued logic lets `NULL NOT IN (...)` bypass the guards. Parser/setup failures must be repaired without editing production SQL.

- [ ] **Step 3: Implement explicit NULL guards and verify focused GREEN**

Change both outcome guards to test `IS NULL OR ... NOT IN (...)`. Do not change accepted non-null vocabularies or any public signature. Re-run the claims suite and require every assertion to pass.

- [ ] **Step 4: Write immutable launch-snapshot drift regressions**

For Gate 1 claim, Gate 2 claim, and Gate 1 retry, add table-driven new-key cases for each drift below. Every case must assert SQLSTATE `55000`, exact message `Campaign build immutable launch snapshot is no longer current`, and unchanged plan/build/approval/attempt/resource/QA/audit/handoff/M03-eligibility snapshots:

- account inactive;
- account access not `verified`;
- null account `access_verified_at`;
- account client, provider account ID, platform, currency, or timezone differs from the approved revision/build/plan snapshot;
- package inactive;
- package client, currency, or inclusive flight differs from the revision;
- plan reserved revision differs from the approved revision;
- plan reserved budget differs from `revision.allocated_budget`;
- package committed amount is below the plan reservation.

Add exact-key replay-before-drift cases proving an already persisted request returns the same attempt without creating or authorizing a new mutation.

- [ ] **Step 5: Verify snapshot drift RED**

Run the focused claims suite. Expected: new-key drift cases fail because current claim/retry helpers validate approval pointers but not the complete account/package/reservation snapshot; exact historical replay cases remain green.

- [ ] **Step 6: Implement one internal immutable-snapshot validator**

Add one non-public `ads_internal` helper or one shared SQL block used identically by gate and retry helpers after exact idempotency replay and after build → plan locking. It must compare the locked build/plan with immutable revision, current account, and current package in one MVCC statement, use `IS DISTINCT FROM` for nullable safety, and raise only the exact drift error above. Keep account/revision/package reads non-mutating and do not introduce a lock order that conflicts with plan → package budget functions. Revoke helper execution from `PUBLIC`, `anon`, `authenticated`, and `service_role`.

- [ ] **Step 7: Verify snapshot drift GREEN**

Run the focused claims suite and require all old and new assertions to pass. Confirm exact-key replay still precedes mutable drift validation.

- [ ] **Step 8: Write deterministic expiry-boundary races**

Add gate and retry two-session fixtures. A neutral blocker holds a table lock on `ads_campaign_gate_attempts` that permits the helper's pre-update read but blocks its update. The real RPC must acquire its normal build/plan locks, be proven directly blocked through `pg_stat_activity` plus `pg_blocking_pids`, cross the existing claim expiry according to database time, then resume. Persist one structured marker per child with case, role, SQLSTATE, message, result ID, and native exit. The fixed contract is an unchanged active Gate 1 claim, no new attempt/result, and exact `55P03` `A different active gate claim already exists`; it must never route the build into Gate 2 or mutation retry.

- [ ] **Step 9: Verify expiry-boundary RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-state-concurrency.ps1 -Iterations 1
```

Expected: only the new boundary cases fail behaviorally because separate `clock_timestamp()` calls split expired-attempt identity from the update decision. No timeout, parser, setup, or cleanup failure qualifies.

- [ ] **Step 10: Capture one claim timestamp and verify concurrency GREEN**

Capture one `v_now := clock_timestamp()` after idempotency resolution and build → plan locking in both gate and retry helpers. Use it consistently for approval expiry, expired-attempt selection/update, release timestamps, and new lease base. Re-run the one-iteration state suite and the claims suite; require exact expected markers and zero remaining local resources.

- [ ] **Step 11: Write the versioned Gate 2 manifest regressions**

Use this database contract for new Gate 2 delivery claims:

```json
{
  "schema": "m04.gate2.v1",
  "platform": "meta",
  "delivery": { "mode": "activate_now" },
  "resources": [
    {
      "logical_resource_key": "campaign.main",
      "resource_type": "campaign",
      "required_fields": {
        "delivery.status": "active"
      }
    }
  ]
}
```

The `platform` must equal the immutable build platform. `delivery.mode` is `activate_now` or `schedule`; scheduled delivery also requires a non-empty RFC3339 `scheduled_at`. The resources array must be a duplicate-free exact key/type cover of every persisted build resource. Each `required_fields` value is a non-empty JSON object and must include `delivery.status`; adapters may add provider/campaign-type fields such as schedule, budget, targeting, creative, parent, asset-group, or tracking readbacks. Gate 2 reconciliation must repeat the exact latest Gate 2 delivery manifest.

Add invalid cases for empty/legacy `{}` intent, wrong schema/platform/mode, missing or extra resource, duplicate key/type, empty required fields, missing `delivery.status`, and reconciliation manifest drift.

- [ ] **Step 12: Write complete-resource QA/finalization/handoff regressions**

Require Gate 2 receipt and required QA to name a non-null resource inside the attempt manifest. A required QA field must exist in that resource's `required_fields`, its `expected_value` must equal the manifest value, and an authorizing match must carry the same observed value plus non-empty-object evidence. Optional extra QA may persist but cannot authorize verification.

Create realistic generic resource graphs:

- Google Search: campaign → ad group → ad, while also proving extensible types can represent Performance Max asset groups/assets without schema changes;
- Meta: campaign → ad set → ad;
- TikTok: campaign → ad group → ad.

For Meta and TikTok, first prove campaign-only Gate 2 evidence leaves the build `delivery_unverified` with no handoff. Then append complete current-attempt evidence for every declared field of every resource, finalize to `verified`, assert one identical captured `verified_at` on all persisted resources, and assert the handoff contains exactly the one campaign ID plus every non-campaign provider ID ordered by logical key. Include later-negative, stale-attempt, null-resource, undeclared-field, missing-child-ID, and mismatched expected-value cases.

- [ ] **Step 13: Verify Gate 2 RED and implement minimal generic completeness helpers**

Run the claims suite and confirm failures expose the current campaign-exists shortcut and partial `verified_at` update. Implement internal validation/readiness helpers over existing JSONB and rows; do not add provider-specific tables or public RPCs. Gate 2 verification must select latest QA per `(resource, field_path)` within the current attempt/phase and require every manifest field to match. Update all persisted resources atomically with one timestamp and verify the update count. Handoff must reject any missing provider ID or mismatched/null verification timestamp.

- [ ] **Step 14: Verify focused and default GREEN**

Run claims, M03 compatibility, one-iteration state concurrency, and default three-iteration state concurrency. Require all assertions/races to pass, no `40P01`/`57014`, exact child exits/markers, successful exact project stop, and zero project containers/processes/temp roots.

- [ ] **Step 15: Update the design and commit Task 1 explicitly**

Correct active-claim uniqueness to one active claim per build. Document the captured expiry clock, immutable launch-snapshot check, `m04.gate2.v1`, complete-resource verification/handoff, SQL-NULL failure, and provider-neutral future adapter boundary. Stage only Task 1 paths and commit:

```text
fix(m04): enforce complete launch evidence
```

---

### Task 2: Fail-closed local runners and exact concurrency outcomes

**Files:**
- Modify: `scripts/test-m04-stage1.ps1`
- Modify: `scripts/test-m04-budget-concurrency.ps1`
- Modify: `scripts/test-m04-state-concurrency.ps1`
- Modify: `supabase/tests/concurrency/m04_budget_setup.psql`
- Modify: `supabase/tests/concurrency/m04_budget_session.psql`
- Modify: `supabase/tests/concurrency/m04_budget_assert.psql`
- Modify: `docs/superpowers/specs/2026-08-20-m04-stage-1-database-design.md`

**Interfaces:**
- Consumes: pinned CLI 2.115.0, generated project IDs, validated `%TEMP%` roots, hidden psql children, and localhost port 54322.
- Produces: cleanup that cannot report success when stop/child/container/temp cleanup fails, and exact native budget-race outcome evidence.

- [ ] **Step 1: Add observable runner-failure checks before changing cleanup**

Use a synthetic hidden child plus an intentional local migration/test-body failure to prove the current runners can lose native child-exit evidence or delete diagnostics after body/stop failure. Do not sabotage Docker or a real stop command. Record the exact current failure behavior in the task report.

- [ ] **Step 2: Implement one fail-closed cleanup contract in all runners**

Capture primary and cleanup errors separately; continue all safe cleanup; aggregate errors at exit. Validate the temp parent equals the system temp directory, the leaf exactly matches the generated prefix plus 32 lowercase hex characters, the directory is not a reparse point, and copied `config.toml` has exactly the generated project ID before start and stop. Track every child by process object, PID, and start time; bounded-wait, kill only the tracked object when necessary, then prove exit. Make `supabase stop --no-backup`, exact project-container absence, tracked-child absence, and validated literal-path deletion mandatory. Preserve and print the diagnostic root on any body or cleanup failure.

- [ ] **Step 3: Replace budget regex inference with exact structured results**

Every child emits exactly one committed marker:

```text
M04_BUDGET_RACE_RESULT case=<case> role=<role> sqlstate=<state> message=<message> result_id=<id-or-none>
```

Success requires native exit `0`, SQLSTATE `00000`, `message=none`, numeric result ID, and no error. The loser requires native exit `3`, SQLSTATE `23514`, exact message `Budget package does not have enough available allocation`, no result ID, and exactly one synthetic same-SQLSTATE rethrow after its marker is committed. Reject duplicate/missing markers, extra errors, `40P01`, `57014`, null exits, or any other outcome. Database assertions independently require one winner, one exact loser, one 60 reservation, and committed 60 of 100.

- [ ] **Step 4: Require every state RPC to be directly blocked**

Replace `bool_or` lock proof with exact backend/application-name cardinalities plus `bool_and(wait_event_type = 'Lock' AND blocker_pid = ANY(pg_blocking_pids(pid)))`. Apply the same helper to parallel approval, transition snapshot, neutral lock probes, and expiry-boundary probes.

- [ ] **Step 5: Verify failure paths and GREEN paths**

First invoke one intentional Stage 1 body failure through a bad local migration path and require nonzero exit, exact project stop/container absence, and retained diagnostics. Then run Stage 1 all, budget default five races, state one iteration, and state default three iterations sequentially. Remove only diagnostics from successful runs; keep failed-run diagnostics until their exact project/container/PID state has been audited.

- [ ] **Step 6: Update safety documentation and commit Task 2 explicitly**

Document exact markers, native exits, direct blockers, fail-closed cleanup, and diagnostic retention. Stage only Task 2 paths and commit:

```text
test(m04): fail closed local verification
```

---

### Task 3: Campaign-creation integration map and exact catalog coverage

**Files:**
- Create: `README_campaign_creation.md`
- Modify: `supabase/tests/m04_schema_security.test.sql`
- Modify: `supabase/tests/m04_workflow.test.sql`
- Modify: `.superpowers/sdd/2026-08-20-m04-stage-1-database/task-3-hardening-2-report.md`
- Modify locally only: `.superpowers/sdd/2026-08-20-m04-stage-1-database/progress.md`

**Interfaces:**
- Produces: a human-facing provider-adapter database contract and exact catalog regressions for the existing schema/security surface.
- Preserves: no provider code, no Stage 2 schemas, no new public RPC, and no direct-table-write recommendation.

- [ ] **Step 1: Strengthen schema and workflow catalog tests**

Expand the schema suite to compare all eleven tables' ordered column names, PostgreSQL types, nullability/defaults, PK/unique/FK/check definitions, FK targets/delete actions, index key/predicate definitions, RLS flags, policies, and exact table ACLs. Expand workflow function ACL checks across all five workflow RPCs and retain service-role-only execution with no grant option and no `PUBLIC`/`anon`/`authenticated` execution.

- [ ] **Step 2: Run schema/workflow tests before production changes**

These are coverage improvements, so they should pass the existing production schema. Any failure must be classified as a newly exposed catalog defect and fixed only if it violates the approved Stage 1 contract.

- [ ] **Step 3: Write `README_campaign_creation.md`**

Keep it concise and implementation-oriented. It must state:

- M04 owns orchestration through verified launch; M03 owns post-launch change/rollback; future provider creation modules are clients of M04 rather than replacements for either module.
- The eleven-table relationship map and which columns are immutable snapshots versus mutable operational state.
- Platform-specific campaign data belongs in immutable `plan_payload`; shared columns carry client/account/package/platform/currency/timezone/flight/budget identity.
- Stable resource examples for Google Search, Performance Max/Demand Gen extensions, Meta campaign/ad-set/ad, and TikTok campaign/ad-group/ad. Unknown future types remain valid non-empty text; adapters must keep logical keys deterministic within a build.
- Exact service-role RPC sequence for Gate 1 create/readback/finalize, reconciliation/retry, Gate 2 deliver/readback/finalize, and handoff.
- Complete `m04.gate2.v1` JSON example plus Gate 1 resource intent example.
- Idempotency, claim lease, immediate provider-ID receipt, ambiguity, proof-of-missing retry, expected/observed QA, all-resource verification, and handoff rules.
- Direct table writes, browser service credentials, provider calls inside database transactions, provider-specific duplicate workflow tables, and treating an HTTP/provider timeout as a safe retry are prohibited.

- [ ] **Step 4: Update durable hardening evidence and commit Task 3 explicitly**

Append the production and runner RED/GREEN evidence, exact test counts/projects, integration-contract decisions, and residual risks. Keep the progress ledger ignored. Stage the README, catalog tests, and tracked report explicitly and commit:

```text
docs(m04): define campaign creation database contract
```

---

### Task 4: Fresh Stage 1 acceptance and durable Task 5 report

**Files:**
- Create: `.superpowers/sdd/2026-08-20-m04-stage-1-database/task-5-report.md`
- Modify only if verification exposes an in-scope defect: files owned by Tasks 1–3.

**Interfaces:**
- Produces: fresh acceptance evidence for the final commit set and a durable local-only handoff.

- [ ] **Step 1: Run all focused suites on fresh disposable projects**

Run claims, schema, workflow, M03, and combined `-Suite all`. Record assertion counts, exact generated project IDs/temp roots, migration exit, stop exit, and zero exact child/container/temp inventory.

- [ ] **Step 2: Run both concurrency suites**

Run budget default five races and state default three iterations plus the enhanced matrix. Require exact markers/native exits, no deadlock/timeout markers, stop exit zero, and exact cleanup.

- [ ] **Step 3: Run held same-database migration, tests, and lint**

Start a unique migration-free local project. Apply the curated M03 prerequisite, M04 migration, and all pgTAP tests on the same explicit localhost database. Run pinned CLI `db lint --level error --fail-on error` and require exit zero with an empty results array. Stop/delete only that validated project/root.

- [ ] **Step 4: Record the honest repository full-chain baseline**

On a separate unique project, copy all repository migrations with identical hashes only after startup and run exact `db reset --local --no-seed`. Record the pre-M04 missing search-term table and duplicate `20260805` version if unchanged. Do not modify historical migrations.

- [ ] **Step 5: Run repository static and range checks**

Run `npm run typecheck`, `npm run lint`, PowerShell parser checks for every M04 runner, `git diff --check`, public signature/return/security/ACL comparison against `f7282a8`, prohibited-path inventory, branch/commit inventory, and final exact process/container/temp/port audit.

- [ ] **Step 6: Write and commit the Task 5 report**

Record every exact command/result, project ID, test count, lint payload, baseline blocker, cleanup proof, changed-path inventory, no-provider/no-remote evidence, and residual risks. Force-add only this ignored tracked report path if necessary. Commit:

```text
docs(m04): record final stage 1 verification
```

- [ ] **Step 7: Request one whole-branch review**

Package the full range from `f7282a8` to final HEAD. Review requirements, database/security/lock correctness, provider-neutral integration readiness, runner safety, docs, and scope. Fix any confirmed Critical/Important issue through one scoped fix wave and one scoped re-review. Stop before Stage 2, provider integration, deployment, merge, or Notion Stage 7.
