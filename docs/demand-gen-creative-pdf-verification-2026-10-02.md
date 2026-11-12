# Demand Gen creative and PDF verification � 2026-10-02

Implementation commit: `cfaaeb9` on `codex/demand-gen-ad-filters`. Notion module work remains paused in its separate worktree. Unrelated working edits are excluded. No deployment or advertising writes were performed.

## Current behaviour

Demand Gen uses impressions throughout, including old views links, and sortable account-currency ad spend. One creative per ad ranks by conversions, clicks, impressions and stable asset ID only when all candidate evidence is complete and delivered. Missing, partial or zero-delivery evidence uses the representative label. Asset spend remains independent; zero is retained and unavailable is a dash. Exact account/ad/date scope isolates shared assets; logos are excluded. Cache schema is 4 and incomplete creative snapshots are retried.

Demand Gen and Breakdown PDFs restore dashboard branding and cards while retaining A4 portrait composition, analysis before ads, fresh ad pages, campaign grouping and wide-table splitting. One uncropped preview, selection label and asset spend replace galleries. Preview/download share one document. Loaded pixels, broken-image placeholders, compact logo fallback and failure cleanup remain supported.

## Local verification

- 30 focused tests passed: Demand Gen metrics/cache/creative ranking, sorting, currency, Breakdown preview mapping and PDF pagination/composition.
- Scoped source TypeScript and scoped ESLint passed. `npm run typecheck` still reports three existing errors in generated files: `artifacts/m07/domain-smoke.ts` (removed placement import) and `outputs/dscaff-google-ads-apr-aug-2026/fetch-performance-data.mts` (import extension/default property). The temporary source-only config is ignored under artifacts.
- `doppler run -- npx next build` passed after final fixes. Next build skips types by existing configuration; source TypeScript was checked separately.
- Browser fixtures passed desktop/mobile creative parity, legacy metric links, spend, sorting, zero/unavailable values, long headings, broken thumbnails/footer logo, all-row wide-table exports, filter/date retention and preview failure/retry/cleanup. Full reporting browser regression passed, including unchanged Meta/TikTok views and Overall exports.
- Rendered portrait analysis/ad page PNGs were visually inspected. Fixtures verify rendering and export, not native provider UI or live creative pixel reconciliation.
- Fresh-context review findings were fixed: exclude reused logo observations; retry incomplete creative coverage; bound failed footer images; include CLASSIC_DISPLAY_IMAGE performance.

## Connected read-only evidence

`doppler run -- npx tsx scripts/demand-creative-preflight.ts` reconciled Google Ads v25 for Magnet Security & Automation Sdn Bhd, account `5849785984`, 2026-09-01 through 2026-09-30, MYR / Asia-Kuala_Lumpur. Ignored credential-free receipt: `artifacts/demand-creative-verification/magnet-september.json`. Core and creative coverage were complete: 21 ads, 13 ranked and 8 representative.

The screenshot ad �No Shake No Clone� returned zero impressions, clicks, views, conversions and ad spend. Selected image asset `152178600074` is representative; supplied asset spend is zero. Zero delivery is not described as top-performing.

�Video - BG856� (ad `769734850316`) returned 112,644 impressions versus 24,444 video views, 8,470 clicks and MYR 838.559681 ad spend. Selected video asset `276575206077` returned 55,620 impressions, 4,145 clicks, 289.263177 conversions and MYR 374.028633 asset spend. Independent candidate comparison confirmed ranking. Attribution values can change between provider reads.

## Remaining gates

Native Google Ads UI comparison is not claimed. The earlier device-cell/seven-impression reconciliation gap remains independent. Production deployment and long-report production performance acceptance are separate. Generated artifacts remain untracked.
