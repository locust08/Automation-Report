# M18 Google future-start replacement — 2 November 2026

## Local implementation
The replacement Search pilot now supports an optional immutable start_at. Gate 1 creates the campaign with the approved account-local midnight startDateTime and PAUSED hierarchy. Validation, new approval preparation/approval and provider dispatch enforce a minimum 72-hour lead; historical reads remain available after the date passes. Gate 2 binds to that exact start. Creation readback and QA verify the provider date; reconciliation preserves the date in new-plan snapshot hashes while retaining legacy behavior. Demand Gen and legacy Search plans are unchanged. No database migration.

Main MCP displays the bound start in planning, approval and separate creation cards, and makes the Gate 2 schedule field read-only for bound plans. All immutable confirmation, permission and idempotency boundaries remain.

Backend starts from deployed diagnostics source 482b7a2 (documentation HEAD f4ba633). Main starts from deployed source 48ef3a0d868147c0a98991247c2f09ea7dda9dc9. Existing diagnostic, confirmation and recovery fixes are retained.

## Verification
- 118 backend tests across seven affected suites pass, including 17 new cases for dates, paused payloads, separate approvals, duplicate dispatch, QA and legacy/new reconciliation.
- Both TypeScript checks pass. Scoped backend lint has zero errors; five pre-existing unused-variable warnings remain. Legacy files use the retained no-explicit-any override; the new date test passes standard lint.
- Actual bundled Worker with isolated D1 and mocked dependencies passes signed validation, separate approval/Gate 1 cards, expired-start denial, safe diagnostic and sentinel checks. No external provider is called by local tests.
- Main native-card suites: 49 pass, one pre-existing expectation failure. The same failure reproduces against the untouched deployed app source: the old test omits the correlation suffix in an uncertain-preparation message. New Google future-date browser test passes. No unrelated expectation change.
- Local packaging is separate from source-map upload, deployment and connected acceptance.

## Fresh verification of the last two gaps
At 2026-11-02T05:42:24.171Z, official Google account 2315114913 / campaign 24349407517 / group 200671882763 / ad 827667223830 are PAUSED. Start remains 2026-10-12 11:39:00. Daily impressions/cost returned empty rows with no next page for 2026-10-12 through November 1 and separately November 2.

At 2026-11-02T05:42:23.102Z, official Meta account 321606578570386 / campaign 120250129492860590 / set 120250129493140590 / ad 120250129537090590 remain configured/effectively PAUSED. Account timezone/currency are independently read as Asia/Kuala_Lumpur/MYR for both providers. Meta November 1 10:00 start is unchanged. Daily impressions/spend returned empty rows with no next page for October 29 through November 1 and separately November 2.

No nonzero delivery was reported. Zero-delivery acceptance remains INCONCLUSIVE: the APIs supplied no completeness/freshness watermark, the current local day is incomplete, and future replacement Gate 2/compensation are not covered. Empty rows have not been converted into synthetic zero rows.

SELECT-only review confirms Meta historical Gate 2 receipt 14ca29cd-3a2a-44c8-904b-7f2747459779 is verified for workflow 3f777789-3e0e-44eb-b604-5a8e4bb97851 / revision 62687d49-94f6-409c-9b7f-f676bcde5d92, actor 112837436987685558718, scheduled November 1 02:00 UTC. This proves recorded execution and attribution, not deliberate human consent. Retained handoff states the user cannot attest; the currently rendered retained conversation only exposes later Google actions, so it supplies no additional historical Meta click evidence. Later explicit M03 approvals/confirmations apply only to the November 2 pause requests. Historical consent stays UNKNOWN; no retrospective authorization claimed.

## Release and acceptance boundary
Local candidate only. No new campaign, workflow, revision, provider write, confirmation, permission change, source-map upload or deployment was performed. M18 remains In Review / Stage 3.2 / 7/9; M17 untouched.

Proposed affected Workers: digitalbee-m04-campaign-api and digitalbee-mcp. Only code and POSTHOG_RELEASE may change. Preserve all 45/141 bindings respectively, credentials, allowlists, dashboard assets, routes, schedules and other three Workers. Baseline captured 2026-11-02T05:45:56.488Z. Rollback M04 5d210b22-4112-4530-a01f-105c3c8fef27; main bca9d588-aa1b-4a03-a7eb-e83daaf0c6c6. Release approval must identify the concrete commits/artifacts and existing US PostHog project 503297.

After approved and verified release, proceed with a new, explicitly prospective Google curated-template pilot in account 2315114913, MYR10/day, proposed November 10 midnight MYT (November 9 16:00 UTC). Recheck at least seven days lead when preparing; require at least 72 hours at Gate 2 execution. Existing Google and Meta remain PAUSED and their historical receipts stay unchanged. Native exact-revision human approval and separate paused-creation confirmation are required before any provider creation; exact new IDs then need separately approved Gate 2 and M03 allowlist entries. Gate 2 confirmation, official schedule readback and a fresh M03 compensation approval/confirmation remain separate. No automatic creation, confirmation, enabling or retiming.

Private evidence: outputs/google-future-start/ contains official sanitized reports, deployment baseline, local bundles and the concrete release proposal. Public documentation contains no credentials or confirmation capabilities.

References: [Google campaign start-date fields](https://developers.google.com/google-ads/api/reference/rpc/v25/Campaign), [Cloudflare preserve-assets upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/).


## Concrete release checkpoint

Proposal SHA256: 62fd9321f2666f6ff4902f7c0603297d0877f9066d7a809e8b0ce81fc8581f80. Both local packages and the exact rebuilt M04 bundled Worker check pass. No source-map instrumentation/upload or production deployment yet.

- digitalbee-m04-campaign-api: source c32ea5f738c12527d9597f144c6f0f39e6b671fd; JS SHA256 c2c0f8f53624eb37be1f79a46aa81957b0ed15050234d8d5a1a51a15259bffc4; map SHA256 b87764a8e47035fa5c716700b46795641cb8d6b78fbb0f0b5357c77f8da7557b; rollback 5d210b22-4112-4530-a01f-105c3c8fef27.
- digitalbee-mcp: source a60d81c82398770741703a3893cd32e4444c9e81; JS SHA256 e2d1029dde37876089e086af5095e7f094f0dd32559f7368b2f070fded47c379; map SHA256 d04e2633a67ab7b462693dd7cdd624d178d3d1581ab2411b845c57e5eb4c8c2f; rollback bca9d588-aa1b-4a03-a7eb-e83daaf0c6c6.

Automation-Report is public. Main origin metadata is unavailable to gh, but existing Git authentication successfully reads its HEAD; retain the exact DigitalBee-MCP destination. No repository was created or substituted. The release workflow must recheck all five services for drift and capture final post-instrumentation hashes before deployment.

## Approved release deployed and verified

The user explicitly approved publication, both bundle/source-map uploads to US PostHog project 503297, deployment of only M04/main and prospective review preparation. Approved proposal SHA256 remains 62fd9321f2666f6ff4902f7c0603297d0877f9066d7a809e8b0ce81fc8581f80. All three approved branches were published and remote heads verified (2f012e4, 78da29ad, 28826a9).

- m04: source c32ea5f738c12527d9597f144c6f0f39e6b671fd; deployed version f79dd43c-4f99-4c95-a7e6-522ab6bc9ac9; verified 2026-11-02T06:01:46.699Z; JS SHA256 de46e5c637a507d8afe1120e6339a1c8e43435d081a6ae4e82996d9ad9729270; uploaded map SHA256 10739ca52924092ec5dddc3d3d8f03fdd30846ee34f1a0680cd3614727131401; rollback 5d210b22-4112-4530-a01f-105c3c8fef27.
- digitalbee-mcp: source a60d81c82398770741703a3893cd32e4444c9e81; deployed version ca1571a9-4ce8-489e-b8cc-95c5bcd83dbf; verified 2026-11-02T06:04:57.529Z; JS SHA256 a7bad3affa03993e9a8dea50b76a00cfe20d7ad77dce822ddc0bda76f590799d; uploaded map SHA256 9d4cee9a339d9b3875afcee2630bf38540c44112d79763e78688d2c357d915eb; rollback bca9d588-aa1b-4a03-a7eb-e83daaf0c6c6.

The exact instrumented M04 bundle passed its isolated Worker harness before deployment. Five-service comparisons verify only code/POSTHOG_RELEASE changes; all 45 M04 and 141 main bindings otherwise, credentials, exact allowlists, settings/annotations, dashboard assets, routes, schedules and three peers are preserved. The first main invocation stopped on a read-only 401 before any deployment marker; the existing OAuth session was refreshed without new permissions and the fresh drift check preceded one actual main deployment.

Native prospective review was submitted once in Ava's retained Chrome conversation with draft key 7b5e1b08-3767-4613-9e7b-c859fd319f01 and validation key 60c92938-ec51-469d-a9a9-406418a1e0db, exact curated template google-search@1, MYR10/day and November 10 midnight MYT. The following connected-review checkpoint records the result. Stop before human approval or creation. Existing campaigns and historical receipts remain unchanged.
## Prospective replacement review prepared; approval boundary retained

At 2026-11-02T06:14:37.977Z, SELECT-only verification found workflow 30abb967-aecf-40c4-acd6-4c01f77e7874 still validated, revision fa086047-87ac-4a03-aca0-676638ec3606, immutable hash QAjKCMMabglfHNtKTQgj1IHIZAPrvMV-KDi0w2YlF0U. Its saved start_at is 2026-11-09T16:00:00.000Z, November 10 at 00:00 Asia/Kuala_Lumpur, MYR10/day. The initial JSON projection used the confirmation-style schedule.start_at path and returned null; the corrected read of the stored plan's top-level start_at verified the exact bound date.

Exactly one native draft save, validation and approval preparation completed in Ava's retained conversation. Audit contains save/success and validate/validated only; creation operations = 0 and follow-up operations = 0. The approval challenge remained unused (used=0), confirmation hash yG4rH3Livn6U7WwhLLYuC9_c0ZMbhwMLSAt9EwKCVlA. Its expiry was 2026-11-02T06:12:35.344Z; it expired during inspection and was not renewed. No human approval, provider creation, Gate 2 permission addition or provider mutation was performed.

The existing card rendered after a display-only Try again. Its Resource plan visibly contains campaignOperation.create.startDateTime = 2026-11-10 00:00:00, PAUSED objects and schedule.start_at = 2026-11-09T16:00:00.000Z. The Overview still omits the Google future-start row and uses older wording despite verified deployed bytes; host resource caching is a hypothesis, not a proven cause. Expanding the existing card did not change that presentation. Native overview acceptance is therefore incomplete. No additional preparation or unapproved UI release was performed. Private screenshot: outputs/google-future-start/native-review-resource-plan.jpg.

Continue with these exact workflow/revision references. Before human review, resolve/refresh the native presentation and prepare a fresh approval card for the same immutable revision; do not duplicate the draft. Human exact-revision approval and separate paused-creation confirmation remain required. Any eventual new campaign's Gate 2/M03 allowlists require their own scoped authorization. Preserve old Google unknown receipt and expired Meta history.

The dated official read-only delivery checks remain unchanged: both original hierarchies PAUSED; no nonzero impressions/spend reported, but empty reports without freshness/completeness do not establish zero-delivery acceptance. Meta historical deliberate consent remains UNKNOWN. M18 remains In Review / Stage 3.2 / 7/9; M17 untouched.

## November 2 06:39 UTC — renewed card Overview verified

The user requested a fresh approval card for the same revision. A conversation refresh, one authorized native campaign_prepare_live (action approve) and one display-only Try again loaded the already-deployed future-start UI. Overview now visibly shows 10 Nov 2026, 00:00:00 (Asia/Kuala_Lumpur), UTC 2026-11-09T16:00:00.000Z, MYR10/day and exact hash QAjKCMMabglfHNtKTQgj1IHIZAPrvMV-KDi0w2YlF0U. No code change, new release, permission change or test rerun was needed; the prior stale presentation is resolved for this fresh card without proving the host's underlying cache cause.

SELECT-only verification at 2026-11-02T06:39:29.259Z confirms workflow 30abb967-aecf-40c4-acd6-4c01f77e7874 remains validated at revision fa086047-87ac-4a03-aca0-676638ec3606; fresh approval challenge is unused and expires at 2026-11-02T06:42:58.501Z (14:42:58 MYT). Confirmation hash is unchanged. Creation and follow-up operation counts remain zero. The host's Allow once authorized preparation only; no immutable-revision human approval was clicked. Existing campaigns were not mutated and retain the prior PAUSED baseline. Stop before human approval or creation. Screenshot: outputs/google-future-start/native-renewed-overview.jpg. M18 remains In Review / Stage 3.2 / 7/9; historical Meta consent and zero-delivery evidence gaps remain unchanged.

## November 2 — human revision approval verified; separate creation card pending

The user explicitly confirmed manually approving the Google card. SELECT-only verification at 2026-11-02T06:42:47.501Z and the native card agree: workflow 30abb967-aecf-40c4-acd6-4c01f77e7874 is approved at unchanged revision fa086047-87ac-4a03-aca0-676638ec3606 / hash QAjKCMMabglfHNtKTQgj1IHIZAPrvMV-KDi0w2YlF0U. The approve audit succeeded at 06:42:10.008Z, and the renewed approval challenge is consumed. Human authorization is evidenced by the user's explicit attestation plus the bound audit/card; it does not authorize Gate 1 execution.

Exactly one separate native campaign_prepare_live action gate1 prepared the paused-creation card for that same revision. At 06:44:08.971Z the workflow remains approved, the Gate 1 challenge is unused, and creation/follow-up operation counts are zero. Confirmation hash Se8MlOFmR-P96L0K1UQJMZVHcBEBVvokmPSitxkitAk; expiry 2026-11-02T06:48:28.487Z (14:48:28 MYT). The card rendered after one display-only reload and visibly shows MYR10/day, November 10 00:00 Asia/Kuala_Lumpur and the exact revision hash. It explicitly creates PAUSED objects and requires separate Gate 2 confirmation for enabling. The assistant did not click Create paused campaign. No provider creation/mutation, new revision, code/configuration change or tests. Existing campaigns retain the prior PAUSED baseline. Private evidence: human-approval-select.json, gate1-prepared-select.json, native-paused-creation-prepared.jpg under outputs/google-future-start. M18 remains In Review / Stage 3.2 / 7/9; historical and reporting gaps unchanged.
