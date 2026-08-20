# M04 Stage 1 Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and locally verify the complete Stage 1 Supabase contract for M04 while preserving M03 and stopping before Stage 2.

**Architecture:** One generated additive migration creates eleven RLS-protected tables plus private helpers and service-role-only transactional functions. Four pgTAP suites prove schema/security/workflow/claim/M03 behavior, and a two-session PowerShell runner proves budget concurrency against a disposable local Supabase database.

**Tech Stack:** Supabase CLI 2.115.0, PostgreSQL 17, PL/pgSQL, pgcrypto, pgTAP, PowerShell, psql 18.

**Spec:** `docs/superpowers/specs/2026-08-20-m04-stage-1-database-design.md`

## Global Constraints

- Work only on `M04-Cross-Platform-Campaign-Planning-and-Launch`.
- Stage 1 only: schema, constraints/indexes, RLS/grants, append-only protections, transactional functions, database tests, and M03 compatibility.
- Do not modify provider adapters, API routes, dashboard code, M03 post-launch behavior, or M05 implementation.
- Use only additive migrations; never apply a production or remote migration.
- Never use production credentials, live advertising accounts, deployment, merge, or delivery activation.
- Keep provider and Supabase service credentials server-only; authenticated browser access is read-only and approved-domain restricted.
- Preserve all unrelated work. Never use `git add .`, destructive Git commands, history rewriting, or force push.
- Keep `supabase/.temp/` uncommitted.
- All public functions use `SECURITY DEFINER`, `SET search_path = ''`, schema-qualified objects, and service-role-only execute grants.
- M03 compatibility requires bigint account/build IDs, exact resource columns, and build status `verified` or `handoff_complete`.

---

### Task 1: Local harness, schema, RLS, and grants

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- Create: `supabase/tests/m04_schema_security.test.sql`
- Create: `supabase/tests/fixtures/m04_m03_prerequisites.sql`
- Create: `scripts/test-m04-stage1.ps1`

**Interfaces:**
- Produces: all eleven tables and their exact columns/keys/checks/indexes.
- Produces: `ads_internal.is_approved_operator()` and immutable-row trigger helpers.
- Produces: a disposable local runner that applies the M03 prerequisite fixture, M04 migration, and selected pgTAP paths without remote access.

- [ ] **Step 1: Write the failing schema/security test**

Create pgTAP assertions for all eleven tables, bigint IDs, M03 columns, primary/foreign keys, status checks, foreign-key indexes, RLS flags, approved-domain SELECT, denied-domain SELECT, denied authenticated writes, anon denial, and service-role/function grants. Use deterministic auth IDs and set claims with:

```sql
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000041","email":"operator@locus-t.com.my","role":"authenticated"}';
```

- [ ] **Step 2: Add the disposable local test runner and verify RED**

The runner must resolve CLI 2.115.0, create a temp Supabase workdir, start only a local disposable database, apply `m04_m03_prerequisites.sql` and the empty M04 migration with `ON_ERROR_STOP=1`, then run the selected pgTAP file through `supabase test db --db-url`. It must never use `--linked` or a remote project.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite schema
```

Expected: FAIL because the eleven tables do not exist.

- [ ] **Step 3: Implement the eleven-table DDL**

Create the exact model and states from the spec using `bigint generated always as identity`, `numeric(20,6)`, `timestamptz`, `jsonb`, explicit short constraint names, and `ON DELETE RESTRICT`. Add the cyclic revision/plan foreign keys only after both tables exist.

- [ ] **Step 4: Implement RLS, approved-domain reads, and grants**

Enable RLS on every table. Grant no anon access. Grant `authenticated` SELECT only and create one SELECT policy per table using `(select ads_internal.is_approved_operator())`. Revoke all function execution from `PUBLIC`, `anon`, and `authenticated`; later tasks grant only their named functions to `service_role`.

- [ ] **Step 5: Run the schema/security test and verify GREEN**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite schema
```

Expected: PASS with zero pgTAP failures.

- [ ] **Step 6: Commit the reviewed task files explicitly**

```powershell
git add supabase/config.toml supabase/.gitignore supabase/migrations/20260820071959_m04_campaign_planning_launch.sql supabase/tests/m04_schema_security.test.sql supabase/tests/fixtures/m04_m03_prerequisites.sql scripts/test-m04-stage1.ps1
git commit -m "feat(m04): add campaign launch schema security"
```

### Task 2: Revisions, budget, approval, and workflow audit

**Files:**
- Modify: `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- Create: `supabase/tests/m04_workflow.test.sql`

**Interfaces:**
- Consumes: Stage 1 tables and internal operator/audit helpers.
- Produces: `ads_create_campaign_plan_revision`, `ads_reserve_campaign_budget`, `ads_release_campaign_budget`, `ads_approve_campaign_plan_revision`, and `ads_transition_campaign_plan` with the exact signatures in the spec.

- [ ] **Step 1: Write failing revision/budget/approval tests**

Cover a correct SHA-256 revision; payload/hash mismatch; revision update/delete rejection; active-revision supersession; invalid dates; account/package currency mismatch; unavailable account; reservation idempotency; over-allocation; release; expired approval; approval idempotency; unauthorized actor; forbidden plan transition; and database-derived actor/IP/UA audit evidence.

- [ ] **Step 2: Verify RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite workflow
```

Expected: FAIL because the transactional functions do not exist.

- [ ] **Step 3: Implement immutable revision creation**

Lock the plan, compare lock version, require editable state, compare `canonical_json::jsonb` to payload, compute `encode(digest(convert_to(p_canonical_json, 'UTF8'), 'sha256'), 'hex')`, insert the next revision, clear the plan's approved pointer, update active revision/status/lock version, and append audit in one transaction.

- [ ] **Step 4: Implement reservation and release**

Lock plan then package. Derive all values from the revision and account, calculate `delta = revision.allocated_budget - plan.reserved_budget`, and update the package only where:

```sql
committed_amount + delta between 0 and envelope_amount
```

The same revision/hash reservation returns without changing totals. Release subtracts only the plan's current reservation and is forbidden after launch.

- [ ] **Step 5: Implement approval/build creation and plan transitions**

Approval requires the active reserved revision/hash, future expiry, verified account access, matching currencies/client/account/package, and `awaiting_approval`. Insert an append-only approval and one `pending_gate_1` build, update the plan's approval lock, and audit atomically. The generic transition function implements only the allowed non-sensitive plan graph.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite workflow
```

Expected: PASS with zero pgTAP failures.

```powershell
git add supabase/migrations/20260820071959_m04_campaign_planning_launch.sql supabase/tests/m04_workflow.test.sql
git commit -m "feat(m04): enforce plan approval transactions"
```

### Task 3: Gate claims, resource receipts, QA, finalization, and handoff

**Files:**
- Modify: `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- Create: `supabase/tests/m04_claims_handoff.test.sql`

**Interfaces:**
- Consumes: approved builds and immutable audit helper.
- Produces: gate/retry acquisition, resource outcome, QA append, gate finalizer, and monitoring handoff functions with the exact signatures in the spec.

- [ ] **Step 1: Write failing claim/recovery/handoff tests**

Cover identical idempotency returning one attempt; different active claim returning `55P03`; expired claim acquisition; retry parent validation; ambiguous resource requiring reconciliation; proven-missing-only mutation retry; non-null provider ID immutability; append-only QA; Gate 2 blocked before `ready_to_deliver`; QA mismatch preventing readiness; ambiguous Gate 2 producing `delivery_unverified`; successful final readback producing `verified`; and one minimal idempotent handoff producing `handoff_complete`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite claims
```

Expected: FAIL because claim and handoff functions do not exist.

- [ ] **Step 3: Implement claim acquisition**

Lock the build; verify unexpired current approval and revision/hash; resolve an identical idempotency key; expire stale claims; enforce the Gate 1/Gate 2 starting state; persist the attempt and Gate 1 logical-resource intents; transition the build; and audit before returning the claim token.

- [ ] **Step 4: Implement receipts, QA, and derived finalization**

Validate the active claim token for every receipt. Preserve existing provider IDs, block verified-resource regression, append QA evidence, and derive build state. The finalizer never accepts a target state from its caller. `ready_to_deliver` requires all required Gate 1 comparisons to match. `verified` requires Gate 2 readback evidence; unknown/ambiguous Gate 2 state becomes `delivery_unverified`.

- [ ] **Step 5: Implement immutable handoff**

Require `verified`, matching lock version/hash, a verified campaign mapping, and final readback. Derive the exact minimal handoff from database rows, insert once by build ID, transition to `handoff_complete`, and audit atomically.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite claims
```

Expected: PASS with zero pgTAP failures.

```powershell
git add supabase/migrations/20260820071959_m04_campaign_planning_launch.sql supabase/tests/m04_claims_handoff.test.sql
git commit -m "feat(m04): add two-gate database orchestration"
```

### Task 4: M03 compatibility and real budget concurrency

**Files:**
- Modify: `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- Create: `supabase/tests/m04_m03_compatibility.test.sql`
- Create: `supabase/tests/concurrency/m04_budget_setup.psql`
- Create: `supabase/tests/concurrency/m04_budget_session.psql`
- Create: `supabase/tests/concurrency/m04_budget_assert.psql`
- Create: `scripts/test-m04-budget-concurrency.ps1`

**Interfaces:**
- Preserves: `ads_get_campaign_launch_eligibility(text,text) -> jsonb` signature, legacy precedence, return keys, security settings, and service-role ACL.
- Produces: Google-only verified-build eligibility and a two-process allocation race test.

- [ ] **Step 1: Write failing M03 compatibility tests**

Assert legacy adoption remains eligible; unverified build/resource is ineligible; `verified` and `handoff_complete` Google builds are eligible; null `verified_at`, wrong type/account/campaign, and every pre-Gate-2 status are ineligible; and a matching Meta/TikTok numeric collision is ineligible.

- [ ] **Step 2: Verify RED for the cross-platform collision**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite m03
```

Expected: FAIL because the existing M03 query does not filter Google accounts.

- [ ] **Step 3: Harden M03 eligibility additively**

Use `CREATE OR REPLACE FUNCTION` with the unchanged signature and JSON contract. Add `account.platform = 'google'` inside the dynamic verified-build query. Repeat the exact revoke/grant statements so only `service_role` can execute it.

- [ ] **Step 4: Write and run the real concurrency race**

The setup creates one package with 100 units and two plans/revisions each reserving 60. Start two independent psql processes behind a synchronization barrier. Assert exactly one succeeds, one fails with the over-allocation constraint, and committed amount equals 60 and never exceeds 100.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-budget-concurrency.ps1
```

Expected: PASS for at least five repeated races.

- [ ] **Step 5: Re-run M03 and M04 suites and commit**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite all
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-budget-concurrency.ps1
```

Expected: all focused pgTAP suites and repeated races pass.

```powershell
git add supabase/migrations/20260820071959_m04_campaign_planning_launch.sql supabase/tests/m04_m03_compatibility.test.sql supabase/tests/concurrency/m04_budget_setup.psql supabase/tests/concurrency/m04_budget_session.psql supabase/tests/concurrency/m04_budget_assert.psql scripts/test-m04-budget-concurrency.ps1
git commit -m "test(m04): prove M03 compatibility and budget locking"
```

### Task 5: Stage 1 verification and evidence handoff

**Files:**
- Modify only if verification exposes an in-scope defect; do not update Notion in Stage 1.

**Interfaces:**
- Produces: fresh focused migration evidence, M03-to-M04 upgrade evidence, database lint/advisor evidence where locally available, changed-file inventory, and residual-risk report.

- [ ] **Step 1: Verify the generated migration and migration list**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite all
```

Expected: the curated fresh M03 prerequisite plus M04 migration applies and all pgTAP tests pass.

- [ ] **Step 2: Run database lint and all focused tests**

Use the disposable database URL from the runner and execute:

```powershell
supabase db lint --db-url $M04_DB_URL --level error
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-budget-concurrency.ps1
```

Expected: no PL/pgSQL/type errors and all repeated races pass.

- [ ] **Step 3: Attempt the repository full-chain reset as baseline evidence**

```powershell
supabase db reset --local --no-seed
```

Expected baseline status: report the pre-existing duplicate `20260805` migration version and missing legacy table prerequisites if still present. Do not rewrite historical migrations inside M04 Stage 1.

- [ ] **Step 4: Run repository static checks**

```powershell
npm run typecheck
npm run lint
```

Expected: PASS, or report unchanged baseline failures separately.

- [ ] **Step 5: Review branch state**

```powershell
git status --short
git diff --check
git log --oneline --decorate -6
```

Confirm no provider/API/UI files changed, `supabase/.temp/` is absent from tracked files, and no remote migration/deployment occurred. Stop for user review without beginning Stage 2 or updating Notion Stage 7 evidence.
