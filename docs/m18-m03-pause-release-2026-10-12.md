# M18 dependency: scoped M03 campaign pause

## Release boundary

This candidate starts from the exact current Vercel production source `ed9d36ae329e222c5f2493d0277238150b7b91d1`, independently observed in Ava's signed-in browser on October 12. Production deployment is `BXokTp2AUb3XEFJxdGAxNirUSnQj`, project `locus-t/automated-report`, alias `automated-report-iota.vercel.app`. DigitalBee and M04 run on Cloudflare; this M03 dashboard remains on Vercel. No hosting migration or new MCP publishing surface is introduced. Other unfinished module branches are excluded.

Only `campaign.status -> PAUSED` for an exact administrator/platform/account/campaign tuple can execute. `M03_PAUSE_ENABLED=approved-test-pilot` and `M03_PAUSE_ALLOWLIST` are server-only configuration; defaults are false and `[]`. Each allowlist record contains `actor_id` (the existing CRM08 staff UUID), `platform` (`google` or `meta`), `account_identity` and `campaign_identity`. General publishing, retry, rollback, activation and TikTok remain locked.

The existing dashboard Publish and Verify routes retain session/domain/operator checks. The pause button additionally confirms the exact revision, account and campaign. A fresh latest-revision integrity receipt, current approved items, official account ownership/status, durable operation claim and repeated current authorization precede dispatch. Google uses existing OAuth/Notion access routing and the official REST client without enabling the broad legacy write switch. Meta uses its official endpoint with a bounded response and a single POST. Success is reported only after exact official paused readback and atomic M03 finalization.

Interrupted requests never authorize a new mutation. Verify performs official reads against the existing operation and can reconcile the desired paused state while retaining the original ambiguous outcome. It cannot reconstruct a lost POST response. Successful operation IDs, immutable revision/approval and audit history remain retained.

Optional M18 workflow, revision and receipt UUID fields are saved with the draft item and retained in audited source-adoption evidence. All three are required together. They are context links; the official account/campaign baseline is the source authority. They do not convert the D1 workflow into a Supabase M04 plan or inherit approval.

## Required migrations and deployment order

The approved Supabase project is `gsmxeosdjsbujhiwhbzk`. Read-only inspection confirmed existing M03 tables, compatible status constraints, admin/domain operator resolution, and absence of the new revision-integrity/claim functions. Apply only these missing M03 migrations, after a fresh schema/history check and explicit approval:

1. `20261002075616_m03_revision_integrity_receipts.sql`.
2. `20261002080045_m03_durable_operation_claims.sql`.
3. `20261002082327_m03_approved_request_scope.sql`.
4. `20261012015025_m18_m03_scoped_pause.sql`.

Do not run a whole-repository database push. New functions are security invoker, with execution revoked from public/browser roles and granted only to service_role. The execution table retains RLS and server-only privileges. Pause finalization locks the request, proves its latest approved scope/item and official receipt, then records Verified once. No unrelated schema or historical records are migrated.

Deploy a disabled Vercel Preview from this scoped branch, verify guarded routes and browser controls, then promote only with explicit production approval. Use the existing production environment; the Doppler dev build is local verification, not a production-secret replacement. Enable only separately approved historical/new pilot tuples. Establish this path before scheduling either M18 pilot. The dormant DigitalBee M03 review connector need not be enabled to use the formal dashboard workflow.

## Verification and rollback

Final local results: 89 M03/UI behavior tests passed; type checks and scoped lint passed; production-style Turbopack build passed with the linked-dependency override; anonymous `/change-control` boot returned 200 and protected list/publish APIs returned 401. Disposable PostgreSQL claim/reconciliation/finalization and privilege assertions passed and rolled back their fixtures. No connected operator, live mutation or deployment is inferred from these checks.

Local evidence includes behavior tests for narrow allowlists, role/source/ownership/revision denial, baseline drift, exact readback, lost responses, duplicate calls, immutable compiled values and protected UI controls; disposable PostgreSQL semantic tests for claims, stale/wrong readback, foreign actors, changed items, original ambiguous-outcome retention, idempotent finalization and browser-role denial. The SQL fixture stubs operator resolution; it does not certify actual production identity or the whole historical database chain. Read-only live schema inspection is recorded separately.

Type checking, scoped lint, the production-style build and anonymous route boot/401 checks are required before publication. `NEXT_TURBOPACK_ROOT` is an optional local linked-dependency override; it leaves ordinary production root discovery unchanged. The TikTok state-cookie constant is moved out of a Next route export solely to satisfy generated route types; its name and behavior are unchanged.

Rollback disables the narrow pause flag and clears its allowlist, then restores the recorded prior Vercel deployment. Retain additive tables, original outcomes and audit receipts. A scheduled pilot must be officially reconciled and paused before closing the run; release rollback alone does not pause advertising objects. No deployment, remote migration or provider mutation is claimed by this candidate.
