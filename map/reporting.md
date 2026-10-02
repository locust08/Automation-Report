# Reporting

Source reviewed 2026-10-02. Implementation present; acceptance partial.

## Ownership and flow

Page wrapper → reporting page client → `use-report-data.ts` → `/api/reporting/*` → `lib/reporting/service.ts` → Google/Meta adapter → normalized payload → tables/charts. Query state carries explicit provider/account IDs and inclusive dates. Google manager routing uses existing Notion resolution and `google-access-path.ts`; never infer authorization from a supplied account ID.

`types.ts` owns shared report contracts; `demand-gen.ts` owns Demand Gen normalization/contracts. HTTP report responses remain no-store. Server caches are separate from HTTP caching. Preserve existing provider access resolution before retrieving a cached result.

## Meta hierarchy

Overall Monthly Performance uses the campaign hierarchy component. Campaign Breakdown uses `components/reporting/breakdown-report.tsx` and the preview endpoint. Existing `meta-management-stage.ts`, service and Meta adapter collect campaign → ad set → ad stages with each entity's own metrics.

- Historical period reporting includes entities with activity regardless of current paused status.
- Pass the selected result-action definition to descendants; unavailable results remain unavailable.
- Preserve period-level unique Reach and provider attribution definitions. Never sum unique metrics or ratios across incompatible rows.
- Expand parents progressively; finish continuation pages. Retain successful rows on later failure and expose affected-parent retry. Changed account/dates must not receive stale-scope results.
- Monthly children use separate bordered tables aligned to campaign columns; names remain fixed while metrics scroll on narrow screens.

See [dated implementation and API smoke evidence](../docs/monthly-breakdowns-demand-gen.md). Fresh Ads Manager reconciliation and complete connected failure/retry acceptance remain separate gates.

## Google Demand Gen

`GET /api/reporting/demand-gen` resolves Google identity, selected campaign ID(s) and dates through `getDemandGenReport`. Repeated `campaignId` parameters support multiple selections; absent IDs invoke existing discovery/default behavior. `refresh` or `cacheRefresh` forces cache invalidation through the service. Advanced and standalone Demand Gen views reuse the reporting domain.

- Separate In-market/Affinity observations and In-feed/In-stream/Shorts × Desktop/Mobile/Tablet/TV matrix.
- Complete bounded pagination and aggregate repeated dimension rows before calculating ratios. Keep native zero distinct from unavailable; zero denominators produce unavailable ratios.
- Preserve unknown format/device and unresolved taxonomy coverage. Composite targeting criteria are not invented measured audience performance; overlapping observations are not mutually exclusive totals.
- Sorting, pagination, metric selection and table/chart toggles use the same normalized snapshot without presentation-triggered provider reads.
- Current cache in `demand-gen-cache.ts`: **seven days**, at most 100 entries, per-process memory, concurrent request deduplication. Key includes schema version, account, sorted selected campaigns, dates, API version and Google access routing. Partial snapshots are evicted; explicit refresh invalidates the entry. Restart loses entries. This supersedes the older 15-minute receipt.
- Advanced navigation returns explicit provider identity to Overall to avoid Meta IDs entering Google routing.

Evidence currently covers empty/unavailable matrix data and local fixtures. Classified nonzero formats and measured Affinity still need native comparison with matching dates and definitions.

## Change impact

Provider/normalization changes affect UI, totals, cache identity and exports. Contract changes require synchronized route/service/client types. Cache changes require partial/error retry and refresh verification. Preserve nullable values and provider-native semantics in all displays.
