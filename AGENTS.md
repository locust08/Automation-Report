# Automation Report Codebase Guide

This repository is a Next.js reporting application for Meta Ads and Google Ads data. It renders interactive report pages, exposes API routes that fetch and normalize ad platform data, and includes a monthly automation path that captures the Overall report as a PDF and emails it through Resend.

## Tech Stack

- Next.js 16 App Router with React 19 and TypeScript.
- Tailwind CSS 4 and local shadcn-style UI components in `components/ui`.
- Meta Graph API and Google Ads API integrations in `lib/reporting`.
- Notion is used for account metadata and Google Ads access-path resolution.
- Playwright and `jspdf` are used by monthly report automation to capture `/overall` and convert a screenshot to PDF.
- Resend sends monthly report emails.
- Vercel hosts the Next.js app. A small Cloudflare Worker can trigger the Vercel monthly cron endpoint.

## Main Directory Map

- `app/`: Next.js route tree.
  - `app/page.tsx`: home page where a user enters an ad account ID.
  - `app/overall/page.tsx`: overall monthly performance report.
  - `app/preview/page.tsx`: read-only campaign/ad preview page.
  - `app/campaign/[campaignType]/page.tsx`: campaign type comparison page.
  - `app/keywords/page.tsx`: Google top keyword report page.
  - `app/auction/page.tsx`: Google auction insights page.
  - `app/insights/page.tsx`: recommendations/insights page.
  - `app/api/reporting/*`: thin API route wrappers for report payloads.
  - `app/api/cron/monthly-report/route.ts`: endpoint that runs the monthly report job.
  - `app/globals.css`: global Tailwind and theme styling.
- `components/reporting/`: report UI, page clients, shared hooks, tables, loading states, filters, and report shell.
- `components/ui/`: reusable UI primitives generated in the project style.
- `lib/reporting/`: core reporting domain layer. This is where platform APIs, aggregation, formatting, date logic, Notion lookup, and payload types live.
- `lib/automation/`: legacy or shared automation helpers.
- `src/lib/cron/`: monthly report job orchestration, target resolution, screenshot capture, and PDF generation helpers.
- `src/lib/email/`: Resend email delivery for monthly reports.
- `src/lib/notion/`: Notion account reader for monthly report account rows.
- `scripts/`: manual smoke tests, workflow runners, Vercel env sync, and one-off monthly report utilities.
- `cloudflare/monthly-report-cron/`: Cloudflare Worker that only calls the Vercel monthly report endpoint on schedule.
- `public/`: static assets used by the UI, including logos and background images.

## Request And Data Flow

1. Users land on `/` and enter an account ID, or open a report URL with query params.
2. Report client components use `useReportFilters` to read and write query params.
3. Client hooks in `components/reporting/use-report-data.ts` fetch the matching API route with `cache: "no-store"`.
4. API routes parse params with `lib/reporting/request.ts`, call one function from `lib/reporting/service.ts`, and return JSON.
5. `lib/reporting/service.ts` is the orchestration layer. It resolves dates, account IDs, company names, Notion Google manager context, platform data, warnings, and final payloads.
6. Platform modules fetch raw data:
   - `lib/reporting/meta.ts` talks to Meta Graph API.
   - `lib/reporting/google.ts` talks to Google Ads API.
7. Shared helpers in `metrics.ts`, `audience-breakdown.ts`, `insights.ts`, and `format.ts` normalize rows into display payloads.
8. UI components render payload sections, tables, warning panels, loading screens, and page-level shells.

## Report API Routes

- `GET /api/reporting`: overall report payload from `getOverallReport`.
- `GET /api/reporting/campaign`: campaign comparison payload from `getCampaignComparison`.
- `GET /api/reporting/preview`: preview hierarchy payload from `getPreviewReport`.
- `GET /api/reporting/keywords`: top keyword payload from `getTopKeywordsReport`.
- `GET /api/reporting/auction`: auction insights payload from `getAuctionInsightsReport`.
- `GET /api/reporting/insights`: recommendations payload from `getInsightsReport`.
- `POST /api/cron/monthly-report`: runs `runMonthlyReportJob`.

The reporting API routes are intentionally thin. Add report behavior in `lib/reporting/service.ts` or lower-level helpers, not in route handlers.

## Query Parameters

Supported report query params:

- `accountId`: fallback generic account ID.
- `metaAccountId`: explicit Meta account ID.
- `googleAccountId`: explicit Google Ads customer ID.
- `startDate`: `YYYY-MM-DD`.
- `endDate`: `YYYY-MM-DD`.
- `platform`: `meta`, `google`, or `googleYoutube`.
- `screenshot`: used by automation/download flows to prepare report capture mode.

The filter UI can serialize multiple account rows by combining Meta and Google IDs into comma-separated values. Server-side normalization happens in `lib/reporting/env.ts` and service helpers.

## Reporting Domain Files

- `service.ts`: main facade for all report payloads. Start here when changing what reports return.
- `types.ts`: shared payload and row contracts used by routes, services, and UI.
- `google.ts`: Google Ads queries, account name lookup, preview hierarchy, keywords, auction insights, and audience data.
- `meta.ts`: Meta campaign, insight, preview, audience, and account name queries.
- `notion.ts`: Notion database lookup for Google account manager/access-path resolution.
- `google-access-path.ts`: normalization and validation for direct vs manager Google Ads access.
- `metrics.ts`: campaign row merging, totals, grouping, and deltas.
- `audience-breakdown.ts`: audience label normalization, aggregation, sorting, and "Others" limiting.
- `date.ts`: selected and previous date range construction.
- `format.ts`: display formatting for numbers, currency, percent, and deltas.
- `insights.ts`: builds simple platform-specific recommendation rows.
- `api-error.ts`: standardized API error responses.
- `request.ts`: route search param parsing.

## Frontend Structure

- Page components in `app/*/page.tsx` are mostly server wrappers with `Suspense`.
- Main interactive pages live in `components/reporting/*-page-client.tsx`.
- `ReportShell` owns the shared report frame, top navigation, header area, footer, and capture root attribute.
- `ReportFiltersBar`, `ReportHeaderMonthPicker`, and `useReportFilters` own user input and URL state.
- `use-report-data.ts` owns client-side fetching and consistent error extraction.
- Table and chart-adjacent display components are split by report type:
  - `campaign-table.tsx`
  - `google-insights-table.tsx`
  - `insights-table.tsx`
  - `metric-grid.tsx`
  - `audience-click-breakdown.tsx`
  - `preview-hierarchy.tsx`

When adding a new report view, follow the existing pattern: App Router page wrapper, page client, hook in `use-report-data.ts`, API route, service function, typed payload in `types.ts`.

## Monthly Report Automation

The monthly report flow is separate from normal user browsing:

1. `POST /api/cron/monthly-report` calls `runMonthlyReportJob`.
2. `src/lib/cron/monthly-report-targets.ts` resolves configured targets from `MONTHLY_REPORT_TARGETS_JSON` or test targets.
3. `capture-overall-report-pdf.ts` opens `/overall` in Playwright for the previous month, waits for `/api/reporting`, screenshots the report capture root, and converts the PNG to a PDF.
4. `send-monthly-report-email.ts` sends the PDF through Resend.
5. Artifacts are written under `artifacts/monthly-report-tests`.

`src/lib/notion/get-monthly-report-accounts.ts` can read eligible monthly report accounts from Notion, but the current cron target path is environment-target based unless it is changed to call that reader.

The Cloudflare Worker in `cloudflare/monthly-report-cron` does not generate reports. It only posts a scheduled payload to the Vercel cron endpoint.

## Environment Variables

Most commands that hit real integrations should run through Doppler.

Important variables include:

- Meta: `META_ACCESS_TOKEN`.
- Google Ads: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_API_VERSION`.
- Notion: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_AD_ACCOUNTS_DATABASE_ID`, `NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID`.
- Cron/email: `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_MONTHLY_REPORT`, `MONTHLY_REPORT_TEST_MODE`, `MONTHLY_REPORT_TEST_RECIPIENT`, `MONTHLY_REPORT_TARGETS_JSON`, `MONTHLY_REPORT_TEST_TARGETS_JSON`, `MONTHLY_REPORT_APP_BASE_URL`.
- Display/company: `REPORT_COMPANY_NAME`, `REPORT_COMPANY_NAME_MAP`.

The Google OAuth aliases documented in `README.md` are also supported for existing Doppler naming.

## Commands

- `npm run dev`: start local Next.js dev server.
- `npm run dev:doppler`: start dev server with Doppler env.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run TypeScript with `tsc --noEmit`.
- `npm run build`: run typecheck and `next build`.
- `npm run build:doppler`: production build with Doppler env.
- `npm run notion:smoke`: validate Notion access.
- `npm run vercel:env:sync -- <target>`: sync Doppler env values into Vercel target.
- `npm run vercel:deploy:preview`: Vercel preview deploy.
- `npm run vercel:deploy:prod`: Vercel production deploy.

For real API work, prefer:

```bash
doppler run -- npm run dev
doppler run -- npm run typecheck
doppler run -- npm run build
```

## Tests And Verification

There is no broad automated test suite. Existing focused checks include:

- `lib/reporting/audience-breakdown.test.mjs`
- `scripts/google-access-path-resolution.test.mts`
- `scripts/notion-smoke.mjs`
- manual monthly workflow scripts under `scripts/`

For normal code changes, run at least:

```bash
npm run typecheck
npm run lint
```

For report UI changes, also run the app and manually verify affected routes with realistic query params. If the change affects screenshot or monthly email behavior, run the relevant manual monthly report script with test mode and Doppler secrets.

## Implementation Notes For Future Agents

- Keep API route handlers small. Put business logic in `lib/reporting`.
- Keep payload contracts in `lib/reporting/types.ts` synchronized with both API service functions and client components.
- Preserve `cache: "no-store"` and `dynamic = "force-dynamic"` for report APIs because data is account/date dependent and integration-backed.
- Be careful with Google Ads manager IDs. Use `google-access-path.ts` and Notion resolution helpers instead of hardcoding login-customer behavior in new code.
- Google Ads calls in `service.ts` are sometimes sequential to avoid burst rate limits. Do not parallelize them casually.
- Account IDs are normalized differently for Meta and Google. Use existing normalization helpers.
- Monthly report screenshot capture depends on `[data-report-capture-root="true"]` in `ReportShell`.
- `next.config.ts` ignores Next build type errors because CI/local scripts enforce type safety through `npm run typecheck`; do not treat `next build` alone as type validation.
- Do not commit generated files from `artifacts/`, `.next/`, or worker `.wrangler/cache`.
- Static brand assets are referenced directly from `public/`; verify filenames before changing image paths.
