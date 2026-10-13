# M03 Cloudflare backend migration candidate

Owner: `01a12f26-4010-73c6-9316-7734e82cc00b`. Integration: `01a12ed0-ee4b-749e-a39a-430f2eb60030`; controlled MCP release: `01a12f26-a109-72d6-bb26-8a545cfea016`.

Automation-Report branch `codex/m03-worker-migration-01a12f26`, isolated workspace `.worktrees/m03-worker-migration-01a12f26`, starts at freshly fetched dashboard `3af196aa41e567b15a4817f236b1a20095f00be4`. Its M03 service paths have no difference from diagnostic source `83fc7b1f2d3a5f2cd331dedb97aa418412516557`. Dashboard fixes and existing `fef5322` history remain ancestors. The routing companion is DigitalBee `codex/m03-worker-routing-01a12f26`, based on verified live parser source `738ec9ccf2eac7602d59f8f335e430da62eb27b9` / Worker `c7246350-ae53-42e2-b6a8-7385fb549f28`.

## Implemented boundary and authority

`cloudflare/m03-pause-api` executes the existing cookie-independent `POST /api/service/digitalbee/m03-pause` contract: read, prepare_approve, prepare_pause, approve and pause. The same domain functions, Supabase REST/RPC repository, source verification, immutable PostgreSQL hash receipts, exact approvals, deterministic execution claims, provider transport and reconciliation remain authoritative. No D1 workflow, copied data, new migration, provider activation or scheduled task is introduced. Dashboard hosting and its general M03 UI/API routes remain independent; this candidate ports the employee MCP backend only.

The private reverse authority fetch uses the existing canonical grant URL, bound action/native scope/revision and current operator email. Main signs a 30-second delegation to the configured canonical M03 origin even when `M03_BACKEND.fetch` carries it. There is no public fallback or POST retry after private binding selection. Preparation and execution still require separate private actor/session/revision-bound confirmations. Worker confirmations additionally bind canonical origin and signed network context, preventing reuse across a host cutover or changed ingress address.

Request-local AsyncLocalStorage supplies Supabase bindings; provider credential resolution receives the explicit environment. Nothing changes global process.env. Worker-required production mode cannot inherit development auth bypass. Response bounds: input16KiB, grant32KiB, Doppler64KiB, Supabase1MiB; existing Meta64KiB and Google client bounds remain. M03 Google Notion resolution is quiet, 10-second requests, at most20 pages and1MiB per response, with existing bounded read-only retries. It fails closed rather than silently omit remaining pages. Other dashboard Notion callers retain default behavior.

Actual workerd exposed unsupported `redirect:error`; M03 Doppler and Meta now use manual redirects and reject non-success responses. The Google pause wrapper also selects manual redirects. Safe diagnostic stage/category/correlation from83fc7b1 remain; no raw error, token, URL or provider payload is added to M03 failure logs.

## Trusted ingress: verified policy correction

Main accepts network context only from the runtime-attested public Cloudflare request, one valid CF-Connecting-IP and no CF-Worker header. Raw model arguments, forwarding headers, private service headers, pseudo IPv4 and missing runtime context fail closed. The backend requires this claim inside the verified delegation and ignores incoming CF/Vercel forwarding headers. The network claim is excluded from the existing strict grant-verifier packet.

Source migration `20260826014720_m03_reserve_trusted_networks.sql` and read-only live `pg_get_functiondef(m03_ads_internal.resolve_operator(uuid,inet))` on October13 agree: M03 enforces active administrator plus approved operator email domain; IP is audit evidence and the M03 CIDR table is reserved. This candidate preserves that exact policy. Tests simulate operator/domain denial, not a claimed live CIDR gate. No allowlist/domain/CIDR permission change is required or performed. Actual ChatGPT ingress provenance remains a controlled user-read acceptance gate.

## Proposed configuration and secret names — not provisioned

| Placement | Proposed names / contract |
| --- | --- |
| New Worker | `digitalbee-m03-pause-api`, account `e7c515dde995479daacd82ad79dfc3e8`; production config currently locked, public workers.dev/preview URLs off |
| Main private binding | `M03_BACKEND` → new Worker; no automatic fallback |
| Reverse private binding | `DIGITALBEE_AUTHORITY` → existing `digitalbee-mcp` |
| Canonical origin | New `M03_CANONICAL_ORIGIN`; same approved HTTPS origin in main `M03_PAUSE_MCP_BASE_URL`; grant verifier URL remains existing `/v1/internal/grants/verify` |
| Runtime controls | `M03_WORKER_ENABLED`, existing `M03_PAUSE_MCP_ENABLED`, subject/actor, connection revision, `M03_PAUSE_ENABLED`, exact `M03_PAUSE_ALLOWLIST`; existing main exact allowlist/global controls/OAuth consent unchanged |
| Shared service credentials | `M03_PAUSE_MCP_SERVICE_TOKEN`, `M03_PAUSE_MCP_DELEGATION_KEY`, `DIGITALBEE_GRANT_VERIFY_TOKEN` |
| Supabase server authority | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (existing supported aliases retained); same approved project, never browser credentials |
| Provider routing | Existing Google OAuth client ID/secret/refresh token, developer token, API/project metadata, Notion token/account database; existing Meta token/version only if its exact pilot is enabled |
| Optional scoped Doppler source | `M03_PAUSE_MCP_CREDENTIAL_SOURCE`, `M03_PAUSE_MCP_SECRET_PROJECT`, `M03_PAUSE_MCP_SECRET_CONFIG`, `M03_PAUSE_MCP_DOPPLER_TOKEN`; existing loader requests only its enumerated service/Google/Notion names. Supabase/Meta require separately approved placement |

Credential placement in a new Worker is new ongoing access even when values already exist. Choose and explicitly approve secure placement or a scoped existing read-only Doppler identity. No values were read/exported/copied, no token created and no access configured here. Never put secret values in CLI arguments, Git, maps, logs or this handoff.

## Checks and release phases

Mocked tests exercise canonical audience under a different binding URL, body/action/revision/subject/session and bearer mismatches, missing/malformed/spoofed network context, revoked grants/operator, disabled controls/missing binding/unsafe origin, response bounds, concurrent environment isolation and Supabase RPC scope/hash preservation. Existing domain/client tests cover ambiguous responses, interrupted claims, durable readback, baseline drift and no mutation replay.

The workerd harness runs the actual bundled Worker against intercepted synthetic Supabase/authority/Notion/OAuth/Google/Meta services. Each platform completes read → separate approval card → exact approval → separate pause card → single PAUSED-only synthetic update → verified receipt → replay without another update. It also denies missing ingress, operator and grant access before provider reads. There are zero live provider/database actions. This is contract/runtime parity, not execution of SQL migrations or live acceptance.

1. Parent reviews both exact sources and shared reporting helper changes. No shared integration branch is edited by this feature owner.
2. Approve credential/access placement, chosen canonical origin and two service bindings; retain existing controls/secrets and snapshot their names/config hashes. Provision/deploy backend initially locked. No database migration or history move is needed.
3. Release owner builds/instruments exact artifacts, records bundle/map/config hashes, obtains any required private source-map upload approval, and verifies no-bundle deployment matches those bytes. Preserve shared ErrorMonitor authority; adding a new probe/monitor binding needs explicit review.
4. Approve controlled main routing/origin/connection-revision cutover. Let old private cards expire and require fresh discovery/read; never carry pending confirmation capsules across hosts. Keep existing Vercel route and release references for rollback. No agent live diagnostic/provider flow is authorized.
5. User runs one bounded connected read and returns Worker/outcome/blocker/correlation. Stop on missing ingress, denial, drift or uncertainty. Separate user authorization/cards are required for any later preparation, approval and pause acceptance. M18 remains5/9 In Review.

## Rollback and no replay

Stop new preparation/confirmation intake through the approved controls without deleting Supabase state. Reconcile any started/ambiguous claim through official readback; never resend a pause because transport was lost. Restore the exact pre-cutover main artifact/base URL/revision and remove the optional binding only under controlled rollback approval. Existing Vercel production `fef5322` / `dpl_43K9R29uFC43AxudjDSTHu5nBWpQ` remains retained, with prior rollback `dpl_14AxHTTjeHaRPiaK15FWJENRrfne`. Backend diagnostic compatibility must be retained before rolling frontend parsing back to older strict code. Expire outstanding cards, then fresh discovery/read. Do not delete the Worker, repository histories, grants, provider resources or business data as rollback.

Official runtime references checked October13: [AsyncLocalStorage](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/), [Request runtime and redirects](https://developers.cloudflare.com/workers/runtime-apis/request/), [HTTP service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/), [Miniflare standards](https://developers.cloudflare.com/workers/testing/miniflare/core/standards/).

Final source/artifact/check receipt follows after frozen validation and verified repository-local author setup. No publication, deployment, cutover or live acceptance is claimed.

## Frozen local checkpoint
Worker dry run:865.09KiB /149.21KiB gzip. Bundle SHA25610af59749f67b3a6a5e5dfc90d3a406ae6a94b72d70b2cf2ad79629c69e08903; source map07f1d56c13dabd0b4de990b455f95196aa278a20cc472bef5709868d3187a2c6; locked disabled config60bf3dfa60e4cf57d6c008488cfc15a35b34a7ea8f84f17da823c26d5aa45cc0; dependency lockc28c8596386740ac4dfdf5ac3e71556b7dbe22573007f8eb77f89873f4468768. Artifacts retained locally under cloudflare/m03-pause-api/artifact and excluded from Git. These are uninstrumented local parity bytes, not an approved/uploaded production artifact; release owner must record any later instrumentation/transformed hashes.
Final actual workerd Meta, Google and scoped-Doppler Google fixtures PASS, each with1 synthetic provider POST/no replay/zero live calls. New security/bounds/REST contract checks9/9; earlier existing domain/client regressions112/112; MCP companion26/26 and its types pass. Worker types pass. Final root types/scoped lint and commit receipts are checked before handoff. Effective author/committer now verified locust08 <locust.crm08@gmail.com> from human-approved common repository-local setup; existing history was not rewritten. No push/PR/production deployment/cutover/credential transfer or user live test occurs in this checkpoint. Direct parent message failed thread lookup; platform final handoff supplies readiness.
