# Monthly breakdowns and Google Demand Gen — 2026-10-01

Implemented on `codex/monthly-breakdowns-demand-gen`.

- Monthly Performance expands Meta campaigns into historical ad sets and ads with their own period metrics. The campaign result-action definition is passed to descendants; unavailable results display as unavailable. Period-level retrieval preserves unique Reach semantics. Partial continuation failures retain rows and expose retry; retries retain same-scope data.
- Overall uses a 1,920px maximum interactive width. Screenshot mode retains the established 1,440px width.
- Google Advanced Report independently loads Demand Gen campaign selection, In-market, Affinity, and format/device analysis. Tables support sorting/pagination; chart toggles and a shared metric selector reuse the same snapshot. Native zeros, nullable ratios, unknown dimensions, and overlapping interest observations are preserved.
- Advanced navigation now carries explicit provider identity back to Overall, preventing Meta `96906550` from being sent through Google Notion routing.

Reference: `C:/Users/User/.codex/worktrees/meta-render-fix/MCPS/digitalbee-mcp/src/structured-reporting` and its dated verification receipts. Provider fields were checked against [Google v25 audience reporting](https://developers.google.com/google-ads/api/fields/v25/ad_group_audience_view) and [Demand Gen reporting](https://developers.google.com/google-ads/api/docs/demand-gen/reporting).

## Verification

- Focused provider/aggregation/navigation tests pass, including period-level Meta metrics, explicit child result events, historical statuses, retained continuation data, nullable zeros, matrix coverage, taxonomy classification, campaign ownership, and pagination.
- `scripts/report-structure-browser-test.mjs` uses synthetic API fixtures against the actual dev app. Checks Google-only visibility, independent loading despite an Advanced analysis failure, sorting/pagination, metric/chart changes without refetch, mobile layout, Meta → Advanced → Monthly navigation, historical expansion, retention on failed retry, wide layout, and capture width/PDF rendering.
- Read-only Doppler smoke: Google account `2315114913` resolves its existing manager access and returns 12 Demand Gen campaigns. The first campaign returns a valid 12-cell unavailable matrix and excludes nine composite criteria rather than inventing measured interests. Classified nonzero format/Affinity reconciliation remains unverified.
- Read-only Doppler smoke: Meta `96906550`, September 2026, returns 13 reportable campaigns. The first expanded campaign returns one ad set and one ad with their own performance and 746 event results, matching the supplied screenshot's result count. No warnings. This is an API smoke, not a fresh Ads Manager reconciliation.
- All 13 focused tests, scoped TypeScript compilation, scoped ESLint, and browser/PDF QA pass. Repository-wide typecheck and lint remain blocked by unrelated existing/generated/untracked code; no diagnostics reference the changed reporting implementation. A clean HEAD archive also fails typecheck in existing Cloudflare campaign-creation types.

No deployment, provider writes, email sends, database migrations, or changes to unrelated working-tree files.

Meta child layout refinement: ad sets and ads render in separate bordered tables following the campaign columns. Names stay fixed while metrics scroll horizontally on narrow screens; expanded content uses the campaign box width. Desktop, mobile, and capture fixture checks pass.
