# Typography and PDF presentation

Source reviewed 2026-10-02. Global screen typography is implemented in `app/globals.css` and shared UI/report components.

| Role | Below 768px | From 768px |
| --- | --- | --- |
| Main title | 24px | 32px |
| Section heading | 20px | 24px |
| Card heading | 16px | 18px |
| Body/navigation/buttons/dropdowns | 14px | 14px |
| Editable inputs | 16px | 14px |
| Tables | 13px | 14px |
| Notes | 12px | 12px |

Screen root uses a 16px base. Main titles wrap at word boundaries. Mobile controls retain 44px touch targets; wide tables scroll within their containers.

## Capture contract

`ReportShell` marks `[data-report-capture-root="true"]` and sets `data-report-typography` to screen or capture. Capture restores its separate root sizing; screen rules deliberately exclude capture documents. Overall interactive maximum width is 1,920px; established screenshot width is 1,440px.

Demand Gen and Campaign Breakdown standalone PDFs use composed A4 portrait documents with 10 mm margins. Dashboard branding, header background, typography, cards, colours, tables and chart bars are restored within that composition. Analysis and campaign/ad-set summaries precede ad pages. Each ad starts on a fresh page, grouped by campaign, with repeated continuation context and metrics where needed. Wide tables split metric groups with repeated identity columns.

Each ad shows one uncropped selected image or video thumbnail with its selection label and independent asset spend. Demand Gen uses the same selected asset and values on screen and in PDF; Breakdown identifies representative previews when independent performance is unavailable. Demand Gen exports Impressions and Ad spend; other pages retain their existing metrics. Loaded image pixels are embedded; unavailable creatives use bounded placeholders, including a compact footer-logo fallback. Dates, filters, warnings and nullable values retain source meaning.

Administrators see **Preview PDF** beside **Report** on these standalone pages. Preview renders the same PDF page images in an in-page dialog and offers download of that generated PDF. Screen and PNG layouts are unchanged. Preview memory is released on close; temporary capture mode, styles and colspans restore on success/failure. See [current local receipt](../docs/custom-pdf-verification-2026-10-02.md). Deployment remains separate.

Overall capture is a separate path from standalone compact exports. The audience-heading overlap was reproduced and fixed locally on 2026-10-02: the heading/caption group fills available card-header width to prevent embedded export fonts wrapping inside intrinsic text widths. Empty/populated actual SVG bounds and PNG/PDF downloads passed; the populated raster was inspected. See [receipt](../docs/reporting-verification-2026-10-02.md). Production deployment remains separate.

## Verification

`scripts/report-page-improvements-browser-test.mjs` verifies typography at 390, 782, 1440 and 1920px, long names, navigation/touch targets, date controls and report downloads using synthetic provider fixtures. Its Overall fixture currently has empty audience arrays; download success alone cannot establish populated audience layout correctness.

`scripts/report-structure-browser-test.mjs` covers hierarchy behavior, matrix presentation, responsive width and capture with fixtures. Keep rendered screenshots/PDFs outside tracked source. Validate screen and capture independently after presentation changes.

`scripts/report-audience-export-browser-test.mjs` checks actual serialized export text against caption bounds for empty and populated audience data; download success alone cannot replace this layout check.

Demand Gen screen Ads metrics (Clicks, CTR, CPC, Impressions, Ad spend) toggle numeric descending/ascending ordering on header clicks, with arrow and aria-sort indicators. Unavailable/nonfinite values stay last; equal values retain source order. Sorting is local, does not fetch data, and remains during capture. Campaign filtering was not added in this change.

Wide Breakdown PDF tables split into consecutive metric groups with repeated Name context instead of squeezing every metric into one portrait table. Numeric values stay on one line; headings wrap fully above table headers with additional spacing. Every metric, total and active filter remains represented. See the Breakdown spacing follow-up in the custom PDF receipt for local fixture evidence.

Current dashboard-style single-creative PDF checks are recorded in the [creative/PDF receipt](../docs/demand-gen-creative-pdf-verification-2026-10-02.md). Earlier gallery receipts are historical. These latest changes are locally verified and not deployed.

## Breakdown opening-card overflow fix — 2026-10-02

Report-level scope excludes paragraphs inside tables, per-creative metadata and export-excluded controls. Creative selection/spend captions remain on individual ad pages instead of being duplicated into an unbounded introduction. A 25-ad fixture reproduced the exact “report block is too large” failure before this fix and exports all 25 ads after it, with zero ad captions in the introduction and every page fitting its printable body. Nine focused PDF tests and scoped lint passed. Artifact: ignored `tmp/breakdown-scope-regression.pdf`. This is local fixture evidence; deployment remains separate.

Live local browser confirmation for Bellamy MY account `265352415868160`, September 1–30: port 3000 runs from the original workspace at `681abcc`. Reloaded the browser and generated Preview PDF against real read-only provider data; all 45 preview pages appeared with no overflow error. This verifies local connected rendering, not a production deployment. The earlier error did not recur after a fresh browser reload.

## Personal comparison percentage display â€” 2026-10-20

Settings exposes personal switches for Monthly Performance, all campaign report types, and Advanced Report. All default to enabled. The switches hide comparison percentages, their indicator arrows, and comparison percentage details in metric dialogs, trend tooltips, and keyword growth displays. KPI values, CTR, conversion rates, audience and auction shares, and calculations stay unchanged.

The shared client preference state persists through interactive screenshot/download transitions. Downloads wait for initial preference loading; when comparison display is off, the optional server-PDF path uses the existing client capture instead so output matches the screen. Newly opened automation screenshot pages and scheduled server print reports retain the standard appearance.

Local evidence: focused API/access/render tests and app-source typecheck pass; scoped ESLint passes. Browser fixtures verify the basic-user card, independent switches, reload persistence, failed-save behavior, hidden KPI comparisons/dialog details, preserved CTR and capture state. See `artifacts/report-display-preferences/` for local screenshots and checks (not committed). This is display verification, not native-provider reconciliation. Repository-wide typecheck remains blocked by three pre-existing errors in generated artifacts/outputs. Repository-wide lint (excluding generated directories) reports existing errors; scoped lint passes. Deployment evidence is separate.

2026-10-20 status-label correction: personal report settings use ASCII `Loading preferences...` and `Saving...` labels to avoid corrupted ellipsis characters. Scoped ESLint and all seven preference tests pass; this changes display text only.

2026-10-20 navigation refinement: the Preferences/Settings group has no separator border; other navigation group separators are unchanged.


## Date picker improvement - 2026-10-27

The shared report date picker shows one month below 768px and two on larger screens. Its portalled popover fits the viewport, repositions around the trigger, and scrolls vertically when space is limited. Mobile calendar columns shrink within the available width while day buttons retain 44px height.

DayPicker now uses controlled onSelect state: selecting a new start clears the previous range highlight immediately, and the next valid end completes the same draft shown in the footer. An earlier second click restarts selection; selecting the same day twice permits a single-day report. Apply commits the draft; Cancel, Escape and outside dismissal discard it. Calendar dates use UTC consistently across browser timezones.

Local evidence: scripts/datepicker-improvement-browser-test.mjs passes at 320, 390, 767, 782 and 1440px in Malaysia and Los Angeles timezones, covering replacement highlights, earlier-date restart, same-day Apply, presets, Escape and horizontal bounds. Screenshots are in ignored artifacts/datepicker-improvement/; the 320px render was visually reviewed. Four date-selection unit tests and scoped ESLint pass. Repository typecheck has existing generated-artifact errors; repository lint excluding generated directories has existing campaign-creation no-explicit-any errors. The existing Overall layout source test fails its unrelated report-title assertion. No provider reconciliation is needed for this client-only change. No Cloudflare service is affected; deployment is skipped because this workspace contains unrelated changes. Rollback: revert the scoped datepicker commit.

Source-only TypeScript validation passes using the repository compiler settings with generated artifacts, outputs, temporary files and nested worktrees excluded.
