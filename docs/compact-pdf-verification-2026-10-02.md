# Compact standalone PDF verification — 2026-10-02

Base: `b349fc4` on `codex/demand-gen-ad-filters`. Implementation branch: `codex/compact-report-pdfs`, in the chat's attached managed worktree. The original checkout's uncommitted changes were not copied into this worktree.

## Implemented behavior

Demand Gen and Campaign Breakdown compose campaign-grouped ad tables. Each row includes Name, Creative and metrics. Selected images/video posters use uncropped 112 × 84 px boxes with the existing selection and independent asset-spend captions. Rows share available page space and move intact to continuation pages with repeated context/headers. Wide Breakdown metrics repeat Name and Creative across groups of up to five metrics. A4 portrait branding, analysis, summaries, totals and filters retain the existing path; APIs, provider collection, screen and PNG rendering are unchanged.

## Local fixture evidence

The compact browser regression failed against the base implementation because ads were not rendered as performance-table rows, then passed after implementation.

Command: `REPORT_QA_BASE_URL=http://localhost:3018 REPORT_QA_COMPACT_PDF=1 REPORT_QA_BREAKDOWN_SCOPE=1 node scripts/report-page-improvements-browser-test.mjs`.

- Demand Gen: 12 ads across two campaigns, long name, missing image and independently ranked asset-spend captions; seven complete A4 pages including analysis.
- Breakdown: 26 ads across two ad sets, including same-named ads in different sets, long name and missing image; 52 metric-group rows across 21 complete A4 pages including summaries.
- Both actual downloads and admin Preview PDF succeeded. Preview downloads and close/temporary-document cleanup passed.
- All printable bodies fit, headings remain above tables, numeric cells do not clip, selected thumbnails retain contain sizing, and repeated headers/context remain present. All ads and the last metric group are represented; Breakdown totals and scope exclusions remain intact.
- Inspected raster preview pages for both reports, including coloured wide creative fixtures that retain both image edges.
- `npm run typecheck`: passed.
- Scoped ESLint on the composer, focused test file and browser script: passed.
- Focused composer/pagination tests: nine passed.
- Full `npm run lint`: failed with 28 existing errors in unchanged `cloudflare/campaign-creation-api` files and 27 existing warnings. The affected service has no diff against the base commit.

Ignored artifacts: `tmp/demand-compact.pdf`, `tmp/demand-compact-preview.pdf`, `tmp/breakdown-compact.pdf`, `tmp/compact-demand-ad-page.png`, `tmp/compact-breakdown-ad-page.png`.

## Separate acceptance

These are synthetic local fixtures, not native platform reconciliation or connected-account acceptance. No production deployment, provider writes or email sends are included. No Cloudflare service changes require deployment.
