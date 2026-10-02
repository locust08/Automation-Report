# Landscape PDF verification — 2026-10-02

Branch: `codex/landscape-report-pdfs`. Scoped work only; existing optimization/authentication edits are unrelated.

## Implementation

Standalone Demand Gen and Meta/TikTok Campaign Breakdown downloads now use A4 landscape, 10 mm margins, and content-driven pagination. Demand Gen audience charts/tables use equal columns; format/device uses 2:1 columns. Pagination preserves bounded rows, labels/bars and heading/content groups; overlapping columns that cannot break safely fit together on a page. Oversized individual elements continue across bounded captures.

Administrator-only Preview PDF sits beside Report, opens page images in a native modal, and downloads the same generated PDF on request. Images work in Codex without requiring an embedded PDF viewer. No provider writes, migrations or deployment.

## Local evidence

- Pagination unit tests: 5 passed, including the overlapping-column regression observed failing before its fix and fractional adjacent-row coverage.
- Fixture browser checks on the existing `http://localhost:3000`: Demand Gen and Meta/TikTok hierarchy/filtering, desktop/mobile downloads, restoration, all-page A4 dimensions and side-by-side columns passed. Generated artifacts: `tmp/demand-improvements.pdf`, `tmp/demand-improvements-mobile.pdf`, `tmp/breakdown-improvements.pdf`, `tmp/breakdown-improvements-mobile.pdf`.
- Scoped TypeScript check using an untracked temporary config excluding unrelated artifacts/outputs/worktrees passed. Normal `npm run typecheck` is blocked by pre-existing errors in `artifacts/m07/domain-smoke.ts` and `outputs/dscaff-google-ads-apr-aug-2026/fetch-performance-data.mts`.
- Normal `npm run lint` traversed generated worktree bundles and was stopped. Scoped ESLint is used for the changed source/tests.
- A 100-ad fixture initially exceeded the 120-second download limit, then completed with the long-fixture limit raised to 300 seconds. Every page was confirmed A4 landscape; this is completeness evidence, not a production performance guarantee.
- Admin preview fixture passed: injected raster failure restores capture styles/mode; Retry returns to preview; opening preview makes no automatic download; download uses the generated PDF; close removes the dialog; user-role sessions have no preview button. Preview was also opened on the user's existing Codex tab at localhost:3000.
- Side-by-side fixture height measured 3,316 → 2,533 px (about 24% shorter), versus the same compact layout forced back to one column. Empty-interest/null-metric/long-label exports passed.
- Final fixture run passed after compact card spacing and bounded-card pagination changes. PNG download passed and did not use PDF compact styling. Scoped TypeScript and ESLint both passed on the final source.

## Remaining acceptance

Production deployment and native provider reconciliation are not claimed. Production long-report timing and oversized individual-element readability remain separate acceptance gates. Standard-page exports can contain more than two pages; content is not truncated to reduce page count.
