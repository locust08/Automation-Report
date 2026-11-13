# Application routes and service ownership

Source reviewed 2026-11-12 at base commit `419b681`. This inventory describes the checked-out implementation. Existing uncommitted workflow/cache changes are identified separately in the [audit](../docs/documentation-audit-2026-11-12.md); a source/configuration check does not establish live deployment or database state.

## Entry and authentication

`app/page.tsx` renders login. After sign-in, `/dashboard` renders the account selector and role-aware launcher. Email/password and Google callback routes issue an application JWT cookie; `lib/auth/current-session.ts` validates it against the current profile. Eight roles are defined in `lib/auth/roles.ts`. See [authentication setup](../docs/auth-setup.md) for the two profile modes and the Google callback's schema dependency.

`proxy.ts` protects named application prefixes and restricts the basic `user` role through `lib/auth/access.ts`. It is not a blanket authentication guard for every page/API. Workflow APIs also use their own session/permission helpers. Normal reporting routes and Meta CSV handlers include unguarded read/import paths; do not infer authorization from account IDs or navigation visibility.

## Report surfaces

| Route | Source ownership |
| --- | --- |
| `/overall`, `/preview`, `/campaign/[campaignType]`, `/auction` | `components/reporting`, `lib/reporting/service.ts`, `lib/reporting/types.ts` |
| `/advanced` | `lib/reporting/advanced-report.ts`, Advanced report client and cache modules |
| `/demand-gen` | `lib/reporting/demand-gen.ts`, creative normalization and seven-day bounded process cache |
| `/campaign-breakdown` | `components/reporting/breakdown-report.tsx` and preview hierarchy data |
| `/reports/print/monthly/[accountId]` | Server print report used by Vercel PDF generation |
| `/meta-import` | `lib/meta-import`; normalized CSV rows and history persisted through the storage Worker |
| `/settings` | Personal report-display preferences; admin-only workflow settings |

`/api/reporting/*` remains the report facade. Additional staged APIs under `/api/reports`, `/api/advanced`, `/api/accounts`, `/api/campaigns`, `/api/ad-groups` and `/api/ads` load summaries and hierarchy sections independently. `/keywords` and `/insights` have JSON endpoints but no page files in this checkout.

Provider collection supports Google, Meta and TikTok. `request.ts` parses explicit provider IDs, inclusive dates, platform, `campaignScope` and `source`. `source=meta_csv` chooses imported data; `campaignScope=lt` is restricted by `campaign-name-filter.ts` to one configured Meta-only account. Client fetches use `cache: "no-store"`; server report caches are separate. Overall cache reads require `cache=1` and a positive `OVERALL_REPORT_CACHE_TTL_SECONDS` (default zero); `refresh=1` or `regenerate=1` bypasses reading. See the [reporting](reporting.md) and [presentation](presentation.md) cards for provider semantics, exports and dated evidence.

## Workflow surfaces

| Area | Routes and source ownership |
| --- | --- |
| Cross-platform management and M03 | `/manage`, platform-specific management routes and `/change-control`; `lib/ads-management`, `lib/change-control`, `/api/change-control/*` |
| Dashboard campaign planning | `/campaigns`; `lib/campaign-planning`, `/api/campaign-planning/*`; isolated M04 tables and mock workflow described in [database ownership](../README_campaign_creation.md) |
| Media plan | `/dashboard/media-plan`; `lib/media-plan`, `lib/openai/generateMediaPlan.ts`, `lib/google-ads/createSearchCampaignFromMediaPlan.ts`; Notion approval and paused Google Search creation are a separate flow |
| Search-term analysis | `/search-term-optimization`; `lib/search-term-optimization`, Python review pipeline, durable batch rows and [automatic-action policy](../docs/search-term-auto-approval.md) |
| Placement optimization | `/placement-optimization`; `lib/placement-optimization` and the [placement cache Worker](../cloudflare/placement-analysis/README.md). Production v25 transport recovered 2026-11-13; Magnet October retrieval completed with the first 250 placements. Deployment, verification limits and rollback are recorded in the Worker guide. |
| Scheduling and reporting | `/optimization-scheduling`, `/search-term-pm-reports`; `lib/optimization-scheduling`, `lib/search-term-pm-reports` |
| Traffic-quality review | `/api/traffic-quality/*`; `lib/traffic-quality`; narrow live pilot documented [separately](../docs/runbooks/m01-live-pilot.md) |
| Team oversight | `/team-lead-monitoring`; `lib/team-lead-monitoring` |
| Billing | `/billing`, `/api/billing/*`; `lib/billing`, `cloudflare/billing-operations-api` and its D1 checklist binding |
| User administration | `/user-management`, `/api/admin/users/*`; `lib/auth/users.ts` |

Management pages, dashboard mock planning, the real Media Plan creation route, and the isolated DigitalBee M04 Worker have different execution boundaries. Follow each service's policy and permission checks; a UI template or source review does not authorize provider mutation.

## Report and optimization automation

The Cloudflare [monthly report Worker](../cloudflare/monthly-report-cron/README.md) owns jobs/items in D1, one-account Queue messages, Browser PDF rendering, R2 artifacts and Resend delivery. It also synchronizes the Notion account directory into D1. Configuration in `wrangler.toml` specifies:

| UTC cron | Malaysia time / purpose |
| --- | --- |
| `0 4 7,10,15 * *` | Noon: day 7 monthly Overall, day 10 monthly Advanced, day 15 bi-weekly Overall |
| `5,15,25,35,45,55 * * * *` | Directory sync every ten minutes, offset five minutes |

Monthly reports use the previous month; bi-weekly Overall uses the current month's 1st–14th. The Notion checkboxes are `Monthly Email`, `Advanced Report` and `Bi-Weekly` respectively. The Worker renders `/overall` or `/advanced` in screenshot mode and prints PDFs through its Browser binding.

The separate Vercel endpoint `POST /api/cron/monthly-report` invokes `src/lib/cron/run-monthly-report-job.ts`. Explicit/configured target lists are resolved through Notion; otherwise it reads eligible Notion accounts. `generate-monthly-report-pdf.ts` uses Playwright print PDFs from `/reports/print/monthly/[accountId]` or Advanced capture, then the email helper sends through Resend. The old `lib/automation/monthly-report.ts` helper is not the route's current orchestration path. Test-recipient handling differs between helpers and scripts; read their configuration before an authorized email test.

The [search-term scheduler](../cloudflare/search-term-optimization-scheduler/README.md) dispatches `.github/workflows/search-term-optimization.yml`. The [cache Worker](../cloudflare/advanced-report-cache/README.md) stores Advanced, optional Overall and TikTok report JSON in D1/R2. Neither is the monthly report scheduler.

## Verification and deployment

Run the checks declared in `package.json` for the affected module. Normal code changes require `npm run typecheck` and `npm run lint`; browser/export changes also need the relevant fixture/browser checks. Generated outputs, `.next`, `.wrangler` caches and private artifacts stay outside commits. `npm run build` runs typecheck first; `next build` alone ignores TypeScript errors through `next.config.ts`.

The documentation audit checks source ownership, links and remote Git contents. It does not renew old provider reconciliation, connected-host acceptance or deployment receipts. Remaining dated gates are in the [acceptance ledger](acceptance.md). Documentation-only changes require no runtime deployment; rollback is to revert the documentation commit.
