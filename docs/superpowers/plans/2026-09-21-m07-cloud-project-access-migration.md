# M07 Cloud-project access migration implementation plan

**Goal:** Implement the supplied M07 brief on `codex/m07-cloud-project-access-migration`.
**Architecture:** Share an environment-neutral, OAuth-only REST v25 client across server, CLI and Worker callers. Keep routing and approval decisions in existing domain modules. Use the official Python client for the Python search-term reader.
**Spec:** User-provided M07 migration brief (2026-09-21).

## Constraints

- Preserve report contracts, account/MCC order, paused creation and existing approval controls.
- Require OAuth client ID, secret and refresh token; reject versions below v25 before network calls.
- Never retry live mutations automatically. Bound read retries, response sizes and pagination.
- Keep credentials and raw remote errors out of logs and public errors.
- Preserve unrelated working-tree changes. Do not remove deployed legacy secrets before a successful seven-day canary.
- Production rollout requires administrative readiness, real direct/MCC reads and validation-only mutation checks.

## Tasks

- [x] Shared client: add mocked-fetch tests for headers, concurrent refresh, version floor, pagination, timeouts, errors, quota cooldown and mutation retry rules; implement `lib/google-ads/rest-client.ts` and server credential adapter.
- [x] Migrate reporting, management, optimization, campaign creation and Worker transport; retain domain routing and query behavior. Verify existing focused tests and add routing regressions.
- [x] Migrate campaign-builder CLI and Python reader; update dependency lock, workflow and operational configuration. Run skill self-tests.
- [x] Add regression scanner and safe preflight command; document project inventory and staged canary evidence.
- [x] Run focused tests, typecheck, lint, build and Worker dry-run. Review diff.
- [ ] Commit and push only M07 files; production rollout remains gated on administrative inventory and remaining approved mutation fixtures.

## Review focus

1. Explicit direct access must not become fallback MCC through null coalescing.
2. Live mutation timeout must not cause a duplicate submission.
3. Pagination must preserve segmented rows and detect repeated tokens.
4. Remote error text must not leak credentials while error codes/request IDs remain usable.
5. Missing project metadata must not mix quotas between unrelated OAuth projects.

## Execution ledger

- Read current Google migration and version documentation; confirmed token sunset and v25 availability.
- Recorded existing unrelated dirty files before edits.
- Ruling: proceed with implementation under the user's supplied written brief and explicit instruction to start; no additional design approval is necessary.

- Review corrected typed GAQL fallback, Python OAuth initialization sanitization/timeouts, and OAuth alias compatibility.
- Live checks: 18 direct customers, two MCCs, 214 GAQL fields, and five validation-only mutation families passed.
- Production gate remains open: user cannot currently verify Cloud-project inventory. No production deployment or secret removal. See `docs/operations/m07-rollout.md`.
