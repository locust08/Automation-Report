# Placement analysis Worker

This Worker retrieves Google Ads placement reports in the background, stores the temporary sorted result in R2 for seven days, and imports permanent Supabase rows in batches of 250.

## Flow

1. Next.js creates a Supabase job and sends a protected `retrieve` command.
2. The Queue consumer retrieves standard and Performance Max placements, sorts them by impressions, and writes the temporary result to R2.
3. The first 250 rows are saved to Supabase and the job pauses as `partial`.
4. The dashboard can enqueue `next` or `all` commands. Cancellation stops future batches while retaining imported rows.

## Required secrets

- `WORKER_API_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional fallback)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v22`)

The Next.js application requires `PLACEMENT_ANALYSIS_WORKER_URL` and the matching `WORKER_API_SECRET`.

Run `npm run cf:placements:types` and `npx tsc --noEmit -p cloudflare/placement-analysis/tsconfig.json` after binding changes.

## Rollout

1. Start local Supabase and validate `supabase/migrations/20260813024637_relational_placement_analysis.sql`, or link the intended project and review a dry run.
2. Apply the Supabase migration.
3. Create `automation-placement-imports`, `placement-analysis-queue`, and `placement-analysis-dead-letter-queue` if they do not already exist.
4. Configure the Worker secrets listed above and deploy with `npm run cf:placements:deploy`.
5. Set `PLACEMENT_ANALYSIS_WORKER_URL` in the Next.js environment and deploy the application.

Do not enable the Start analysis button in production before all five steps are complete.
