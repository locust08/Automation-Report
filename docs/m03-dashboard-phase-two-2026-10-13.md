# M03 dashboard backend: remaining phase and parity contract

The current Worker candidate migrates the employee MCP pause boundary only. It is **not an all-M03-backend migration**. The following16 Next/Vercel routes (19 method handlers) remain unchanged and are not served by the private Worker. `/api/service/digitalbee/m03-pause` also remains as the retained Vercel rollback endpoint, although its employee MCP contract now has a Worker candidate.

| Remaining path | Methods | Domain/dependency |
| --- | --- | --- |
| `/api/change-control/requests` | GET, POST | Scoped listing; schema; current operator; M04 verified handoff/official adoption; create RPC/idempotency |
| `/api/change-control/requests/[id]` | GET, PATCH | Sanitized immutable detail; role/state permission; expected lock version; source-boundary preservation; edit RPC |
| `/api/change-control/requests/[id]/validate` | POST | Current session/operator; allowed draft states; validation RPC/new immutable revision |
| `/api/change-control/requests/[id]/approve` | POST | Creator/role restriction; latest exact hash; awaiting-approval state; approval RPC |
| `/api/change-control/requests/[id]/cancel` | POST | Allowed state/role; current operator; cancellation RPC |
| `/api/change-control/requests/[id]/provider-preview` | GET | Current role/operator; source/baseline/capability preview; browser sanitization |
| `/api/change-control/requests/[id]/publish` | POST | Admin; exact revision+approval; current narrow pause gate; durable execution; broader publishing remains423 |
| `/api/change-control/requests/[id]/verify` | POST | Exact approved scope; readback/reconciliation only; no mutation replay |
| `/api/change-control/requests/[id]/retry` | POST | Existing locked provider route; never unlock by migration |
| `/api/change-control/requests/[id]/resolve-conflict` | POST | Existing locked provider route |
| `/api/change-control/requests/[id]/rollback` | POST | Existing locked provider route; no automatic compensating provider mutation |
| `/api/change-control/provider` | POST | Existing general provider lock response423 |
| `/api/change-control/google/resources` | GET | Current session/operator; synchronized Google resources; Notion access path; Google OAuth/API |
| `/api/change-control/meta/resources` | GET | Current session/operator; synchronized Meta resources and identity |
| `/api/change-control/tiktok/resources` | GET | Current session/operator; synchronized TikTok resources/assets; TikTok token/client |
| `/api/change-control/settings` | GET, PUT | Admin; operator domains; shared M04 destination domains/networks. Requires M04 ownership review; M03 CIDR mutation stays reserved |

Shared dependencies outside these routes: dashboard `/api/auth/*` and server-session/current-user resolution; `ads_reporting_session` HTTP-only cookie; issuer/audience/signing lifetime; active profile/role reload; campaign actor UUID mapping; Supabase project/REST/RPC/RLS; source/revision hashes and execution claims; provider credentials; shared M04 settings; workspace/browser response contracts. Shared reporting/auth routes and dashboard UI hosting are not moved by this feature branch. The ads-change-digest cron and broader ads-management APIs are separate service concerns; moving M03 does not authorize their scheduling or provider writes.

## Why a second phase is required

The Worker is private with public/preview URLs disabled. Next/Vercel has no Cloudflare service binding. Browser requests currently use a same-origin cookie and Next server-session helpers. Repointing URLs would neither deliver that cookie correctly nor preserve current session/role rechecks, and importing Next cookie/response APIs into a Worker is not a domain port. The employee MCP subject/role grant is also not a substitute for a dashboard session.

A concrete parity migration can preserve Vercel UI hosting while introducing a reviewed Cloudflare same-origin front door for the dashboard. That gateway would route the16 M03 paths to private `M03_BACKEND`, proxy existing UI/auth paths to the unchanged Vercel origin, and carry runtime-attested audit provenance through private RPC. Existing shared dashboard `/api/auth/session` can supply fresh user ID/email/role after validating the HTTP-only cookie against current Supabase profile, avoiding placement of the dashboard JWT secret on M03. Authorization responses must be bounded, uncached and origin-pinned, with no redirect or user-selected upstream; every transition/provider dispatch reauthorizes. Alternatively, port shared authentication itself only under explicit additional scope/access approval.

Required decision before implementing that front door: approved dashboard hostname/origin and who owns its cookie/auth routing. No hostname, cookie domain, CORS relaxation, JWT-secret copy, public Worker route, dashboard deployment or new access is authorized implicitly here. These are an actual interface/ownership decision, not a missing API token. The current Vercel-hosted dashboard remains usable during phase one.

## Implementation and acceptance sequence for phase two

1. Dashboard owner and integration owner freeze the current source, enumerate current callers and select the same-origin/auth front door. Keep all existing cookie properties and current-user verification; no synthetic operator bypass.
2. Extract the19 method handlers into platform-neutral M03 application services. Preserve schemas, HTTP status/error shapes, creator restrictions, optimistic locking, exact revision/hash, source boundaries, idempotency, sanitizer and all locked actions. Existing Next adapters remain thin compatibility wrappers until cutover.
3. Make every reachable provider/config helper request-local; remove server-global credential assumptions without mutating process.env. Preserve Google/Meta/TikTok account routing and field capabilities. Shared settings require M04 review and retain the current combined response.
4. Add a private dashboard router behind a default-off independent gate. Test every19 method against the old adapter contract, including logged-out/inactive/wrong-role/creator denial, stale hash/lock/state, changed session during dispatch, source adoption, current baseline, receipt uncertainty, locked actions and no replay. Test the actual cookie/front-door/current-auth/Worker/Supabase chain in workerd using synthetic services; no live provider action.
5. Freeze both artifacts/configuration and approved access names, then obtain a separately controlled runtime/cookie-routing release approval. User browser/UAT verifies the existing workspace flows and private MCP read independently. Vercel wrappers/history remain rollback assets until acceptance; do not delete them or mark all M03 moved before proof.

Phase-two code is not claimed implemented or accepted. Phase-one review fixes continue as local code/test work on the isolated existing migration branches. This inventory is the explicit scope gap and a decision-complete follow-on contract; it does not silently migrate the dashboard or weaken its auth. Parent must choose phase-one release scope versus continuing the approved front-door phase before any setup/cutover request.
