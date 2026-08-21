# Task 3 hardening round 2 report — recovery, state, and lock races

## Status and scope

Implemented the second Task 3 safety-hardening round in the existing M04 additive migration. The change closes approval-renewal, idempotency, lock-order, cancellation, build-wide claim, failed-state recovery, causal-readiness, audit-attribution, and immutable-handoff gaps while preserving every public RPC signature. No new public function was added.

- Base: `96db8e9a2798910af724e6df0a03b54c079f8c0b`
- Branch: `M04-Cross-Platform-Campaign-Planning-and-Launch`
- Hardening commit: `fix(m04): close recovery and state races`
- Review-fix base: `c926e2d`
- Review-fix commit: `fix(m04): validate causal recovery evidence`
- Date: 2026-08-21

No unrelated Task 4 artifact, historical migration, provider/API/UI file, credential, remote Supabase project, deployment, activation, Notion object, Task 5 item, or Stage 2 behavior was touched. The shared state-concurrency runner and its disposable fixtures were intentionally extended because the review-fix brief requires runtime lock-order proof and simultaneous state stress.

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

## Review fix 1/5 — causal recovery and runtime lock evidence

### Test-first RED evidence

The consolidated three-review brief was implemented from clean base `c926e2d`. Meaningful regressions were added before the production migration changed. The workflow corrections were test-only and were already GREEN at 89/89. Claims reached a clean behavioral RED with 13 failures out of 193 tests and no setup/parser cascade. The failures were confined to:

- Gate 1 receipt and QA attempt-intent membership;
- subset-only reconciliation completion;
- latest-mutation retry parent/proof causality;
- decisive QA per required field and out-of-intent evidence;
- fail-closed nullable plan pointers/hashes.

After the first independent production group, claims had exactly four remaining behavioral failures (subset reconciliation, stale proof, per-field evidence, and out-of-intent readiness). The causal group then reached 193/193. A later test-only completeness audit expanded the suite to 203/203 by exercising null active-revision, approved-revision, and approved-hash snapshots across all five existing-build paths.

The enhanced state runner also produced deterministic pre-fix evidence without production hooks or caller-supplied first-row locks:

- all forced winner-order cases still proved coherent serialization;
- seven neutral build/plan or plan/package probes passed;
- the QA probe failed because the blocker could acquire the build while the real QA RPC waited on the attempt, proving attempt-before-build order;
- concurrent identical initial approvals failed exact idempotency after waiting, while the conflicting request remained a conflict;
- all 40 simultaneous claim-versus-transition race cases (80 children) completed without a deadlock or timeout, so those failures were not hidden by a `40P01`/`57014` cascade.

### Production corrections

- Initial approval now rechecks the idempotency key and exact request identity immediately after its plan lock and before stale status/CAS rejection. Identical concurrent callers return the winner's build; conflicts remain SQLSTATE `22023`. Renewal retains build-then-plan locking and the same post-lock idempotency precedence.
- Gate 1 resource receipts and resource-bound QA require exact logical key/type membership in the locked attempt's persisted `intent.resources`. Gate 2 campaign readback semantics are unchanged.
- Full readiness still spans every build resource, while a Gate 1 reconciliation finalizer evaluates only its current persisted intent subset when choosing `gate_1_failed` versus an unresolved reconciliation state.
- Each selected retry resource requires the supplied parent to be its latest create/retry mutation. The authorizing reconciliation must be newer, intent-scoped, successful, and the latest reconciliation with required non-empty `missing` proof.
- Gate 1 decisive evidence is calculated per `(resource_id, field_path)` after the resource's latest mutation. Every latest required field must match; at least one required resource-bound field is mandatory. Failed positives cannot authorize readiness, while later negatives remain decisive.
- QA now performs a nonlocking attempt lookup, locks the build first, then locks and revalidates the attempt and resource. The final graph remains build-before-plan/attempt for every existing-build path; initial approval intentionally remains plan-before-package.
- Active/approved revision pointers and approval/revision hashes fail closed with `IS DISTINCT FROM` in gate, retry, receipt, finalizer, and handoff snapshot checks.
- A coherent transition winner is classified as stale SQLSTATE `40001` before approval-current validation, preserving an exact winner/stale-loser result rather than leaking an incidental `55000`.

The design now states explicitly that a failed state alone never authorizes mutation retry: proof-gated retry from `gate_1_failed` requires each selected resource's latest mutation parent and newer causal missing evidence.

### Regression precision and concurrency harness

- Expired and historical approval-key replays use the real renewal RPC, return the original build ID, and assert unchanged plan/build rows plus exact approval/build/audit counts. Post-expiry gate/retry recovery uses a real append-only same-build renewal before a new key succeeds.
- Gate 1 and Gate 2 action matrices are split into one assertion per allowed reconciliation state and forbidden shortcut.
- Receipt, finalizer, nullable snapshot, and handoff mismatch tests compare exact messages and full relevant plan/build/attempt/resource/QA/audit/handoff snapshots. Ambiguity adds exactly one expected audit event with persisted actor/network attribution.
- Neutral blockers hold only the second row. External observation requires every real RPC session to be in a lock wait and directly blocked according to `pg_blocking_pids`; the blocker then proves the RPC owns its first row with `FOR UPDATE NOWAIT` before a separately committed release signal.
- The probes cover claim, retry, approved-to-draft, approved-to-cancelled, renewal, handoff, initial approval, and QA. Forty true simultaneous barrier races cover 20 draft and 20 cancellation variants.
- Hidden children use `System.Diagnostics.Process`, asynchronous output draining, bounded waits, parameterless `WaitForExit()` plus `Refresh()`, exact markers, and exact exit codes. Success requires exit `0`; recorded `22023`/`40001` errors are committed, marked once, then rethrown through `ON_ERROR_STOP` for native exit `3`.
- A full-run harness RED exposed that this local `psql` ignores an argument to `\quit`. That test-only portability issue was replaced with the post-commit SQLSTATE rethrow and proved GREEN in a focused enhanced run before the required default rerun.

### Review-fix changed files

- `docs/superpowers/specs/2026-08-20-m04-stage-1-database-design.md`
- `supabase/migrations/20260820071959_m04_campaign_planning_launch.sql`
- `supabase/tests/m04_workflow.test.sql`
- `supabase/tests/m04_claims_handoff.test.sql`
- `scripts/test-m04-state-concurrency.ps1`
- `supabase/tests/concurrency/m04_state_session.psql`
- `supabase/tests/concurrency/m04_state_assert.psql`
- `supabase/tests/concurrency/m04_state_enhanced_setup.psql`
- `supabase/tests/concurrency/m04_state_enhanced_assert.psql`
- `supabase/tests/concurrency/m04_lock_probe_blocker.psql`
- `supabase/tests/concurrency/m04_lock_probe_rpc.psql`
- `supabase/tests/concurrency/m04_approval_parallel_blocker.psql`
- `supabase/tests/concurrency/m04_approval_parallel_session.psql`
- `supabase/tests/concurrency/m04_state_stress_session.psql`
- `.superpowers/sdd/2026-08-20-m04-stage-1-database/task-3-hardening-2-report.md`

No public RPC signature changed and no new public function was introduced.

### Final review-fix verification

Every command used a fresh, disposable local Supabase project with pinned CLI `2.115.0`:

| Command | Result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite schema` | PASS, 114/114; project `m04_stage1_cd30b8058aec4b4d` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite workflow` | PASS, 89/89; project `m04_stage1_3a59f2a7ce064c71` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite claims` | PASS, 203/203; project `m04_stage1_6218c666890b4ceb` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-stage1.ps1 -Suite all` | PASS, 429/429; project `m04_stage1_7339fa17f47046a8` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-budget-concurrency.ps1` | PASS, 5/5; project `m04_budget_8e000e42d75744ed` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-m04-state-concurrency.ps1` | PASS; three iterations of seven coherent cases, eight neutral lock probes, two parallel-approval cases, and 40 simultaneous races; project `m04_state_ce115f035e8f4bc0` |
| PowerShell parser on all three M04 runners | PASS, zero parse errors |
| Migration parse/apply | PASS in every focused, combined, budget, and state project |
| Catalog/signature/ACL assertions | PASS in schema 114/114 and claims 203/203 |
| `git diff --check` | PASS; only Windows LF-to-CRLF notices |

The final exact cleanup inventory reported zero matching M04 processes, zero matching Supabase containers, and zero generated `m04-stage1-*`, `m04-budget-concurrency-*`, or `m04-state-concurrency-*` temp roots. Every final project stop completed with `--no-backup` at exit `0`. The laptop sleep interruption was treated as uncertain state: exact child PIDs and its disposable project were stopped and verified before a fresh claims run; its validated diagnostic root was removed only after that fresh result was classified.

## Residual concerns

No known correctness issue remains inside this review-fix scope, but this commit is intentionally stopping for scoped independent re-review (fix round 1/5). The concurrency evidence is bounded local PostgreSQL evidence, not a proof over every possible scheduler interleaving. Real provider/API behavior remains Stage 2 work and was not exercised.
