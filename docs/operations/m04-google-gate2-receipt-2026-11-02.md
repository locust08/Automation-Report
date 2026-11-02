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

## Pre-release review boundary (historical checkpoint)

Production release is **not yet applied**. The reviewed target is only `digitalbee-m04-campaign-api`; preserve all 45 bindings except the `POSTHOG_RELEASE` value, exact four-entry Gate 2 allowlist, settings, routes, exposure, schedules, annotations and four peer Workers. Inherit existing secrets; do not deploy stale source-config defaults. Use existing release instrumentation/source-map workflow with US PostHog project 503297 after specific approval.

Verified current version / rollback: `e5811668-b063-4a84-8b77-69d0eefa22c7`; deployed JS SHA256 `23557e46eb4eea03043062d4a043159a2c6894dffe90427f217fa14736c65ca8`. This rollback retains the separately approved exact Google allowlist addition. Private `release-baseline.json` records five-Worker bytes and full configuration; the release proposal records candidate artifact hashes and intended configuration comparison.

Public branch publication, new M04 source/map upload and production deployment require the specific approval in the accepted plan. After approval, verify deployed bytes and unchanged configuration, then use only the existing receipt's explicit diagnostic path. Stop before any new human confirmation or provider execution.

## Remaining acceptance

M18 remains **In Review / Stage 3.2 / 7/9**. Google Gate 2 is blocked for this existing pilot by its immutable elapsed start; this repair cannot make the requested future reschedule valid. Any prospective acceptance replacement needs separately reviewed scope and cannot authorize historical execution. No replacement is created here. No changed baseline was observed requiring a new compensation mutation. Date-bounded official non-serving/zero-spend freshness remains incomplete, Meta historical human consent remains unknown, and its expired schedule is preserved. M17 is untouched.

## Approved deployment — 2 November 2026, 05:03 UTC

The user explicitly approved publication, M04 source/map upload to US PostHog project 503297, M04-only deployment and one existing-receipt diagnostic. Repair `482b7a2882b78f705242189871be54b155aafd4c` and evidence `123d14772e4980b5e92ca75225d580ea39eed100` were published and remote branch heads verified. The existing release workflow instrumented and uploaded the bundle/map; the actual instrumented bundle passed the local workerd signed-diagnostic test again.

- Production Worker/version: `digitalbee-m04-campaign-api` / `5d210b22-4112-4530-a01f-105c3c8fef27`, active at 100% from `2026-11-02T05:03:14.432184Z`.
- Exact deployed JS SHA256: `63d09e4c50e933dcb3feded916a643652ff0ca780729c1babd9776e4d047f643`.
- Uploaded source-map SHA256: `04c116091e2b6af60cd894d574d969ce87e817c65c5f2de537c80d4a3b4d7991`.
- Release: `m04@482b7a2882b78f705242189871be54b155aafd4c`; rollback remains `e5811668-b063-4a84-8b77-69d0eefa22c7`.
- Five-Worker before/after verification confirms only M04 code and POSTHOG_RELEASE changed. All 45 bindings otherwise, four-entry allowlist, settings/annotations, routes, schedules and exposure are preserved; M03, main MCP, gateway and M05 are unchanged. No migration or credential change.
- The first release invocation stopped on a read-only Cloudflare 401 before uploading any Worker. `wrangler whoami` refreshed the existing operator OAuth session without permission expansion. A fresh complete drift check preceded the one successful deployment; there was no blind upload retry.
- SELECT immediately before the connected diagnostic verifies the original receipt still unknown with unchanged timestamps, 10 workflow audit rows and one existing challenge. Connected result is recorded separately below.

Private release evidence: `release-baseline.json`, `release-proposal.json`, `prepared.json`, `bundle/posthog-manifest.json`, `deployment-attempt.json`, `deployment-response.json`, `release-verified.json`, and `receipt-before-native.json` under `outputs/gate2-repair/`. Public configuration contains no secret values; the private deployment inherits existing credentials.

## Connected diagnostic verified — 2 November 2026, 13:05 MYT

One `campaign_operation_get` with `diagnose_preflight:true` was requested through Ava's retained Chrome conversation for the existing service and receipt. The native response reports success, correlation `62f6c6ae-53c0-48d7-acc5-fec3fddad653`, with official capture at `2026-11-02T05:05:29Z` (display precision: seconds). It returns all three exact Google objects PAUSED, the unchanged October 12 start and Asia/Kuala_Lumpur timezone. Current validation is rejected with `google_CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED`; historical receipt stays unknown, `receipt_unchanged:true`, `retry_authorized:false`, and no historical provider response is available.

Protected backend telemetry independently shows exactly one GET `/v1/mcp/campaign-creation/operations/status` in the diagnostic window, HTTP 200 / outcome ok / 13,002 ms. The other two events are the unchanged existing scheduled sweep. Query parameters are omitted by this telemetry; the explicit diagnostic input is retained in the visible conversation, not inferred from the log.

SELECT at `2026-11-02T05:06:08.934Z` matches the pre-diagnostic receipt and timestamps exactly. The workflow still has 10 audit records, one original confirmation and one follow-up receipt. No new request/key, revision, capability, provider execution, reconciliation or confirmation occurred. The earlier retained card's reserved display is stale historical UI; it was not clicked or used to reconcile the receipt.

Private evidence: `native-diagnostic-verified.jpg`, `native-backend-log.json`, `receipt-after-native.json`, `connected-diagnostic-verified.json`. The technical repair is deployed and its existing-receipt diagnostic is accepted. The Google scheduling acceptance criterion remains blocked by the existing campaign's immutable elapsed start. Campaigns remain paused; no replacement campaign or new confirmation was prepared. M18 stays In Review / Stage 3.2 / 7/9; M17 and Meta remain untouched.
