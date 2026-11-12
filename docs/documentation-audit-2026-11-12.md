# Documentation audit — 2026-11-12

## Scope and conclusion

The documentation was partially current. Reporting and export maps already described many recent changes, but the root README and contributor guide still described the old login/route layout and obsolete automation behavior. Authentication setup existed only as an untracked local file, while the tracked authentication plan described an earlier design.

This audit compared source files and route inventory with the README, contributor guide, existing `docs/` and `map/` records, and service README/configuration entry points. It is a documentation/source audit, not a full feature acceptance test or independent verification of every historical receipt. No provider requests, email sends, database migrations or runtime deployments were performed.

## GitHub coverage before this update

`git fetch origin` succeeded. The configured GitHub repository is [locust08/Automation-Report](https://github.com/locust08/Automation-Report). At review time:

| Ref | Reviewed commit | Existing tracked files under `docs/` and `map/` |
| --- | --- | --- |
| Checked-out branch and `origin/datepicker-improvement` | `419b68158474b0af66cc1fe548b56e0cf302066c` | 27 files: 23 docs and four map cards |
| Default branch, `origin/master` | `71a6fd649b86ad69359c0b8d953251fb4c22b188` | 18 docs; no `map/` directory |

Thus most documentation was already in GitHub, but branch coverage differed. Five October verification receipts and the four map cards existed on `datepicker-improvement` and were absent from the default branch. `docs/auth-setup.md` was untracked and absent from both remote refs. Publishing a documentation branch does not merge it into `master` or update production.

## Corrections and source evidence

| Drift | Correction | Source checked |
| --- | --- | --- |
| `/` described as account entry | `/` is login; `/dashboard` owns account selection | `app/page.tsx`, `app/dashboard/page.tsx` |
| Nonexistent `/keywords` and `/insights` pages | Distinguished remaining JSON endpoints from absent page routes | `app/` route inventory, `app/api/reporting` |
| Missing TikTok, Advanced, standalone reports and workflow ownership | Added route/service inventory and README navigation | `app/`, `lib/reporting/request.ts`, workflow domain directories |
| Preview described as having no edit links; company names omitted Google lookup | Documented edit-draft navigation and Google/Meta name precedence | `components/reporting/preview-hierarchy.tsx`, `lib/reporting/service.ts` |
| Original authentication plan looked like current setup | Marked it historical; reviewed and added the local setup guide | `lib/auth`, `proxy.ts`, `/api/auth/*` |
| Authentication wording implied blanket protection | Listed actual guarded prefixes, basic-user allowlist and unguarded reporting/import paths | `proxy.ts`, `lib/auth/access.ts`, reporting and Meta CSV handlers |
| Google sign-in/profile modes presented as interchangeable | Documented `id` versus `user_id`/email/hash expectations and the unresolved compatibility dependency | `lib/auth/config.ts`, `current-session.ts`, `users.ts`, Google callback |
| Cron described as day 5, with environment-only targets | Recorded day 7/10/15 schedule and actual Notion-confirmed target path | `cloudflare/monthly-report-cron/wrangler.toml`, `cloudflare/monthly-report-cron/src/index.ts`, `src/lib/cron/run-monthly-report-job.ts`, `/api/report-pdf/targets` |
| Vercel automation described a missing screenshot helper | Documented current print route and Playwright PDF generator | `src/lib/cron/generate-monthly-report-pdf.ts` |
| Test recipient described only the legacy default | Distinguished current helper defaults and the dedicated test script's enforcement | `src/lib/email/send-monthly-report-email.ts`, `lib/automation/monthly-report.ts`, pre-scheduler test helper |
| Old Demand Gen receipt stated 15-minute caching | Kept the receipt historical and pointed to the seven-day current contract | `lib/reporting/demand-gen-cache.ts` |
| No central documentation index or README map link | Added `docs/README.md`, `map/application.md` and root README links | Repository documentation and service entry points |
| Search-term publishing guide omitted local shared-mode work | Added an explicitly unpublished workspace note, preserving the committed environment gate | HEAD and working versions of `automatic-actions.ts` and exclusion-cap repository |

## Existing work and remaining limits

The workspace already contained unrelated changes to navigation, optimization scheduling, exclusion settings, automatic actions, Advanced report/cache code and `map/acceptance.md`, plus an untracked publishing-mode migration. Those implementation changes and the acceptance-ledger additions are not included in this documentation publication. The pre-existing `docs/auth-setup.md` was reviewed, corrected and included because publishing missing documentation is part of this request.

The Google callback assumes a legacy-shaped profile even when the default table URL points to the normal profile table. This is a source-level compatibility concern; the configured production schema and successful end-to-end OAuth behavior were not established here. The documentation now states that dependency instead of claiming every profile mode works.

Historical plans, architecture proposals, rollout gates and receipts remain dated records. In particular, cross-repository/local artifact paths are not files published by this repository, and old statements about deployment readiness do not certify today's runtime. Native provider reconciliation and connected acceptance retain their existing gates in the [acceptance ledger](../map/acceptance.md).

## Verification and release

Documentation validation checks relative Markdown link targets, referenced source paths, the documentation diff and the tracked publication scope. No application behavior changed, so application/browser tests and runtime deployment are not required for this update. Rollback is to revert the scoped documentation commit.

Local verification: 87 relative Markdown links across 39 documentation files resolve; referenced source files in the updated guides were checked for existence, and the scoped whitespace check passes. This establishes documentation integrity rather than runtime or provider acceptance.

The initial update was published as `d68d6e6` on `codex/documentation-audit-20261112`, based on the reviewed `datepicker-improvement` commit.

## Master integration — 2026-11-12

The user subsequently requested integration into `master`. An isolated checkout based on remote master `71a6fd649b86ad69359c0b8d953251fb4c22b188` was used to transfer only the documentation changes and the map/receipt documents required by their links. The feature branch contains additional application commits, so a whole-branch merge would also introduce unrelated runtime changes. Those application commits are excluded from this documentation integration.

The README and application map were reconciled against master: `/campaign-breakdown` and personal report preferences are absent, Settings is admin-only, and Demand Gen still has a 15-minute cache. The imported reporting/presentation records are explicitly labeled as feature-branch snapshots. The original dirty workspace and its acceptance-ledger additions remain untouched. Validation covers documentation links and a documentation-only diff against master; no runtime deployment is needed. Rollback is to revert this integration commit.

Integration checks: 95 relative links across 39 Markdown documents resolve, whitespace validation passes, and all 19 changed files are Markdown documentation. The original workspace retains the same 16 pre-existing status entries. Runtime tests were not rerun for this documentation-only integration.
