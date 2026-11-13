# Live placement cache Worker

This Worker retrieves Google Ads placements on demand and writes only the requested results to private R2 in 250-row chunks for one hour. Placement rows are never copied into Supabase. The first 250 rows load automatically; later batches load only when requested. Supabase stores only successfully published exclusion history.

## Flow

1. Selecting an account calls `POST /placement-cache/start`.
2. A single Queue consumer retrieves the top 250 standard and Performance Max placement candidates, merges them, and caches the top 250 placements.
3. `POST /placement-cache/load-more` raises the requested limit by 250, refreshes that bounded result, and adds one cache chunk. Nothing continues automatically.
4. `GET /placement-cache/rows` serves available pages of at most 250 rows without reading unrelated chunks for an unfiltered page.
5. A valid cache is reused for one hour. Refresh replaces it; stopping a request preserves already completed chunks.

## Required secrets and bindings

- `WORKER_API_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional fallback)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v25`)
- `ACCOUNT_DIRECTORY` D1 binding for Google Ads access paths
- `PLACEMENT_IMPORTS` private R2 binding
- `PLACEMENT_QUEUE` Queue binding

The Next.js application requires `PLACEMENT_ANALYSIS_WORKER_URL`, the matching `WORKER_API_SECRET`, and server-only Supabase credentials for exclusion history.

Run `npm run cf:placements:types`, Worker TypeScript validation, Next.js typecheck, and focused lint after changes.

## Production recovery — 2026-11-13

The deployed August Worker still used its legacy v22 transport and returned `Google Ads placement retrieval failed (400)` for Magnet (`5849785984`, October 2026). The repository already contained the OAuth-only v25 transport from `a6212a0`; both placement queries succeeded through that transport during diagnosis.

After explicit deployment approval, the Wrangler-built current placement bundle was uploaded through Cloudflare's script-content endpoint, preserving the existing bindings, secrets, compatibility settings and queue configuration. Production version `8d0cf362-3cea-4bf3-87c6-b921ab8cc687` deployed at 2026-11-13 06:49 UTC (14:49 Malaysia time). Previous version `a64f95a3-df7f-4d2d-8fcc-305c2a593cce` is the rollback reference, but restores the broken legacy transport.

Verification: 12 focused transport/routing tests, Worker TypeScript, scoped ESLint and Wrangler dry run passed. Production refresh for 2026-10-01 through 2026-10-31 completed with 250 cached placements (133 Demand Gen, 117 Display), no error, and `hasMore=true`; the rows endpoint returned HTTP 200. The first batch remains bounded to 250 and additional batches require Load more. Browser/native Google Ads reconciliation was not repeated. Repository-wide typecheck remains blocked by unrelated generated files under `artifacts`, `outputs` and `tmp`; broad lint was stopped after it traversed generated files in a nested worktree.
