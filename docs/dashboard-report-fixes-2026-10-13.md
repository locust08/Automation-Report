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
