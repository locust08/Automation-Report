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

## Campaign grouping refinement

Ad pages now group campaigns in first-seen order, retaining the original order of ads within each campaign. Each page and continuation repeats the campaign heading above the ad name, removing the redundant Campaign column only from ad metrics. Screen and PNG remain unchanged.

## Breakdown spacing follow-up

Wide Breakdown PDF tables now use consecutive metric groups with the Name column repeated, retaining every provider metric and total. Automatic table sizing, unbroken numeric values, larger cell padding and fully wrapping headings prevent the reported clipping and heading/header overlap. Each group paginates independently with repeated context; screen layouts are unchanged.

Local verification: four PDF helper tests passed; scoped TypeScript and ESLint passed. The full browser fixture suite passed with Meta value filters, retained hierarchy ancestors, TikTok exports, large numeric values, long names and mobile downloads. Geometry checks verify headings end before tables begin, numeric cells fit, and page bodies do not overflow. Existing repository-wide typecheck/lint blockers remain as recorded above. Native reconciliation and deployment acceptance remain pending.

Fresh Bellamy Meta account preview completed locally. Raster inspection identified an additional continuation-heading wrap difference, so headings reserve an extra line of space below their text. This is export-only spacing; the selected dates and report filters are unchanged.
