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
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional fallback)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v22`)
- `ACCOUNT_DIRECTORY` D1 binding for Google Ads access paths
- `PLACEMENT_IMPORTS` private R2 binding
- `PLACEMENT_QUEUE` Queue binding

The Next.js application requires `PLACEMENT_ANALYSIS_WORKER_URL`, the matching `WORKER_API_SECRET`, and server-only Supabase credentials for exclusion history.

Run `npm run cf:placements:types`, Worker TypeScript validation, Next.js typecheck, and focused lint after changes.
