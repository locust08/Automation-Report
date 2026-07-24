# Automated Report Website

Multi-page reporting website for Meta Ads Manager + Google Ads Manager with a shared account/date filter flow.

## Pages

- `/` Input Ad Account ID and jump to reports.
- `/overall` Overall performance page:
  - Meta metrics
  - Google Ads metrics
  - Google Ads YouTube overview metrics
  - Collapsible campaign-type grouped table
- `/preview` Read-only platform preview page:
  - Same shell/theme as Overall
  - Live campaign hierarchy from Google Ads + Meta Ads APIs
  - Expand campaign names to inspect Campaign -> Ad Group / Ad Set -> Ad -> Details
  - No edit or management actions
- `/campaign/[campaignType]` Campaign type page:
  - Selected month vs previous month comparison
  - Collapsible sections and totals
- `/keywords` Top 10 keyword page (Google Ads Manager extraction):
  - Keyword-level performance table
  - Grand total summary row
- `/auction` Auction page (Google Ads Manager extraction):
  - Auction insights domain metrics
  - Average benchmark row
- `/dashboard/media-plan` Media Plan setup page:
  - User enters Website URL, Ad Budget, and Google CID
  - OpenAI generates a structured Google Search media plan with `OPENAI_MEDIA_PLAN_MODEL` and `OPENAI_MEDIA_PLAN_PROMPT_ID`
  - Generated JSON renders as editable campaign, ad group, keyword, RSA, sitelink, and planning-note sections
  - Final approval stores one detailed Notion row per ad group, then creates the Google Ads campaign as `PAUSED`
  - Success state shows the Notion batch details, campaign ID, and Google Ads review link

## URL Parameters

These can be passed directly in the URL and auto-fill the filter form:

- `accountId` Generic account ID applied as fallback for both Meta and Google
- `metaAccountId` Explicit Meta account ID (overrides fallback)
- `googleAccountId` Explicit Google Ads customer ID (overrides fallback)
- `startDate` Format: `YYYY-MM-DD`
- `endDate` Format: `YYYY-MM-DD`
- `platform` `meta | google | googleYoutube` (used on campaign page)

Example:

`/overall?accountId=697-252-8848&startDate=2026-02-01&endDate=2026-02-28`

## Doppler / Environment

Credentials are expected from environment variables (Doppler injects these at runtime):

- `META_ACCESS_TOKEN`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_ACCESS_TOKEN` (optional if refresh flow is configured)
- `GOOGLE_ADS_REFRESH_TOKEN` (optional, enables automatic token refresh)
- `GOOGLE_ADS_CLIENT_ID` (required for refresh flow)
- `GOOGLE_ADS_CLIENT_SECRET` (required for refresh flow)
- `NOTION_TOKEN` (used to read `DB | Ad Accounts`)
- `NOTION_DATABASE_ID` (used to read `DB | Ad Accounts`; raw Notion database ID, not the full browser URL)
- `NOTION_AD_ACCOUNTS_DATABASE_ID` (preferred override for monthly cron account selection)
- `NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID` (optional Notion database for monthly cron send logs)
- `CRON_SECRET` (required by `/api/cron/monthly-report`)
- `RESEND_API_KEY` (required for monthly report email delivery)
- `RESEND_FROM_MONTHLY_REPORT` (optional; defaults to `Locus-T <no-reply@locus-t.com.my>`)
- `MONTHLY_REPORT_TEST_MODE` (optional; when `true`, only the first eligible account is processed)
- `MONTHLY_REPORT_TEST_RECIPIENT` (optional; defaults to `ava@locus-t.com.my`)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional override; defaults to fixed MCC `366-613-7525`)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v22`)
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

Company name resolution order:
1. `REPORT_COMPANY_NAME_MAP` (if matched)
2. Meta account registered name from Graph API (when a Meta account ID is available)
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

If credentials are missing or the provided account ID is not accessible, the API returns clear warnings/errors without requiring user login.

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

- Required secrets for sync: `META_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- Optional secrets are synced when present (`GOOGLE_ADS_ACCESS_TOKEN`, refresh/client credentials, login customer ID, API version, report company fields)
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

## Advanced Report Production QA

Advanced Report automation uses the Notion `Advanced Report` checkbox. Basic/Overall monthly automation continues to use `Monthly Email`, and bi-weekly Overall continues to use `Bi-Weekly`.

Required production env vars: reporting platform credentials, `NOTION_TOKEN`, `NOTION_AD_ACCOUNTS_DATABASE_ID` or `NOTION_DATABASE_ID`, `CRON_SECRET` or `REPORT_AUTOMATION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_MONTHLY_REPORT`, `OPENAI_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Optional: `OPENROUTER_API_KEY` for video analysis and `NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID` with `idempotency_key` or `scheduled_date` for duplicate-send prevention.

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
