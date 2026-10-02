# Custom standalone PDF verification — 2026-10-02

## Approved structure

Branch: `codex/custom-report-pdf-structure`. This supersedes the earlier landscape screenshot-slicing approach. Account name/ID and date appear above a divider; analysis precedes ads. Each ad starts on its own A4 portrait page with its metrics then its own creatives. Overflow creatives continue under that ad, never another ad. Both Demand Gen and Meta/TikTok Campaign Breakdown use this composition. Screen, PNG, Overall and monthly automation retain their existing paths. Admin Preview PDF uses the exact same pages and blob as download.

## Local evidence

Tests use synthetic provider/auth fixtures against localhost:3000, with artifacts under ignored `tmp/`. No advertising writes are performed. Unit checks cover performance-column selection and real ads ending in Total. Source-only TypeScript and scoped ESLint checks pass.

Repository-wide `npm run typecheck` remains blocked by pre-existing generated artifacts: `artifacts/m07/domain-smoke.ts` imports a removed export; `outputs/dscaff-google-ads-apr-aug-2026/fetch-performance-data.mts` uses an unsupported .ts import and invalid default service access. `npm run lint` traverses generated .worktrees and tmp bundles and reports thousands of unrelated errors. These files were not changed.

Browser checks passed for populated Demand Gen and Meta/TikTok Breakdown exports: portrait MediaBoxes, printable bounds, image-free metric tables, one ad group per page, retained filter context, preserved hierarchy/totals, desktop/mobile restoration and unchanged Overall export. Overflow fixture retained all 15 creatives across same-ad continuation pages before starting the second ad. Empty interests, unavailable metrics, long names, failed-image placeholders, temporary-document removal and PNG checks passed. Preview checks passed: injected raster failure cleanup, Retry retaining preview intent, no automatic download, exact blob download, close and non-admin visibility. Native page raster images for analysis and an ad were visually inspected; explicit body heights prevent flex reflow during serialization.

Direct control of the user-owned Codex tab was rejected by the browser URL policy. Local automated fixture checks were completed independently; live-account preview remains a user acceptance gate. Very large single metric rows or intro blocks produce an explicit export error rather than silent clipping. Images unavailable to the browser retain a numbered placeholder.

## Native reconciliation and release

Local fixtures do not establish native platform totals or remote asset availability. Review real-account PDFs through the admin preview before release. No API contract or database migration is needed. No deployment or live publishing is included; optimization and authentication edits remain outside this branch's PDF commit. Deployment acceptance is pending.

## Image-embedding follow-up

The actual selected Magnet Google report reproduced a failure on page 5: html-to-image rejected an image load Event after a remote creative URL was fetched again during embedding. The original error was not an Error object, so the UI showed only the generic fallback. Export now converts loaded CORS-safe creative pixels into bounded PNG data URLs once, preventing that second fetch; unavailable pixels retain a numbered placeholder. Raster failures include the page number.

The actual account's 38-page admin preview completed after the fix. This verifies live asset rendering locally, not native metric reconciliation or deployment. A regression fixture serves a creative successfully to the screen/export image loader, then would return 404 on the renderer's next fetch; export succeeds without that third request and retains the image. Source TypeScript and scoped lint pass.
