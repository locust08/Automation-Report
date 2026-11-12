# Automated Report Website

Reporting and advertising workflow application for Meta Ads, Google Ads and TikTok, built with Next.js 16, React 19 and TypeScript.

## Documentation

Start with the [documentation index](docs/README.md) for setup, architecture, operations and dated verification records. The [implementation map](map/README.md) describes current source behavior and remaining acceptance gates; the [2026-11-12 documentation audit](docs/documentation-audit-2026-11-12.md) records the source review and GitHub coverage.

- [Application routes and service ownership](map/application.md)
- [Authentication setup and access boundaries](docs/auth-setup.md)
- [Reporting behavior](map/reporting.md) and [typography, date picker and exports](map/presentation.md)
- [Monthly report Worker setup and schedules](cloudflare/monthly-report-cron/README.md)
- [Search-term automatic approval](docs/search-term-auto-approval.md)
- [Contributor instructions](AGENTS.md)

Plans and dated verification receipts describe their recorded scope. They do not establish the current production deployment status. Reporting/presentation records imported from `datepicker-improvement` are labeled as branch snapshots; that branch's application changes are not included in this documentation merge.

## Pages

- `/` Email/password or Google sign-in.
- `/dashboard` Account selection and role-aware report/workflow launcher.
- `/overall` Overall performance page:
  - Meta metrics
  - Google Ads metrics
  - Google Ads YouTube overview metrics
  - TikTok reporting when an advertiser ID is selected
  - Collapsible campaign-type grouped table
- `/preview` Platform preview page:
  - Same shell/theme as Overall
  - Live campaign hierarchy from Google Ads, Meta Ads and TikTok reporting
  - Expand campaign names to inspect Campaign -> Ad Group / Ad Set -> Ad -> Details
  - Google/Meta hierarchy views can link to `/preview/edit` to prepare an edit draft; preview retrieval itself does not publish provider changes
- `/campaign/[campaignType]` Campaign type page:
  - Selected month vs previous month comparison
  - Collapsible sections and totals
- `/auction` Auction page (Google Ads Manager extraction):
  - Auction insights domain metrics
  - Average benchmark row
- `/dashboard/media-plan` Media Plan setup page:
  - User enters Website URL, Ad Budget, and Google CID
  - OpenAI generates a structured Google Search media plan with `OPENAI_MEDIA_PLAN_MODEL` and `OPENAI_MEDIA_PLAN_PROMPT_ID`
  - Generated JSON renders as editable campaign, ad group, keyword, RSA, sitelink, and planning-note sections
  - Final approval stores one detailed Notion row per ad group, then creates the Google Ads campaign as `PAUSED`
  - Success state shows the Notion batch details, campaign ID, and Google Ads review link
- `/advanced` Advanced analysis with AI-assisted sections.
- `/demand-gen` Google Demand Gen audience, format/device and creative analysis.
- `/settings` Admin-only workflow settings on `master`.
- `/manage`, `/campaigns`, `/change-control`, `/search-term-optimization`, `/placement-optimization`, `/optimization-scheduling`, `/search-term-pm-reports`, `/team-lead-monitoring`, `/billing`, `/user-management` provide role-restricted workflow areas. See the [application map](map/application.md).

There is no `/keywords` or `/insights` page in this checkout. Their JSON endpoints remain at `/api/reporting/keywords` and `/api/reporting/insights`.

The standalone `/campaign-breakdown` page, personal comparison-display preferences, seven-day Demand Gen cache and responsive date-picker follow-up described in the branch receipts are not implemented on this `master` baseline. Demand Gen currently uses a 15-minute process cache. See the [branch scope notes](map/application.md) before applying a dated reporting receipt to `master`.

## URL Parameters

These can be passed directly in the URL and auto-fill the filter form:

- `accountId` Generic account ID applied as fallback for both Meta and Google
- `metaAccountId` Explicit Meta account ID (overrides fallback)
- `googleAccountId` Explicit Google Ads customer ID (overrides fallback)
- `tiktokAccountId` Explicit TikTok advertiser ID
- `startDate` Format: `YYYY-MM-DD`
- `endDate` Format: `YYYY-MM-DD`
- `platform` `meta | google | googleYoutube | tiktok`
- `campaignScope` `all | lt` (`lt` name scope is limited to the configured single Meta account; see `lib/reporting/campaign-name-filter.ts`)
- `source` `api | meta_csv` (API data by default; imported Meta CSV when selected)
- `screenshot` `1` prepares report capture mode

Example:

`/overall?accountId=697-252-8848&startDate=2026-02-01&endDate=2026-02-28`

## Doppler / Environment

Credentials are expected from environment variables (Doppler injects these at runtime):

- `META_ACCESS_TOKEN`
- `GOOGLE_ADS_REFRESH_TOKEN` (required)
- `GOOGLE_ADS_CLIENT_ID` (required)
- `GOOGLE_ADS_CLIENT_SECRET` (required)
- `NOTION_TOKEN` (used to read `DB | Ad Accounts`)
- `NOTION_DATABASE_ID` (used to read `DB | Ad Accounts`; raw Notion database ID, not the full browser URL)
- `NOTION_AD_ACCOUNTS_DATABASE_ID` (preferred override for monthly cron account selection)
- `NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID` (optional Notion database for monthly cron send logs)
- `CRON_SECRET` (required by `/api/cron/monthly-report`)
- `RESEND_API_KEY` (required for monthly report email delivery)
- `RESEND_FROM_MONTHLY_REPORT` (optional; defaults to `Locus-T <no-reply@locus-t.com.my>`)
- `MONTHLY_REPORT_TEST_MODE` (optional; enables test-mode target/recipient handling)
- `MONTHLY_REPORT_TEST_RECIPIENT` (test recipient; the current `src/lib/cron`/email flow falls back to `amirulshahrul1775@gmail.com`, while the legacy `lib/automation` helper uses `ava@locus-t.com.my`; the pre-scheduler email script enforces its own fixed test address)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional override; defaults to fixed MCC `366-613-7525`)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v25`)
- `REPORT_COMPANY_NAME` (optional display label)
- `REPORT_COMPANY_NAME_MAP` (optional account ID to company mapping)
  - JSON format example: `{"6972528848":"Soka International School"}`
  - Comma format example: `6972528848:Soka International School,1234567890:Another Company`
  - Example for this account: `{"283341217383189":"<Registered Company Name>"}`
- `ADVANCED_REPORT_ENABLED` (optional; set `false` to disable only scheduled Advanced Report automation)
- `OPENAI_API_KEY`, `ADVANCED_REPORT_OPENAI_MODEL`, `ADVANCED_REPORT_CREATIVE_OPENAI_MODEL` (Advanced Report AI discovery/creative analysis)
- `OPENAI_MEDIA_PLAN_MODEL`, `OPENAI_MEDIA_PLAN_PROMPT_ID`, `OPENAI_MEDIA_PLAN_TIMEOUT_MS` (Media Plan generation; timeout is optional and defaults to `120000`)
- `OPENROUTER_API_KEY`, `ADVANCED_REPORT_VIDEO_OPENROUTER_MODEL` (optional Advanced Report video creative analysis)
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (Advanced Report keyword volume and People Also Ask data)

Company name resolution for the shared Google/Meta report paths:
1. `REPORT_COMPANY_NAME_MAP` (if matched)
2. Live Google account name for Google-only reports; otherwise Meta account name, falling back to Google when available
3. `Account <ID>`
4. `REPORT_COMPANY_NAME`

Supported aliases (for existing Doppler naming) are also accepted:

- `GOOGLE_OAUTH_ACCESS_TOKEN`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Google Ads manager account behavior:
1. When a Google Ads lookup value is entered, the API first checks Notion `DB | Ad Accounts` for a matching Google row (`Platform = Google`) using `GET /v1/databases/{database_id}` and `POST /v1/databases/{database_id}/query`.
2. If a row is found, the row's `ID` is treated as the Google Ads customer ID and the row's `Access Path` decides how Google Ads is queried:
   - `Personal` or `Direct`: use direct customer access with no `login-customer-id`
   - MCC ID like `411-468-5827`: use that MCC as `login-customer-id`
   - MCC ID like `366-613-7525`: use that MCC as `login-customer-id`
3. If Notion is unavailable, not configured, or no row matches, the API falls back to the incoming Google Ads customer ID plus `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
4. If `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is not set, the app falls back to fixed manager account `366-613-7525`.

The report warnings panel also confirms which manager ID was resolved from Notion for each Google account.

Missing credentials or inaccessible provider accounts produce report warnings/errors. Application login and role checks are separate; see [authentication setup](docs/auth-setup.md) for the exact route boundaries.

Run commands through Doppler so all API secrets are available:

```bash
doppler run -- npm run dev
```

Validate Notion access before running the main workflow:

```bash
doppler run -- npm run notion:smoke
```

For production build:

```bash
doppler run -- npm run build
```

## Hosting on Vercel with Doppler

This project can be hosted on Vercel while keeping secrets in Doppler.

Prerequisites:

- Vercel CLI installed (`npm i -g vercel`)
- Doppler CLI installed and authenticated
- Project linked to Vercel (`vercel link`)

1. Sync Doppler secrets to Vercel environment(s):

```bash
# production
doppler run --config prd -- npm run vercel:env:sync -- production

# preview
doppler run --config stg -- npm run vercel:env:sync -- preview

# development
doppler run --config dev -- npm run vercel:env:sync -- development
```

You can sync multiple targets in one command:

```bash
doppler run --config prd -- npm run vercel:env:sync -- production,preview
```

2. Deploy:

```bash
# preview deployment
npm run vercel:deploy:preview

# production deployment
npm run vercel:deploy:prod
```

Notes:

- Required secrets are the Meta access token and Google OAuth client ID, client secret, and refresh token.
- Optional values include the login customer ID, API version, Cloud project metadata, report company fields, and Meta import settings.
- Alias names are supported for OAuth values (`GOOGLE_OAUTH_*`, `GOOGLE_WORKSPACE_OAUTH_*`)

### Troubleshooting `NOT_FOUND` on Vercel

If deployment succeeds but `/`, `/overall`, or `/campaign/*` returns `NOT_FOUND`, verify Vercel project settings:

- `Root Directory` must be the repository root (`.`), not `app`
- `Framework Preset` should be `Next.js`
- `Output Directory` should be empty/default for Next.js

Why this happens: setting root to `app` makes Vercel treat that folder as project root. In this repository, route pages live at `app/page.tsx` relative to repo root, so Vercel only detects `api/*` route handlers and misses all page routes.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Meta Ads CSV import

The `/meta-import` page lets any dashboard visitor import Meta Ads Manager CSV reports without
requiring the Marketing API for the imported dataset. The first configured account is `340568485376201`, read
from `META_IMPORT_DEFAULT_ACCOUNT_ID`.

### Export and upload

1. In Meta Ads Reporting, select the correct ad account, reporting level, and date range.
2. Include IDs, reporting dates, Amount spent, Impressions, Clicks, Results, and any optional
   metrics required by the report.
3. Export CSV. XLSX is not supported in this version.
4. Open `/meta-import`, upload the CSV, review automatic mappings, correct mappings when
   needed, and inspect invalid or duplicate rows before confirming.

The importer accepts CSV files up to 4 MB and 25,000 rows. It handles quoted fields, UTF-8 BOM,
Windows/Unix line endings, common date formats, percentages, and localized currency/number
formats. The original file is not retained after parsing.

### Persistence and duplicate handling

Create the D1 database, copy its ID into `cloudflare/meta-csv-import/wrangler.toml`, configure the
Worker-side bearer secret, then migrate and deploy:

```powershell
npx wrangler d1 create automation-meta-csv-import
cd cloudflare/meta-csv-import
doppler run -- npx wrangler secret put META_IMPORT_WORKER_SECRET
cd ../..
npm run cf:meta-import:migrate
npm run cf:meta-import:deploy
```

Configure `META_IMPORT_WORKER_URL` and `META_IMPORT_WORKER_SECRET` in Vercel. Production imports
fail closed when durable storage is not configured. Local development uses a process-local
repository only.

For a local `next start` production-build smoke test only, `META_IMPORT_ALLOW_EPHEMERAL_LOCAL=true`
enables that process-local repository. Never configure this flag in Vercel or another production
deployment.

Rows use a stable key based on account ID, reporting level, campaign/ad-set/ad IDs, and reporting
dates. New keys are inserted, changed records are updated, and exact duplicates are skipped. D1
stores normalized rows and import history; it does not store the original CSV.

After import, open the generated `/overall?...&source=meta_csv` link. Imported data supports the
existing date and campaign-name filters, performance cards, campaign tables, screenshot/PDF page
capture, and the preview hierarchy. API-backed reporting remains the default when `source` is not
set.

### Storage security

Required production storage values:

- `META_IMPORT_WORKER_URL`
- `META_IMPORT_WORKER_SECRET`

The upload page and its import APIs intentionally do not require user authentication. The Worker
secret remains server-side and authenticates only Vercel-to-Cloudflare storage requests; never
expose it in client-side environment variables. Import history records the actor as `Dashboard user`.

### Current limitations

- CSV only; no XLSX import.
- Standard performance exports cannot reconstruct Meta creative media, public post links,
  targeting settings, or all Ads Manager preview details.
- Audience tables require a future audience-breakdown mapping profile.
- An imported comparison period must exist separately for month-over-month deltas.

## Build / Lint

```bash
npm run lint
npm run typecheck
npm run build
```

## TikTok Ads reporting

TikTok reporting is read-only and uses TikTok API for Business v1.3. Configure the
`TIKTOK_BUSINESS_*` values in the shared Doppler project (`locus-t-ai-backend`, `dev`) and give
deployed runtimes a scoped `DOPPLER_TOKEN`. Administrators connect or refresh authorization at
`/auth/tiktok`; access tokens and the authorized advertiser inventory stay server-side.

The dashboard accepts `tiktokAccountId` on `/overall` and `/preview`. Synchronous report requests
are split into inclusive windows of at most 30 days and provider pagination is sequential. The
Cloudflare monthly-report worker migration `0008_tiktok_accounts.sql` adds TikTok identity to the
account directory and per-account queue items. Apply that migration only after deployment approval.

For local development where the main application secrets remain in `locus-t-ai-backend/dev` but
TikTok secrets are held in `ai-backend/dev`, copy only the allowlisted TikTok bundle into the
git-ignored `.env.local` file:

```powershell
npm run tiktok:secrets:sync-local
npm run dev:locus
npm run tiktok:ads:local -- account list
```

The sync prompts securely for the scoped `ai-backend/dev` service token, never prints secret
values, and only reads Doppler. The local TikTok block is read-only; refresh OAuth against the
authoritative Doppler project and run the sync again when TikTok authorization changes.

## Advanced Report Production QA

Advanced Report automation uses the Notion `Advanced Report` checkbox. Basic/Overall monthly automation continues to use `Monthly Email`, and bi-weekly Overall continues to use `Bi-Weekly`.

Required production env vars: reporting platform credentials, `NOTION_TOKEN`, `NOTION_AD_ACCOUNTS_DATABASE_ID` or `NOTION_DATABASE_ID`, `CRON_SECRET` or `WORKER_API_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_MONTHLY_REPORT`, `OPENAI_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Optional: `OPENROUTER_API_KEY` for video analysis and `NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID` with `idempotency_key` or `scheduled_date` for duplicate-send prevention.

Test checklist:

```bash
doppler run -- npm run dev
# Preview
open "http://localhost:3000/advanced?accountId=<ACCOUNT_ID>&startDate=YYYY-MM-01&endDate=YYYY-MM-DD&reportMode=advanced&reportType=advanced"
# Scheduler test mode
curl -X POST "http://localhost:3000/api/cron/monthly-report" \
  -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"forceTestMode":true,"reportType":"advanced","scheduleDay":10}'
```

Use the Advanced page download button to verify browser PDF export. For manual email, run the scheduler in test mode with `MONTHLY_REPORT_TEST_RECIPIENT` set to an internal inbox.

Common failure reasons: missing Notion rows or unchecked `Advanced Report`, missing recipient email, inaccessible Google Ads or Meta Ads account, missing OpenAI/DataForSEO/OpenRouter keys, Advanced cache/generation timeout, PDF render failure, Resend failure, or duplicate send blocked by `accountId + reportType + period + scheduledDate`.

Rollback: set `ADVANCED_REPORT_ENABLED=false` in Vercel/Cloudflare Worker env and redeploy/restart the scheduler environment. This disables scheduled Advanced Report automation only; manual `/advanced` preview and browser PDF download remain available.

Google Ads uses the shared OAuth-only v25 client in `lib/google-ads/rest-client.ts`. Versions below v25 are rejected. Cloud-project inventory and staged rollout instructions: [M07 rollout](docs/operations/m07-rollout.md).
