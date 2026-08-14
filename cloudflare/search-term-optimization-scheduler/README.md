# Search-term optimization Worker

This Worker claims scheduled analyses from Vercel, dispatches the durable analysis workflow through GitHub Actions, and stores temporary 250-term R2 batch inputs.

## Required Cloudflare secrets

- `VERCEL_APP_BASE_URL` — production HTTPS origin of the Vercel application
- `REPORT_AUTOMATION_SECRET` — shared by the Worker, Vercel, and GitHub Actions callbacks
- `GITHUB_ACTIONS_TOKEN` — token allowed to dispatch the repository workflow

Configure them with `wrangler secret put`; do not add their values to `wrangler.jsonc`.

## Required Vercel variables

- `SEARCH_TERM_ANALYSIS_WORKER_URL`
- `WORKER_API_SECRET` (must match the Worker authorization secret used by the application endpoints)
- Supabase and Google Ads credentials already required by Search Terms analysis

## Required GitHub Actions secrets

The workflow in `.github/workflows/search-term-optimization.yml` lists the Google Ads, Supabase, OpenAI, Worker URL, Worker secret, and callback secret values it consumes.

Before release, run TypeScript validation and `wrangler deploy --dry-run`, then verify the deployed Worker secret list contains all three Cloudflare secrets.
