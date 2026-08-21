# Task 3 hardening round 2 report — recovery, state, and lock races

## Status and scope

Implemented the second Task 3 safety-hardening round in the existing M04 additive migration. The change closes approval-renewal, idempotency, lock-order, cancellation, build-wide claim, failed-state recovery, causal-readiness, audit-attribution, and immutable-handoff gaps while preserving every public RPC signature. No new public function was added.

- Base: `96db8e9a2798910af724e6df0a03b54c079f8c0b`
- Branch: `M04-Cross-Platform-Campaign-Planning-and-Launch`
- Commit: `fix(m04): close recovery and state races`
- Date: 2026-08-21

No Task 4 artifact, historical migration, provider/API/UI file, credential, remote Supabase project, deployment, activation, Notion object, Task 5 item, or Stage 2 behavior was touched.

## Test-first RED provenance

All meaningful pgTAP and deterministic two-session regressions were written before the production migration was changed. Two test-only fixture/parser defects were corrected first; the resulting runs reached every assertion with no setup, parser, or cascading fixture failure. The migration still matched base `96db8e9` when these behavioral RED results were recorded:

```text
workflow: 13 behavioral failures of 87 tests
claims:   28 behavioral failures of 152 tests
schema:    2 behavioral failures of 114 tests
```

The new state-race runner also exercised all seven cases against the pre-fix migration with bounded timeouts and no hang or deadlock. It produced the intended unsafe RED in `transition-wins-draft`: after the real transition RPC returned while its transaction remained open, the losing claim incorrectly succeeded instead of failing stale, violating the coherent-winner assertion.

The race harness does not pre-lock a build or plan and does not add a production test hook. Each real winner RPC acquires only its production locks. The harness observes its post-RPC/open-transaction stage through `pg_stat_activity.application_name`, observes the loser's actual exit or lock wait, and releases the winner through a separately visible committed release row.

## Implementation

### Approval and renewal

- Exact approval, gate-claim, and retry keys are resolved and all identity-bearing inputs are checked before mutable expiry or workflow-state checks.
- Old approval keys continue to resolve the original build after a renewal repoints its current approval.
- The existing approval RPC now renews the one exact build from supported `approved` and nonterminal `launch_in_progress` states, with strict later expiry, active account/package and immutable snapshot checks, plan CAS, one appended approval, supersession linkage, one build, two lock increments, and atomic audit evidence.
- A live claim token remains the authorization lease through its TTL even when approval evidence expires; new keys remain blocked pending renewal.

### Locking, cancellation, release, and claims

- Existing-build paths use build-then-plan locking and revalidate their snapshots without pivoting lock order after the first lock.
- Gate acquisition and retry lock/revalidate the plan after the build; the initial Gate 1 workflow transition is a checked compare-and-set.
- `approved -> draft|cancelled` preselects the exact pending build without a lock, then locks build followed by plan, cancels/audits the build, and transitions/audits the plan atomically. A changed branch fails stale.
- Direct budget release from `approved` is rejected. Transition-then-release preserves one cancelled prior build and the correct committed total.
- The active-claim partial unique index is build-wide, and RPC logic applies the same build-wide exclusion after exact idempotency and stale normalization.

### Recovery and causal readiness

- Correct-gate reconciliation is allowed from the specified conservative and failed states; direct mutation/delivery/retry shortcuts remain rejected.
- Retry is limited to `gate_1_failed`, a proven-missing parent subset, and a build with no active claim at either gate.
- Receipt and finalization require the locked build and plan to remain in the attempt's exact active state before making any change.
- Gate 1 readiness now considers every persisted build resource and its latest causal create/retry mutation. Required resource-bound authoritative matches from that mutation or a later succeeded reconciliation can authorize readiness; later decisive negative evidence blocks older positive evidence. Failed attempts, pre-mutation evidence, optional QA, and null-resource QA do not authorize readiness.
- Partial retries can succeed independently while the build remains failed; the final recovered missing subset alone can make the full build ready.

### Audit, handoff, and platform-neutral coverage

- Ambiguous/unknown resource outcomes append exactly one atomic audit event using the persisted attempt actor, IP, and user agent.
- Handoff identity, account/provider identity, revision/hash, dates, currency, and allocation are derived from the immutable revision after build-then-plan locking and snapshot validation. Mutable account-directory drift cannot rewrite handoff evidence.
- Full platform-neutral Meta and TikTok lifecycles now cover revision, reservation, approval, Gate 1, Gate 2, verification, and monitoring handoff.
- Internal hardening/readiness helpers are not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`.

## Changed files

- `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- `supabase/tests/m04_schema_security.test.sql`
- `supabase/tests/m04_workflow.test.sql`
- `supabase/tests/m04_claims_handoff.test.sql`
- `scripts/test-m04-state-concurrency.ps1`
- `supabase/tests/concurrency/m04_state_setup.psql`
- `supabase/tests/concurrency/m04_state_session.psql`
- `supabase/tests/concurrency/m04_state_assert.psql`
- `.superpowers/sdd/2026-08-20-m04-stage-1-database/task-3-hardening-2-report.md`

## GREEN verification

All database runs used disposable local Supabase projects with pinned CLI `2.115.0`.

| Command | Result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite workflow` | PASS, 87/87 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite claims` | PASS, 152/152 after the final causal-readiness fix |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite schema` | PASS, 114/114 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite all` | PASS, 376/376 across claims, M03 compatibility, schema/security, and workflow |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-budget-concurrency.ps1` | PASS, 5/5 races |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-state-concurrency.ps1` | PASS, 3/3 iterations; seven coherent-winner/stale-loser cases per iteration, no deadlock |
| PowerShell parser on `scripts/test-m04-state-concurrency.ps1` | PASS, zero parse errors |
| Migration parse/apply | PASS in the focused, combined, budget-race, and state-race disposable projects |
| `git diff --check` | PASS; no whitespace errors (only Git's Windows LF-to-CRLF working-copy warnings) |

The catalog-backed tests and final source inspection confirm:

- `acga_build_active_idx` is a unique partial index on `build_id` where `released_at is null and status = 'claimed'`; the former per-gate index is absent.
- `service_role` retains SELECT but not INSERT/UPDATE/DELETE on all eleven M04 tables.
- Only the exact public RPC signatures retain service-role execution; authenticated callers cannot execute them.
- New `ads_internal` helpers have execution revoked from all exposed roles.

## Self-review and cleanup

Self-review found one additional causal-readiness defect before completion: a later failed reconciliation's negative evidence could be ignored in favor of an older positive match. A regression was added first, then the helper was corrected so failed attempts cannot authorize a positive match while their later decisive negative evidence still blocks readiness. The claims suite was rerun to 152/152 and the combined suite to 376/376 after that fix.

Every runner used hidden Windows child processes, bounded statement/lock/process deadlines, exact tracked PIDs, unique project IDs, and a validated GUID-scoped temporary root. Final cleanup checks found:

```text
psql process count: 0
matching Supabase containers: 0
m04-state-concurrency-* temp roots: 0
m04-stage1-* temp roots: 0
m04-budget-concurrency-* temp roots: 0
```

The final budget project `m04_budget_e7048b2246f64261` and state project `m04_state_8121f2d248624503` were both stopped with `--no-backup` at exit 0. No remote, link, migration, deploy, provider, or production-credential command was run.

## Residual concerns

No unresolved correctness concern remains within this Stage 1 hardening scope. Verification is intentionally limited to disposable local Supabase and platform-neutral database evidence; real provider behavior remains Stage 2 work and was not exercised here.
