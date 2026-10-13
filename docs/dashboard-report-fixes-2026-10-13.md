# Dashboard report fixes — 2026-10-13

## Delivered behavior

Advanced Report resolves the account title from source data, removes the secondary badge and uses the shared editable date picker on Google, Meta and TikTok. URL dates preserve account, country and campaign scope. Obsolete responses cannot populate a new selection.

Generation advances sequential bounded requests with durable Cloudflare R2/D1 revisions, cursor validation, leases and conditional publication. Completed metrics remain visible while individual analyses load or retry. One transient retry uses a separate chunk; terminal analysis failures retain labelled metric fallbacks. Creative reasons retain three complete normalized sentences, including currency/decimal text. Cache versions invalidate previously shortened results.

Video previews play from safe provider URLs and expose clickable destinations. Browser export retains link annotations and expands scrolling tables. Monthly campaign filters apply stable campaign identities to both comparison periods and audience collection. Grand Total changes use weighted rates and suppress unavailable or overlapping unique comparisons.

## Local verification

- 18 focused tests passed, including slow response bodies, timeouts/retries, generation/cursor validation, stale saves, atomic canonical publication, cache reuse, filter clearing, renamed campaigns and fallback ranking.
- Playwright fixture checks passed for progressive readiness, headers, dates, filters, stale responses, mobile bounds, video playback controls, complete text and PDF URI annotations.
- Exported three-page fixture PDF rendered with Poppler and inspected for wrapping and every final-URL metric column.
- Actual SQLite executes the existing cache schema and conditional revision/publication SQL. No schema migration is needed.
- Typecheck, production build, scoped ESLint and both Worker dry runs passed. Full ESLint has 28 pre-existing errors in seven untouched campaign-creation Worker files; exact base-source diagnostic comparison confirmed all 28.
- Artifacts remain ignored under artifacts/dashboard-fixes and out/dashboard-fixes. Fixture checks do not establish native ad-platform reconciliation or customer PDF delivery.

## Release boundaries

Feature base: b349fc4535e57fa40d1a97b691a0aa5b39306b97. The isolated feature branch excludes unrelated shared checkout changes.

The combined release must preserve live production fef5322851b17888cbf5593989b628be56eb15e5 plus approved M03 43525a0363cdd4c8b74dbc744325b62a7dc1685e and 83fc7b1f2d3a5f2cd331dedb97aa418412516557. Coordinator reports compatible frontend 738ec9ccf2eac7602d59f8f335e430da62eb27b9 live at Worker c7246350-ae53-42e2-b6a8-7385fb549f28 with independently matched artifact SHA256 29e28c4ccbb4e7108025e690768756f01f3bef791ff213d26104b298c532d519. This clears the parser-first gate; dashboard backend evidence remains separate.

Deploy cache Worker before the paired application and monthly driver. Reuse existing secrets, bindings and tables. Next route maxDuration is 120 seconds; AI default is 60 seconds, configured values are capped at 90 seconds to reserve persistence time. Verify actual deployment duration support and production cache configuration before rollout. Never run customer-email, campaign-write or migration paths during verification.

Rollback the application to its recorded previous production deployment before reverting the cache protocol or monthly driver. Keep the compatible MCP parser if the backend diagnostics remain live; roll back backend before restoring an older strict parser. Deployment and native acceptance receipts are recorded separately after execution.

## Combined candidate checkpoint

Feature remote c7d713493ee49d644c4419e6fde591f0a2c72678 is preserved. Combined remote 3af196aa41e567b15a4817f236b1a20095f00be4 extends 83fc7b1 and all production fef5322 ancestors; no cherry-pick conflicts. Draft PR: https://github.com/locust08/Automation-Report/pull/8, base codex/m18-m03-release. 45 combined regressions (18 dashboard, 25 M03 service/provider/scoped, 2 environment guards), typecheck/build/scoped lint and combined browser/PDF fixtures passed. Both Worker dry runs passed. Vercel project uses Fluid Compute on Node24; the 120-second route budget is supported. Production secrets are sensitive/redacted on pull; configuration names are present but values are not copied into source. Doppler credential is invalid; no secrets or runtime settings were changed. Deployment manifests exclude private artifacts/maps/env files, verified from actual regular-file entries.

Cache Worker submitted before the coordinator's precautionary hold and deployed version 9d63e917-5d5a-4b67-9dac-a59bc3fc40a4 at https://ads-dashboard-advanced-report-cache.easondev.workers.dev. Independent version readback preserves all original bindings, secret descriptors and runtime settings. Existing D1/R2 resources are reused. Unauthorized generation access returns 403.

Vercel production build/upload was submitted with --skip-domain, source 3af196a, before the hold. At this checkpoint no resulting deployment ID is available: upload remains in progress. Production alias independently remains READY at dpl_43K9R29uFC43AxudjDSTHu5nBWpQ / automated-report-f5ufmlor3-locus-t.vercel.app, source fef5322. No promotion, monthly Worker deployment, job submission, email, migration or campaign action was performed after the hold. Homepage returns 200; anonymous monitoring API remains 401.

The coordinator's later precautionary hold applies to new production-changing steps pending their human clarification. Continue read-only reconciliation of the already submitted deployment; do not blindly abort, rollback or retry it. Monthly Worker baseline remains f6784fc8-2ca8-4fa9-9639-594118e1901a. Existing production schedules were read back and match the checked-in configuration exactly.

Coordinator subsequently relayed the human's explicit clarification: do not pause the dashboard/M03 release. The precautionary hold is lifted; continue the existing upload and verified promotion/monthly rollout without resubmitting the upload. Cache artifact downloaded independently from Cloudflare matches the prepared dry-run JavaScript exactly: SHA256 33c5a5a86e2afc8bb063336ec510cee654892885220218c7ae0cc53f1bb119d2.

The first Vercel candidate resolved definitively to BLOCKED, deployment dpl_9v6dMrAkWJPXxvEXgE31LHNuZfmX, URL automated-report-hgr1om7ig-locus-t.vercel.app. The platform skipped its build because the Git author lacks project deployment permission. Its metadata preserves source3af196a; no production promotion occurred. HTML HTTP200 from that blocked URL is not a passing application health check. The existing authenticated project owner's supported redeploy operation is being evaluated without changing author attribution, memberships, permissions or source.

## Final delivery gate

The authenticated owner's supported redeploy of the definitively blocked candidate also failed: HTTP400, “This deployment can not be redeployed. Please try again from a fresh commit.” No new deployment was created by that operation. Another same-author upload would not resolve the identified permission check; none is attempted. Do not falsify commit attribution, remove repository provenance or expand team grants to bypass this gate.

Application rollout and paired monthly Worker rollout remain blocked by Vercel Git-author authorization. An authorized project owner must resolve the commit-account/deployment permission association or deploy this reviewed combined branch through their permitted workflow. Then verify the exact source and successful build, promote it, deploy the checked monthly Worker with all existing vars/bindings/schedules unchanged, and perform native report/PDF acceptance. Cache Worker is backward-compatible with the old application and can remain live while this is resolved; its rollback baseline is85351b9a-c235-45df-9299-ff99f3b5eef7.

Additional automation verification: an ignored harness bundles the actual unchanged monthly Worker chunk driver and checks missing/generating/ready sequencing plus source-error isolation. Two fixture scenarios passed, with explicit zero queue jobs and emails. No production PDF job or native provider acceptance was run. Existing production fef5322 continues to serve; retain compatible MCP frontend parser. Tests/build are local combined-source evidence; no successful new Vercel build is claimed.

## Authorized locust08 release checkpoint — 2026-10-13

The user explicitly requested a new release checkpoint under locust08, Git push, and Vercel production deployment after checks. Effective repo-local author/committer is locust08 <locust.crm08@gmail.com>. Existing Austin-authored history is preserved; no amend, rebase, authorship rewrite or force push is used. The new checkpoint extends575f988, retaining the verified combined dashboard source and full fef5322/83fc7b1 chain. M03 Cloudflare migration review continues with its separate owner; dashboard hosting stays Vercel.

Read-only follow-up established that Git-connected exact-source3af196a preview dpl_72TJioQSJkrTu4Sh1ks6U57rx2pz is READY with GitHub author AustinTan2005 and no seatBlock; the earlier CLI upload alone was blocked. Existing release authors are identical, so attribution was not changed by the fixes. Public account readback does not expose owner Login Connections. This fresh legitimate author checkpoint follows the user's selected work identity without altering permissions or existing credential settings.

Cache compatibility is additionally checked through four read-only legacy Worker fixtures with zero writes, a safe old-app cache-miss probe, unchanged legacy handlers and independent artifact/configuration readback. Browser-User-Agent unauthenticated Worker probes return the expected401 JSON; the earlier Python-default-User-Agent403 was not a changed Worker authentication contract. Authenticated live cached-account retrieval and native customer PDF acceptance remain separate.

Fresh combined tests/typecheck/build/scoped lint and production-source preservation checks precede rollout. Deploy using the Git-connected checkpoint's exact source and production environment; do not treat a direct preview promotion as a production-environment rebuild. Preserve existing runtime guards/settings. Final actual deployment receipts will follow verification.


## Live transport repair

Checkpoint21bc7f0 rebuilt through the connected Git deployment into production dpl_HuhhYBdWY9XcXHuWv7PPJtw5hQU6, with locust08 attribution, production environment and no access block. Live alias/source, empty-selection header/date picker, homepage200, anonymous monitoring401 and durable generation-miss read200 passed. Monthly Workerfce147f0-9299-4050-a44d-4dfa5491aeda was deployed with existing schedules and vars retained.

A real persisted-generation resume probe then exposed a missing ETag on the hosted cache response. Initialization persisted state, but a subsequent read failed revision validation. The transport repair uses a dedicated explicit revision header, standards-compliant quoted ETags/If-Match, and compatibility parsing for existing raw validators. Revision compare-and-swap and stale-write protection remain mandatory. A new regression strips ETag across the actual Worker/client fixture and verifies successful resume/update, stale-write rejection and quoted-ETag fallback. No cache schema or existing report contract changes are needed; previously persisted work can resume.


## Final production receipt — 2026-10-13

New locust08 checkpoint21bc7f09951db3741bd16b08de7f5d3dc912715c and transport repair16ff62da88cd12db4ff7e889e293eb5cce4d898b were committed and pushed through Git without rewriting history or force push. The final production build uses source16ff62d, deployment dpl_MJcywA6NJ8iKikiK3GMDpbgQwTt8, https://automated-report-lmzzvikxf-locus-t.vercel.app. Vercel independently reports READY/PROMOTED, production environment, no seatBlock, with https://automated-report-iota.vercel.app assigned to that exact deployment. GitHub author attribution is locust08. Full fef5322 and approved83fc7b1 ancestors are retained. Dashboard hosting/access settings remain unchanged; separate M03 Cloudflare migration work was not performed here.

Final local validation:46 combined tests, typecheck, production build, focused lint, previous full scoped lint, production-build browser/PDF fixtures and cache-Worker dry run pass. The generated dev type-cache failure was preserved as ignored diagnostic text and cleared from the compiler scan; no source typecheck exemption was introduced. Full lint still has28 independently confirmed baseline errors in untouched campaign-creation files.

Live verification: final datepicker/empty-selection header passes in a real browser; homepage200 and anonymous monitoring401 were checked. Actual existing September generation for account7585367819 now advances its source summary chunk in13.66 seconds, persists the next cursor, and reloads with the same generation ID. The recorded step enum is success, not the local probe's mistaken done assertion. No regeneration or restart of successful work was required. Source payload carries one provider warning; native metric reconciliation and all-step customer PDF/email acceptance remain separate. No advertising mutations, customer emails or monthly test jobs were submitted.

Reporting cache Worker:108adeb5-0de4-437e-82fa-dd64f659a802; independent downloaded artifact exactly matches prepared SHA256298d495c3d8ef527b048f78a46cc8feb9d842b71258cbe5adb5279a752e7d8c3. Monthly reporting Worker:fce147f0-9299-4050-a44d-4dfa5491aeda; exact artifact SHA2567688dc1e07f9b61bf3cd7182dd224b6b2a104d50e2b4942a0f86ff0dbf65a052. Both preserve baseline bindings, secret descriptors and runtime configuration. Monthly schedules remain0 4 7,10,15 * * and5,15,25,35,45,55 * * * *. No D1 migration ran.

Rollback receipts: original app dpl_43K9R29uFC43AxudjDSTHu5nBWpQ/sourcefef5322; intermediate app dpl_HuhhYBdWY9XcXHuWv7PPJtw5hQU6/source21bc7f0; original cache85351b9a-c235-45df-9299-ff99f3b5eef7; original monthlyf6784fc8-2ca8-4fa9-9639-594118e1901a. Retain the fixed revision transport while current chunk clients are active. Roll back dependent app/driver before reverting cache support; retain compatible MCP frontend parsing until backend diagnostics are rolled back. No rollback was executed.

Draft PR remains https://github.com/locust08/Automation-Report/pull/8. This documentation receipt follows the deployed source without changing executable code; no main-branch merge or access expansion is included.
