# Automated Report Website

Multi-page reporting website for Meta Ads Manager + Google Ads Manager with a shared account/date filter flow.

## Pages

- `/` Input Ad Account ID and jump to reports.
- `/overall` Overall performance page:
  - Meta metrics
  - Google Ads metrics
  - Google Ads YouTube overview metrics
  - Collapsible campaign-type grouped table
- `/campaign/[campaignType]` Campaign type page:
  - Selected month vs previous month comparison
  - Collapsible sections and totals
- `/keywords` Top 10 keyword page (Google Ads Manager extraction):
  - Keyword-level performance table
  - Grand total summary row
- `/auction` Auction page (Google Ads Manager extraction):
  - Auction insights domain metrics
  - Average benchmark row

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
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional override; defaults to fixed MCC `366-613-7525`)
- `GOOGLE_ADS_API_VERSION` (optional, defaults to `v22`)
- `REPORT_COMPANY_NAME` (optional display label)
- `REPORT_COMPANY_NAME_MAP` (optional account ID to company mapping)
  - JSON format example: `{"6972528848":"Soka International School"}`
  - Comma format example: `6972528848:Soka International School,1234567890:Another Company`
  - Example for this account: `{"283341217383189":"<Registered Company Name>"}`

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

## Build / Lint

```bash
npm run lint
npm run typecheck
npm run build
```
