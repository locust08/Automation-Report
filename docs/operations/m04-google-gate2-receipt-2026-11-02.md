# Google Gate 2 unknown receipt — 2 November 2026

The current Google request cannot move this existing campaign's elapsed start date. The code repair prevents another unexecutable schedule confirmation and preserves safe rejection reasons. It does not turn the historical unknown receipt into a proven rejection or a successful schedule.

## Exact scope and connected diagnosis

- Account `2315114913`, campaign `24349407517`, ad group `200671882763`, ad `827667223830`.
- Existing workflow `8711a86d-8b57-403e-8918-b20f1ff1b527`, revision `a454a142-865f-48a1-ba55-9181ae9f2205`.
- Existing Gate 2 receipt/key `e190394d-6246-4fcc-8131-11f7e8db7297`; original dispatched result remains `unknown` / `provider_action:unknown`.
- The user explicitly confirmed personally clicking the prior Google schedule confirmation. No new confirmation is authorized in this continuation.
- One direct, explicitly `validateOnly:true`, atomic (`partialFailure:false`) request at `2026-11-02T03:34:37.590Z`, using the exact stored snapshot's 18 operations and proposed account-local midnight `2026-11-06 00:00`, returned HTTP 400 / `CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED`.
- Official before/after SELECTs agree: campaign, ad group and ad remain PAUSED; campaign start remains `2026-10-12 11:39:00`, timezone `Asia/Kuala_Lumpur`. Zero executed provider mutations. Private sanitized evidence: `outputs/gate2-repair/validate-only-result.json`.
- This is present-time provider validation, not recovery of the discarded historical HTTP response. No request replacement, retry execution, receipt rewrite, new capability, compensation, campaign creation, or Meta operation occurred.

## Implementation

Based on exact deployed M04 source `070f195ee1d72be0c66d372b00ae2bb64c1be0f4`, preserving its newer recovery, Meta scheduling and diagnostic fixes:

1. Validate the exact atomic Google scheduling payload before issuing a Gate 2 confirmation and again before dispatch. Validation always uses `validateOnly:true`; confirmed execution retains its separate `validateOnly:false` method.
2. Record a sanitized Google reason and failure stage. Only a complete structured HTTP 4xx rejection during the atomic mutation can become rejected. Timeout, network, malformed/oversized response, 408/429/5xx and failed readback after a successful mutation retain uncertainty. No automatic mutation retry.
3. Extend the existing `campaign_operation_get` / `diagnose_preflight:true` path for the same Google receipt. Require current authority, exact pilot allowlist, unchanged revision and same-account object identities. Return current bounded official state plus validation-only findings; leave the receipt, audits and confirmation count unchanged.
4. Expose only safe enum reasons and validated status/date/timezone fields. Raw provider errors, bodies and credential values are excluded.

No new endpoint, public tool, migration, credential, permission expansion or schedule is introduced. A current read probe cannot retrospectively reconstruct the original execution response. Existing unknown receipts continue to block new preparations.

## Local verification

- Affected Worker TypeScript passes.
- Seven focused files / **103 tests pass**: Google Gate 2, M18 sources/actions and ambiguity, creation, readback, workflow QA and Meta contract.
- Two additional `m18-meta-schedule` tests fail identically on the unchanged production-source baseline because their fixtures omit the future-start fields required by the existing Meta guard. These are retained baseline failures, not passing checks or changes in this repair.
- New test/harness files pass standard scoped ESLint. Legacy touched files pass with their existing explicit-any rule disabled; five existing unused-variable/import warnings remain. `git diff --check` passes.
- Wrangler local packaging passes. The actual bundle runs in workerd against mocked authority, OAuth and Google services with real local D1 migrations. A signed existing-receipt diagnostic makes three status reads and one validation-only request; zero executions; no sentinel disclosure; receipt, audit count and confirmation count unchanged.
- Reproduce from `cloudflare/campaign-creation-api`: `wrangler deploy --dry-run --outdir ../../outputs/gate2-repair/bundle`, then `node scripts/test-google-gate2-bundle.mjs`. The harness uses synthetic local identities only; it cannot contact live Google or authority services.

Earlier M03 verification and both human-approved M03 PAUSED→PAUSED chains remain retained, separate evidence.

## Release boundary

Production release is **not yet applied**. The reviewed target is only `digitalbee-m04-campaign-api`; preserve all 45 bindings except the `POSTHOG_RELEASE` value, exact four-entry Gate 2 allowlist, settings, routes, exposure, schedules, annotations and four peer Workers. Inherit existing secrets; do not deploy stale source-config defaults. Use existing release instrumentation/source-map workflow with US PostHog project 503297 after specific approval.

Verified current version / rollback: `e5811668-b063-4a84-8b77-69d0eefa22c7`; deployed JS SHA256 `23557e46eb4eea03043062d4a043159a2c6894dffe90427f217fa14736c65ca8`. This rollback retains the separately approved exact Google allowlist addition. Private `release-baseline.json` records five-Worker bytes and full configuration; the release proposal records candidate artifact hashes and intended configuration comparison.

Public branch publication, new M04 source/map upload and production deployment require the specific approval in the accepted plan. After approval, verify deployed bytes and unchanged configuration, then use only the existing receipt's explicit diagnostic path. Stop before any new human confirmation or provider execution.

## Remaining acceptance

M18 remains **In Review / Stage 3.2 / 7/9**. Google Gate 2 is blocked for this existing pilot by its immutable elapsed start; this repair cannot make the requested future reschedule valid. Any prospective acceptance replacement needs separately reviewed scope and cannot authorize historical execution. No replacement is created here. No changed baseline was observed requiring a new compensation mutation. Date-bounded official non-serving/zero-spend freshness remains incomplete, Meta historical human consent remains unknown, and its expired schedule is preserved. M17 is untouched.
