# M03 startup diagnostics and acceptance continuation

## Outcome and verified production baseline

The diagnostics-only repair is deployed and independently verified as backend version `4ae44f83-4e7b-4951-9a29-79578412144a`. The shared startup cause remains unresolved. Private credential/bootstrap classifications preserve the public HTTP 503 contract and confer no confirmation/execution authority. Deployment is not a completed credential repair or connected acceptance result.

Read-only Cloudflare inspection on 2 November 2026 confirms backend `digitalbee-m03-pause-api` version `95d18abd-0a16-4192-9805-33d9cefa6a46`, 100%, deployment `9140fd96-0dcd-4f7c-b2fb-32b74a474896`. The deployed release is `m03@8b9ba5196b52f2dfbefea75d9da1ddde603326c8`. Independently downloaded `index.js` is 1,243,796 bytes, SHA-256 `3f8addc5aa67c22a6b9dffb62d1a3481301ca6bd8bf3c62b74f2184aecf0e8f4`. Its credential loader and outer handler match the inspected source. The isolated candidate starts at that exact source commit and preserves later receipt-recovery/disposition behavior; no older confirmation worktree is used as the release base.

The backend is enabled, its canonical HTTPS origin and reverse authority binding are configured, and its exact allowlist contains the historical Google campaign plus both required pilots. The Doppler binding name is present; its validity is still unproven. The local CLI's previously rejected auth token is a different credential.

An additional downstream Meta blocker is established from the deployed source and binding descriptors: there is no `META_ACCESS_TOKEN` binding, the scoped loader does not request that name, and the provider adapter has no other Meta token source. Do not silently extend the loader, copy a token, or change the shared credential project's access. The existing migration contract requires separately approved Meta credential placement. This is independent of the earlier shared startup 503.

## Implemented behavior

- Typed private failure stages/reasons distinguish worker/credential configuration, authentication, permission, timeout/network, upstream HTTP, body limit/JSON/shape and missing/malformed required records.
- Protected structured logs contain only the fixed event name, allowlisted stage/reason, elapsed milliseconds, optional HTTP status and generated correlation. The response uses the same correlation. Existing PostHog capture receives it too, while its privacy filter remains unchanged.
- Errors retain no raw cause, response, credential name or value. Required values cannot fall back to stale bound copies; malformed response shapes fail closed.
- Existing five-second credential timeout, 64 KiB response limit, enumerated secret scope, request-local environment, separate confirmations, current grants and exact revisions remain. No retries, new endpoint, migration or credential access was added. Disabled controls retain their ordinary locked response.

## Local verification

- 43 new tests pass: 29 loader/privacy/isolation cases and 14 actual-handler bootstrap/route cases. The timeout case exercises the real five-second abort. Every tested bootstrap rejection stays before domain dependency access.
- Two existing credential-environment tests and 41 affected backend authorization/card/pause/recovery tests pass.
- Eight affected facade transport/native preparation cases pass against the retained main source; 19 unrelated cases in that file are skipped. No provenance suite was repeated.
- Actual packaged workerd: 10 bootstrap failures pass with matched private-log/response correlations, one credential fetch per case and zero authority/provider/database calls. Google with scoped Doppler and Meta with an explicit synthetic token each pass separate approval/pause confirmations, official fixture readback and duplicate suppression (one synthetic provider POST each, zero live calls).
- Worker TypeScript, root TypeScript and scoped ESLint pass. The first test-file parse error was corrected; the final loader suite passes. Initial workerd attempts were blocked by sandbox loopback access; the identical fixtures pass with authorized local loopback access.
- Wrangler 4.135.0 local dry run passes. Its global log-file write was denied by the filesystem sandbox; packaging completed with exit 0. Local `artifact/index.js` SHA-256: `4785e149340b3d5059a659dbdb9a9214fbe143c381a978fcdef80dfb1c478cbd`. This is an uninstrumented local bundle, not a deployed artifact. No source maps were uploaded.

## Release boundary and rollback

Implementation commit: `dccadfdcd946b8d3ac3dcabcb0a26dd2c0211c63`, branch `codex/m03-bootstrap-diagnostics-20261102`. Automatic approval review initially rejected publication to the public repository. After explicit approval for the exact branch, code and sanitized evidence, the Git push succeeded through existing Git authentication. The GitHub CLI identity's READ permission did not describe the separate working Git authentication. Published [implementation](https://github.com/locust08/Automation-Report/commit/dccadfdcd946b8d3ac3dcabcb0a26dd2c0211c63) and [branch](https://github.com/locust08/Automation-Report/tree/codex/m03-bootstrap-diagnostics-20261102).

Ignored release preparation is in `outputs/m03-bootstrap-release/`: live backend descriptors (23 bindings, no secret values), a production-derived candidate configuration, and sanitized result JSON. All current binding identities and plain-text values are preserved except the proposed truthful POSTHOG_RELEASE. Public/preview exposure remains off and schedules remain empty. The profile is a review candidate; do not deploy the uninstrumented bundle before the approved PostHog exact-artifact workflow and fresh production comparison.

The production-derived configuration passes a local no-bundle Wrangler dry run with the existing reverse-authority binding and exact pilot variables. It is not a deployment. The original handoff received an append-only checkpoint and the M18 Notion record received the same scoped evidence without checkbox, stage or status changes.

Deploy only `digitalbee-m03-pause-api` after the specific production approval. Main MCP, M04, M05, gateway and dashboard need no source deployment for this diagnostics candidate. Preserve all existing backend binding descriptors, values, allowlists, runtime/exposure settings and schedules. Change only backend source and its truthful release identifier; preserve the existing US PostHog project 503297 and complete its approved exact-artifact source-map release workflow before deployment. Record final instrumented hashes separately from the local packaging hash above.

Rollback target is backend version `95d18abd-0a16-4192-9805-33d9cefa6a46`, with its existing configuration and credentials. No schema change needs rollback. Rollback never deletes receipts or replays an operation. A diagnosed credential correction is a separate exact diff and needs specific approval; no credential value may be copied into Git or evidence.

### Approved release verified — 2 November follow-up

The user separately approved public source publication, the exact M03 source-map payload and local paths to US PostHog project `503297`, and the exact production backend deployment. Earlier automatic approval rejections were resolved by those explicit approvals; no rejected action was bypassed. PostHog preparation and upload completed before one backend upload. Only code and `POSTHOG_RELEASE=m03@dccadfdcd946b8d3ac3dcabcb0a26dd2c0211c63` changed.

- Final injected `index.js` SHA-256: `a26cd6a59329f405901edf4614253f368c39c705deaf4c99a9add2082ea6c25f`.
- Uploaded source-map SHA-256: `bbd4febe1efe22d92a3bc3da92b44843f3406199fdc762897ee737d4ec1422a8`.
- New backend version: `4ae44f83-4e7b-4951-9a29-79578412144a`, 100%. Independent deployed-content download matches the injected artifact exactly.
- All 23 binding descriptors, existing credentials, allowlists, runtime settings, annotations, routes, disabled public/preview exposure and empty schedules are preserved. Main MCP, M04, M05 and gateway versions, content hashes and configuration snapshots are unchanged; no dashboard deployment occurred.
- The final injected artifact passed the same 10 workerd bootstrap cases and both mocked Google/Meta approval-pause-readback flows. One synthetic provider mutation per flow, no duplicate replay, zero live provider/database calls. The earlier 94 scoped checks remain retained; unrelated suites were not repeated.
- Private release evidence: `outputs/m03-bootstrap-release/{baseline,prepared,attempt,response,verified}.json`; source/map/manifest under `instrumented-bundle-v2/`. The build uses `upload_source_maps` only for local dry-run map generation; the Cloudflare upload contains the prepared JS module only. Source maps went to the approved PostHog project.

The initial retained packaging flag was unsupported by Wrangler 4.135.0; the fresh v2 build uses its verified schema. Cloudflare metadata reads initially returned 429, then 401 after cooldown. Wrangler refreshed the existing Ava OAuth session without a new login or expanded scopes. Sequential baseline and verification then succeeded. No failed deployment was retried: there was exactly one production upload.

### SELECT-only continuation safety — 2 November follow-up

At `2026-11-02T01:51:13.339542Z`, fresh direct SELECTs in the existing Supabase project found **zero requests, zero source records, zero idempotency claims and zero execution-operation records for each pilot**. Searches covered exact campaign identities, retained workflow references, original keys and suffixed keys, plus linked request IDs. No workflow read endpoint, reconciliation function or mutation was called.

Read-only inspection of the deployed creation functions confirms `create_v2` returns a prior claim for the same key, source verification uses the same key with `:source`, and creation/source recording occurs within the existing database function. The current absence supports proposing one bounded continuation with the original key; it does not rewrite either historical unknown outcome or prove the deployed Doppler token valid. A Google-only native approval preparation has been proposed as a specifically authorized diagnostic exception; it remains unsubmitted pending that answer. Meta preparation remains blocked by the separate credential-placement gap.

## Outstanding dependencies and acceptance ledger

### Operator access restored — 2 November follow-up

The user completed the manual scoped Doppler login. Authorized CLI inspection now identifies the existing `Locus-T CRM08` workplace and successfully reads `m03-pause-credentials/prd`. All three required records are present and pass the existing string/minimum-32-character check; values were processed only in local memory and never printed or persisted. This validates the operator-accessible records, not the separately deployed Worker token or its exact effective response.

The service-token metadata command succeeds but returns JSON `null`, with no token entries available to inspect. One bounded 100-entry activity request returned three entries and no M03-project matches. Neither result establishes the deployed token's validity, expiry or revocation history. The exact production startup cause remains unproven; do not rotate credentials on this evidence alone. The earlier Putri/browser-access blocker below is historical and superseded for CLI diagnosis. Publication and production-release approvals remain outstanding; the user's `done` refers only to completing login.

No tests were repeated and no credential, provider, database or production runtime mutation occurred in this follow-up. Next: approve the concrete diagnostics-only backend release (source `dccadfdcd946b8d3ac3dcabcb0a26dd2c0211c63`, existing US503297 source-map workflow, same 23 binding descriptors), then use only a separately authorized bounded diagnostic/continuation. No campaign preparation may be used as an unapproved probe.

The existing Ava Chrome sign-in reaches only the unrelated Putri Doppler workspace. The operator who can access `m03-pause-credentials/prd` must restore the existing authorized session. No CLI login was replaced, no service token rotated and no permissions expanded. Inspect service-token validity/access and required-record presence there, not in Putri. Value shape can only be checked privately inside the authorized runtime. No claim is made that operator login alone validates the Worker's token.

| Gate | Evidence required / current disposition |
| --- | --- |
| Startup repair | Diagnostics deployed and verified; exact startup cause and any evidence-supported credential/configuration correction remain open. |
| Google M03 | Account `2315114913`, campaign `24349407517`; no completed request/approval/pause/readback chain. |
| Meta M03 | Account `321606578570386`, campaign `120250129492860590`; same missing chain plus absent backend Meta credential placement. |
| Continuation safety | After verified correction, SELECT-only lookup of requests, sources and claims for attempted keys. Preserve the prior unknown outcomes. Do not use `pause_campaign_read` as a passive lookup: it can reconcile. |
| Google Gate 2 | Separate phase after M03 readiness; fresh QA where expired, exact approved account-local midnight at least 72 hours ahead, human confirmation, official schedule evidence, then separately reviewed M03 compensation against the changed baseline. |
| Official non-serving / spend | Read exact hierarchy status and complete date-bounded impressions/spend covering creation/recovery/schedule/compensation, with account timezone and freshness. Status alone is insufficient. No fresh provider evidence collected in this repair. |
| Meta historical authorization | User cannot attest. Existing account attribution does not establish deliberate human intent; history remains unresolved. |
| Meta expired schedule | Preserve; no retiming, reactivation, recreation or retroactive approval. A prospective replacement requires separate review. |

Keep the original keys: Google `c7d48106-34cc-449e-afff-6b0d02511fca`, Meta `2a4a6436-3ff0-4b25-87d4-76b6c3cdcb32`. Each was already attempted once. Reuse only after evidence-supported safety determination and a separately bounded continuation; never allocate replacement keys to evade uncertainty. Approval preparation uses action `approve`, exact source references and no request_id only when a new request is established as appropriate. Human revision approval and human pause confirmation remain distinct.

M18 remains In Review, Stage 3.2, 7/9 with both remaining criteria unchecked. Campaigns were left unchanged at their retained paused baseline; M17 untouched. This follow-up deployed only backend diagnostics and read database metadata/state. No live preparation, provider read/mutation, reconciliation, scheduling, recreation, migration or runtime credential change occurred. No fresh official paused-state or spend claim is made.
