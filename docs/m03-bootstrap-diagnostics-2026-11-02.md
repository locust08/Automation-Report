# M03 startup diagnostics and acceptance continuation

## Outcome and verified production baseline

M03 startup is repaired and **both formal PAUSED-baseline acceptance chains are verified**. The user personally approved each immutable revision and separately confirmed each pause; both existing requests have one verified execution receipt and execution-linked official PAUSED readback. Current backend remains `b6ffd161-7f8a-4fc0-879e-e47806ab43a4`; no further code/configuration change was needed. Google Gate 2, future compensation, complete zero-spend evidence and historical Meta consent remain separate open gates. M18 stays In Review / Stage 3.2 / 7/9.

Initial baseline before repair: read-only Cloudflare inspection on 2 November 2026 confirmed backend `digitalbee-m03-pause-api` version `95d18abd-0a16-4192-9805-33d9cefa6a46`, 100%, deployment `9140fd96-0dcd-4f7c-b2fb-32b74a474896`. Its release was `m03@8b9ba5196b52f2dfbefea75d9da1ddde603326c8`. Independently downloaded `index.js` was 1,243,796 bytes, SHA-256 `3f8addc5aa67c22a6b9dffb62d1a3481301ca6bd8bf3c62b74f2184aecf0e8f4`. Its credential loader and outer handler matched the inspected source. The repair starts at that exact source commit and preserves later receipt-recovery/disposition behavior; no older confirmation worktree was used as the release base. The following baseline observations are historical; completed corrections are recorded below.

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

Read-only inspection of the deployed creation functions confirms `create_v2` returns a prior claim for the same key, source verification uses the same key with `:source`, and creation/source recording occurs within the existing database function. The current absence supported one bounded continuation with the original key; it does not rewrite either historical unknown outcome. The user explicitly authorized that Google-only diagnostic exception; its result is recorded below. Meta preparation remains blocked by the separate credential-placement gap.

### One authorized Google preparation — authentication failure established

Verified Ava's retained Chrome profile and submitted the exact original Google key/source once. The native `pause_campaign_prepare`, action `approve`, returned `unknown/service_http_503`, request ID null, no revision hash and `provider_action:false`. Facade correlation: `d5a2341a-b312-4110-b9c7-236d7951449b`. No approval capability was prepared; the failed interface was not retried. No human approval, pause confirmation, reconciliation or Meta call occurred.

The protected log window contains one bootstrap-failure event on the new backend at `2026-11-02T01:56:00.621Z`: stage `credential_fetch`, reason `authentication`, upstream HTTP 401, duration 273 ms, backend correlation `32b46ad3-178d-40c6-91b1-89b9a2c03722`. This establishes rejection of the deployed Worker credential by Doppler before domain workflow dispatch. The facade's separate correlation is recorded independently. Do not infer token expiry versus revocation, or rewrite older unknown outcomes.

The failure supported correcting only the scoped Worker Doppler binding. The user then explicitly approved the concrete credential change and one subsequent Google preparation. That earlier diagnostic preparation authorization is exhausted; the separately approved correction and continuation are recorded next.

### Scoped credential repair and post-repair Google preparation

Created dedicated read-only, non-expiring service token `m03-pause-worker-20261102` for existing `m03-pause-credentials/prd`. The identical bounded Doppler request returned HTTP 200 and all three required-record shape checks passed. Only `M03_PAUSE_MCP_DOPPLER_TOKEN` was replaced; values stayed in memory and the intended Worker binding, never printed or persisted locally. No existing token was revoked, no loader scope was expanded and no new provider credential was transferred.

Independent readback verifies backend version `9c85bc5c-0528-4c4d-9fa8-aed2145899c6`, unchanged JS SHA-256 `a26cd6a59329f405901edf4614253f368c39c705deaf4c99a9add2082ea6c25f`, unchanged visible configuration/binding descriptors/annotations/routes/schedules and unchanged four peer Workers. Credential rollback target is `4ae44f83-4e7b-4951-9a29-79578412144a`; that version restores the known-rejected old credential. Private `credential-*.json` evidence contains no secret values.

Fresh SELECT-only checks at `2026-11-02T02:03:49.207970Z` again found no matching requests, sources, idempotency claims or execution operations for either original key. The authorized post-repair Google native preparation then ran exactly once with the original key/source. The backend recorded one HTTP 200 invocation on the credential-repaired version, outcome `ok`, wall time 21,018 ms; no bootstrap failure was reported in that request window.

| Google review evidence | Verified value |
| --- | --- |
| Account / campaign | `2315114913` / `24349407517` |
| Saved request | `6cf8e971-a7d5-48f3-8150-bf0ee9c1b0c9`, created `2026-11-02T02:05:19.439940Z` |
| Immutable revision | `836b6c37-d367-4b2b-b552-01d4eee9f796`, revision 1 |
| Revision hash | `e760f91c14cba640b9462d57d5a5f149e4876a8b05271cce50e1d8ae882aaae7` |
| Database state | `awaiting_approval`; validation `passed`; zero approvals; zero execution operations |
| Change | `campaign.status`: `PAUSED` → `PAUSED` |
| Saved source | `8a3dcbf6-c132-4fb6-9116-cc0f449c9593`, `legacy_provider_adoption`, original key plus `:source` |
| Provenance | Exact retained M18 workflow `8711a86d-8b57-403e-8918-b20f1ff1b527`, revision `a454a142-865f-48a1-ba55-9181ae9f2205`, receipt `34f3dcb7-0855-471e-a85c-603cf9c2c483` |
| Baseline capture | `2026-11-02T02:05:16.854Z`; hash `4df29f677ab31b0297680939449411ca0facfe9feafad0d93b65a5cdae360728` |

The transcript says `prepared`, but its claim that the card displayed is contradicted by the observed UI: **Couldn't display DigitalBee MCP**. Opening the existing app result and one conversation reload did not restore it; after reload ChatGPT also reports **This response couldn't load**. The resource's initialization code does not invoke workflow tools, and no Try again/Confirm/Check receipt control was clicked. The exact saved request/revision/source above were independently verified by SELECT, not a reconciling workflow read. Screenshot: `outputs/m03-bootstrap-release/google-review-display-blocked.png`; sanitized result: `google-post-repair-result.json`.

Do not ask for blind human approval or recreate the request. Restore the native display first; any expired review refresh must bind this exact saved request/revision and needs its own bounded continuation authority. Human revision approval and a subsequent separate pause preparation/confirmation remain outstanding. No provider status mutation occurred. The latest Google one-preparation authorization is exhausted. At this Google checkpoint Meta had not been prepared and its source was requested. Names-only inspection of existing `locus-t-mcp-cloudflare-v0/prd` found only Doppler metadata keys. The later verified source, approved placement and Meta result follow.

### Meta placement, preparation and official status evidence — 2 November follow-up

The operator explicitly authorized inspection of the logged-in Doppler scope. Names-only discovery located the existing `META_ACCESS_TOKEN` in `locus-t-ai-backend/dev` and `dev_m18_pause`; private comparison confirmed the same value. The production config has no access-token record. Private, read-only Graph v24.0 checks verified access to exact account `321606578570386` and the PAUSED pilot. No global token value was printed or copied to local files.

After specific placement/preparation approval, only `META_ACCESS_TOKEN` was added to `digitalbee-m03-pause-api` from the existing dev record. Independently verified version: `b6ffd161-7f8a-4fc0-879e-e47806ab43a4`; rollback: `9c85bc5c-0528-4c4d-9fa8-aed2145899c6` (removes Meta access, retains repaired Doppler access). The deployed JS hash remains `a26cd6a59329f405901edf4614253f368c39c705deaf4c99a9add2082ea6c25f`. All previous 23 bindings, settings, annotations, exact allowlists, routes and schedules are preserved; the Meta secret is the sole 24th binding. All four peer Workers remain unchanged. No new source-map upload or runtime code change was needed.

Fresh SELECTs at `2026-11-02T02:26:21.406595Z` found zero Meta requests, sources, claims and operations for the original key; Google retained its exact awaiting-approval request. One native Meta preparation with the original key and exact verified recovery source then completed. Protected backend evidence contains one invocation at `2026-11-02T02:27:44.386Z`, HTTP 200, outcome `ok`, 17,872 ms on the verified version.

| Meta review evidence | Verified value |
| --- | --- |
| Account / campaign | `321606578570386` / `120250129492860590` |
| Saved request | `ce6149f1-1f08-46fc-b2c8-bc7841fa2127`, created `2026-11-02T02:27:32.746298Z` |
| Immutable revision | `062c87b9-9466-4a59-9419-22506ce5b85a`, revision 1 |
| Revision hash | `d66e5b28e8c15f4e0ed0d22f8bcc0e770d2ff6a98fe841fd107ff25320b4e968` |
| Database state | `awaiting_approval`; validation `passed`; zero approvals; zero execution operations |
| Change | `campaign.status`: `PAUSED` → `PAUSED` |
| Saved source | `cfa94381-0a3e-4f16-9859-bb87639daeb0`; original key plus `:source` |
| Provenance | Workflow `3f777789-3e0e-44eb-b604-5a8e4bb97851`, revision `62687d49-94f6-409c-9b7f-f676bcde5d92`, verified recovery `5e9a8992-c1fa-4454-a905-24e36fa12475` |
| Baseline capture | `2026-11-02T02:27:29.795Z`; hash `37ec7c0c3008336959e64e1bc391ea02e8b9fde1d4797f8dfea67921636616d9` |

A SELECT at `2026-11-02T02:28:33.980291Z` independently verifies both saved revisions, passed validation, exact PAUSED→PAUSED changes, zero approvals and zero execution operations. The original unknown results remain historical unknowns. Both one-call continuation authorizations are exhausted.

Meta's assistant prose claims a displayed card, but the actual UI again says **Couldn't display DigitalBee MCP**. No application iframe mounted; observed console warnings did not identify a CSP or network error. The inspected resource route, `_meta.ui.resourceUri`, compatibility alias, MIME type and inline bundle match the [official UI troubleshooting contract](https://developers.openai.com/plugins/deploy/troubleshooting). This source inspection does not prove the host fetched the resource successfully. Main-worker observability returned no events for the Meta window, so it does not establish a resource-fetch cause. No speculative UI deployment, cache-version bump, reconnect, retry or confirmation occurred. Screenshot: `meta-review-display-blocked.png`. A reviewable native card remains the immediate external blocker; preserve both saved requests and diagnose the host/resource-fetch failure before a separately authorized exact-request refresh.

The browser text-entry API interpreted paragraph breaks as separate sends: a context message followed by the exact Meta tool-argument message. Only the latter triggered one preparation; the unsent remainder was cleared. The retained conversation's preparation-only boundary remained in force. No second preparation or confirmation was sent. For any later authorized prompt, paste/fill and inspect the complete composer before one explicit submission.

Official, read-only status and reporting captures:

| Pilot | Capture UTC | Account timezone / currency | Status | Inclusive delivery window | Result |
| --- | --- | --- | --- | --- | --- |
| Google | 2026-11-02 02:25:43.852 | Asia/Kuala_Lumpur / MYR | Exact campaign, ad group and ad all PAUSED | 2026-01-01–2026-11-02 | No rows; no next page; inconclusive |
| Meta | 2026-11-02 02:17:44.057 | Asia/Kuala_Lumpur / MYR | Exact campaign, ad set and ad configured/effectively PAUSED | 2026-10-29–2026-11-02 | No rows; no next page; inconclusive |

Google's evidence-only query initially used removed date fields and returned `UNRECOGNIZED_FIELD`; it was corrected to the documented `start_date_time/end_date_time` fields ([official reference](https://developers.google.com/google-ads/api/fields/v25/campaign)). No production code changed. Google returns start `2026-10-12 11:39:00`; Meta retains start `2026-11-01T10:00:00+0800` and creation `2026-10-29T09:18:42+0800`. Neither schedule was changed.

Empty metrics are not proof of zero spend/impressions. Provider reporting freshness was not independently established, the current account-local day is incomplete, and future Google Gate 2/compensation are outside these captures. Non-serving status is established only at capture time. Historical Meta consent remains unknown and the expired schedule remains preserved.

Private evidence under `outputs/m03-bootstrap-release/`: `meta-placement-*.json`, `meta-preparation-safety.json`, `meta-post-placement-result.json`, `both-saved-review-requests.json`, `meta-official-evidence.json`, `google-official-evidence.json`, and both native-display screenshots. Values and confirmation capabilities are excluded. Existing 94 tests and packaged-worker results are retained; no unrelated tests were repeated.


### Native display recovery — 2 November, after 10:40 MYT

The user authorized continued diagnosis and repair using the existing requests, stopping before human approval. At the first observation Meta's retained card already rendered with the exact account/campaign/revision hash; its expired approval control was disabled. One click of the Google result container's display-only Try again control restored the existing Google card with the exact expected hash and disabled expired approval. This was a host display reload, not a preparation resubmission, workflow read or confirmation. Screenshots and DOM inspection verified the real review controls. No source/configuration change, deployment, permission expansion or new request was needed.

This establishes successful recovery of the observed loading failure, not a permanent root-cause fix. The exact intermittent host/resource-fetch cause remains unproven. A prior same-day failed display and broader saved-response loading errors remain historical evidence. Do not redeploy or change cache/resource versions speculatively.

Fresh SELECT at `2026-11-02T02:41:22.718371Z` verified both existing requests still awaiting approval, unchanged revision IDs/hashes, zero approvals and zero execution operations. Inspected existing-request preparation bypasses creation/source adoption and does not revalidate an awaiting-approval revision; it checks current authorization, integrity and official preview before issuing a new five-minute capability. The user's continuation therefore proceeds with one bounded approval refresh per exact existing request, retaining original keys and stopping before human approval. It never uses `pause_campaign_read`.

Both existing-request refreshes returned prepared/HTTP 200 with unchanged revision hashes. The combined ChatGPT response exposed only the final Meta app surface. Its initial host display failed again; one display-only Try again restored the fresh Meta card, with enabled Approve exact revision and expiry 10:48:23 MYT. No preparation was replayed by that display control. A further bounded Google-only approval refresh, after its successful result and unchanged database state were established, returned the same request/revision/hash. One display-only reload restored that separate card with enabled approval, expiry **10:51:02 MYT**. Screenshots verify the visible cards; the assistant leaves Google untouched for human review. Original requests, revisions and idempotency keys are preserved.

While the assistant was inspecting the restored Meta card, its UI began submitting a confirmation. The assistant stopped UI actions and asked about the click. The user explicitly answered **Yes, I clicked it**. Direct SELECT at `2026-11-02T02:44:48.347650Z` verifies Meta status `approved`, approval `4f59e780-890e-4562-a765-13b2ee0021cb`, exact revision `062c87b9-9466-4a59-9419-22506ce5b85a` and hash `d66e5b28e8c15f4e0ed0d22f8bcc0e770d2ff6a98fe841fd107ff25320b4e968`, created `2026-11-02T02:44:30.502657Z`. The native completion displays success, correlation `e0c4d5c1-8b40-4125-b8d2-5c40f679a67a`, `provider_action:false`, and the same approval evidence. Both requests still have zero execution operations. Google remained awaiting approval with zero approvals. No assistant confirmation click, separate pause preparation, receipt reconciliation or provider mutation occurred. This is fresh M03 human-approval evidence only, unrelated to historical Meta consent.

Final SELECT at `2026-11-02T02:47:03.046164Z`: Google awaiting_approval, zero approvals; Meta approved, one approval. Each retains exactly one original revision and zero execution operations. No card read/confirmation or pause button was clicked by the assistant. Screenshot evidence: `google-review-restored.png`, `meta-review-restored.png`, `meta-human-approved.png`. The operational workaround is to reload only the failed host display and present one pilot per response; a durable fix for the host's initial loading failure remains outside the proven evidence. Existing scoped and bundled tests are retained; no runtime code changed or tests repeated.

### Both formal M03 pause chains verified — 2 November, 10:54 MYT

The user confirmed personally approving Google as well as Meta. SELECT at `2026-11-02T02:49:31.193025Z` verified both exact immutable approvals and zero execution operations before separate pause preparation. Google approval `ec00d33e-7f54-4dbc-b069-648a1c99e6c1` was created `2026-11-02T02:47:28.506265Z`; its native success correlation is `0afaf20b-e4f7-467e-8210-9afd4fc01321`. Meta approval is recorded above.

The assistant clicked **Prepare separate pause** exactly once in each existing approved card. The inspected button invokes preparation only, with the same request selection and a new stage-specific capability operation key; it cannot confirm or execute a pause. Both cards rendered directly with their existing revision hashes and enabled **Pause this campaign** controls. Expiries were Google 10:55:26 MYT and Meta 10:55:39 MYT. Protected backend evidence recorded two HTTP 200 preparation invocations (14,603 ms Google and 11,556 ms Meta). The assistant stopped before confirmation.

While evidence was being recorded, both requests acquired execution receipts. The assistant stopped UI actions and asked whether the user confirmed them. The user explicitly answered **Yes, I confirmed both**. This establishes separate deliberate human pause confirmations after the earlier exact-revision approvals. The assistant clicked neither confirmation, issued no provider operation directly and performed no reconciling workflow read.

| Terminal evidence | Google | Meta |
| --- | --- | --- |
| Request | `6cf8e971-a7d5-48f3-8150-bf0ee9c1b0c9` | `ce6149f1-1f08-46fc-b2c8-bc7841fa2127` |
| Immutable revision | `836b6c37-d367-4b2b-b552-01d4eee9f796` | `062c87b9-9466-4a59-9419-22506ce5b85a` |
| Execution receipt | `a3c7194b-f5ed-466d-b75b-5beea525bf48` | `bd225981-9226-43fa-a577-074d4c735396` |
| Receipt created UTC | 02:51:38.951746 | 02:51:34.873276 |
| Terminal state / result | verified / succeeded | verified / succeeded |
| Execution-linked official readback UTC | 02:51:51.924 | 02:51:48.336 |
| Official identity/status | account 2315114913 / campaign 24349407517 / PAUSED | account 321606578570386 / campaign 120250129492860590 / PAUSED |
| Readback hash | `4253a4d7b57066083a4389d4bb947c134266f599f0b21002c9712eb61c267ac3` | `d8040670e3138a4e99df672d9573af2ad3f2f37e61664fab25ae9eefcd30104c` |
| Native success correlation | `e43cf4a5-4811-4297-9a67-02e6bd70c60f` | `3c2a2218-2a88-4279-a22f-0e51490f6a82` |

Final SELECT at `2026-11-02T02:54:03.551203Z` verifies **both requests are verified**, each retaining exactly one original revision, one matching approved revision/hash and one verified execution operation. Native completion reports `provider_action:true` and disables the consumed pause button. Durable operation keys bind each unchanged request, revision hash, original change item and `:pause`; no replacement request or duplicate execution claim was created. The execution-linked provider readbacks above establish PAUSED→PAUSED acceptance for these exact pilots.

This completes both formal M03 pause evidence chains, including retained source provenance, exact immutable human approval, separately rendered pause review, explicit human confirmation, terminal receipt and official readback. It does **not** authorize or complete Google Gate 2, a future changed-baseline compensation, zero-spend evidence, or historical Meta consent. The expired Meta schedule and all historical unknown receipts remain preserved. M18 remains In Review / Stage 3.2 / 7/9; M17 untouched. No activation, schedule, recreation, migration, code change, deployment or repeated regression test occurred in this continuation.

Private evidence: `approvals-before-pause-cards.json`, `separate-pause-cards-and-observed-receipts.json`, `both-m03-chains-final.json`, Google/Meta unconfirmed-card screenshots, and `google-pause-verified-card.png`. The raw capability values were never read or persisted. The prior zero-provider-operation statements are historical checkpoints superseded only by these separately human-confirmed PAUSED operations.


## Outstanding dependencies and acceptance ledger

### Historical operator-access checkpoint — superseded by verified releases above

The user completed the manual scoped Doppler login. Authorized CLI inspection now identifies the existing `Locus-T CRM08` workplace and successfully reads `m03-pause-credentials/prd`. All three required records are present and pass the existing string/minimum-32-character check; values were processed only in local memory and never printed or persisted. This validates the operator-accessible records, not the separately deployed Worker token or its exact effective response.

The service-token metadata command succeeds but returns JSON `null`, with no token entries available to inspect. One bounded 100-entry activity request returned three entries and no M03-project matches. Neither result establishes the deployed token's validity, expiry or revocation history. The exact production startup cause remains unproven; do not rotate credentials on this evidence alone. The earlier Putri/browser-access blocker below is historical and superseded for CLI diagnosis. Publication and production-release approvals remain outstanding; the user's `done` refers only to completing login.

No tests were repeated and no credential, provider, database or production runtime mutation occurred in this follow-up. Next: approve the concrete diagnostics-only backend release (source `dccadfdcd946b8d3ac3dcabcb0a26dd2c0211c63`, existing US503297 source-map workflow, same 23 binding descriptors), then use only a separately authorized bounded diagnostic/continuation. No campaign preparation may be used as an unapproved probe.

The existing Ava Chrome sign-in reaches only the unrelated Putri Doppler workspace. The operator who can access `m03-pause-credentials/prd` must restore the existing authorized session. No CLI login was replaced, no service token rotated and no permissions expanded. Inspect service-token validity/access and required-record presence there, not in Putri. Value shape can only be checked privately inside the authorized runtime. No claim is made that operator login alone validates the Worker's token.

| Gate | Evidence required / current disposition |
| --- | --- |
| Startup repair | Complete for the diagnosed authentication failure: scoped secret replacement verified; post-repair native Google request reached HTTP 200 and persisted/validated. |
| Google M03 | Complete for exact PAUSED baseline: source, immutable human approval, separate human pause confirmation, terminal verified receipt and official PAUSED readback. |
| Meta M03 | Complete for exact PAUSED baseline: source, immutable human approval, separate human pause confirmation, terminal verified receipt and official PAUSED readback. Historical Gate 2 consent remains unknown. |
| Continuation safety | After verified correction, SELECT-only lookup of requests, sources and claims for attempted keys. Preserve the prior unknown outcomes. Do not use `pause_campaign_read` as a passive lookup: it can reconcile. |
| Google Gate 2 | Separate phase after M03 readiness; fresh QA where expired, exact approved account-local midnight at least 72 hours ahead, human confirmation, official schedule evidence, then separately reviewed M03 compensation against the changed baseline. |
| Official non-serving / spend | Both exact hierarchies are PAUSED at the captures above. Date-bounded reports returned empty rows; freshness/current-day completion and future Gate 2/compensation remain unresolved. Zero spend is inconclusive. |
| Meta historical authorization | User cannot attest. Existing account attribution does not establish deliberate human intent; history remains unresolved. |
| Meta expired schedule | Preserve; no retiming, reactivation, recreation or retroactive approval. A prospective replacement requires separate review. |

Keep the original keys: Google `c7d48106-34cc-449e-afff-6b0d02511fca`, Meta `2a4a6436-3ff0-4b25-87d4-76b6c3cdcb32`. Historical failed attempts and the bounded successful continuations are recorded above. Both now have exact saved requests; continue those requests only under separately bounded authority, never allocate replacement keys to evade uncertainty. New-request preparation uses action `approve`, exact source references and no request_id only when absence is established; it is no longer appropriate to create either pilot again. Human revision approval and human pause confirmation remain distinct.

M18 remains In Review, Stage 3.2, 7/9 with both remaining criteria unchecked. Both exact M03 pause chains now pass after separate human approvals and pause confirmations; official execution-linked readbacks preserve PAUSED. No assistant confirmation, blind retry, workflow reconciliation, activation, scheduling, recreation or migration occurred. M17 remains untouched. These receipts do not establish zero spend or retrospective Meta authorization and do not authorize future Google Gate 2.
