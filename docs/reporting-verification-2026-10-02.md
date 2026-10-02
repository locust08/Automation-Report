# Reporting verification — 2026-10-02

## Dashboard mapping

Created `map/README.md`, reporting ownership, presentation contract and acceptance ledger, linked from AGENTS.md. Local Markdown targets resolve. Mapping records the actual seven-day Demand Gen memory cache; the earlier 15-minute implementation receipt is historical.

## Overall audience export

Reproduced overlapping Age/Gender/Location Breakdown headings in the real PNG capture shared by Overall PDF. Browser headings fit, but the serialized SVG wraps their text inside fixed intrinsic widths after export font embedding. Text extends below the heading box and overlaps the caption. For Age Breakdown the exported text bottom was 838.5px while the caption began at 799.98px.

The heading/caption group now fills available card-header space (`min-w-0 flex-1`), avoiding intrinsic text-width constraints during export. No font scale or provider/payload change.

`scripts/report-audience-export-browser-test.mjs` observes the real SVG sent to the rasterizer, renders it with embedded fonts, and checks text bounds against captions. It failed on the original Age Breakdown and passed after the fix for all three headings with empty and populated audience data. PNG and PDF downloads both complete. Populated raster output was inspected visually.

Artifacts (private, untracked): `tmp/audience-export-empty.png`, `tmp/audience-export-populated.png`, and matching `.pdf` files. The existing report-page-improvements browser check also passed, including global font widths, mobile controls, standalone PDFs and Overall download. Scoped TypeScript and ESLint passed.

## Native Google Demand Gen comparison

Read-only dashboard service collection via existing Doppler configuration, account `5849785984` (Magnet Security & Automation), campaign `22906147660` (MAG | DGEN | Barrier Gate (Spring-free)), inclusive **2026-09-01–2026-09-30**, MYR, Asia/Kuala_Lumpur. Manager resolution retained `4114685827`; no grants or provider resources changed.

Returned six In-market rows, one measured Affinity row, twelve observed format/device cells, four UNKNOWN-format device rows, and complete bounded collection. Eight non-interest criteria remain excluded. Native Google Ads UI used the same campaign and September period.

| Format | Impressions (API/native) | Clicks (API/native) | Spend (API, rounded/native) | Conversions (API, rounded/native) |
| --- | --- | --- | --- | --- |
| In-feed | 152,416 / 152,416 | 11,746 / 11,746 | 1,144.12 / 1,144.12 | 702.13 / 702.13 |
| In-stream / native Skippable in-stream | 128,335 / 128,335 | 9,224 / 9,224 | 839.78 / 839.78 | 546.25 / 546.25 |
| Shorts | 3,055 / 3,055 | 52 / 52 | 8.28 / 8.28 | 4.24 / 4.24 |

Native Home Automation Enthusiasts is explicitly an **Affinity segment**, split across Youtube Ads and Image Ads: impressions 1,238 + 307 = **1,545**; clicks 86 + 37 = **123**; displayed spend 8.05 + 2.61 = **10.66**; conversions 4.00 + 1.00 = **5.00**. These match the normalized API row (unrounded spend 10.661808; conversions 4.999944).

All six In-market rows also match native combined Youtube Ads/Image Ads impressions and clicks: Architectural Services 595/58, General Contracting & Remodeling Services 19,861/1,606, Business Technology 403/40, Business Services 127,683/9,713, Physical Security & Access Control 54/5, Construction Jobs 631/58. Native displayed child spend rounds before aggregation; do not expect the sum of rounded children to always equal the rounded full-precision aggregate.

UNKNOWN API format rows total 5,755 impressions, 217 clicks and MYR15.42, matching native Image totals numerically. This does **not** authorize relabeling UNKNOWN as Image.

Limitations: aggregate API matrix plus UNKNOWN yields 289,561 impressions while native campaign total is 289,568, a **seven-impression discrepancy**. Native segmented format rows also sum to 289,561. Clicks reconcile to 21,239 and spend to MYR2,007.59. Do not claim exact campaign-impression reconciliation. Individual device intersections were not independently compared in the native UI. This is dashboard service/native evidence; a fresh connected MCP Demand Gen prompt was not run.

Private evidence: `tmp/native-demand-2026-10-02.json` and `tmp/native-demand-affinity-2026-10-02.png`.

## Connected Meta checks

Inspected the existing connected DigitalBee report for Bellamy SG, account `131078749940938`. The open conversation contains later successful discovery of ten authorized Meta accounts after an earlier Mapping review required result. This improves historical evidence; it is not a new directory test.

Changed report dates from Aug 31–Sep 29 to **Sep 1–30** and used Regenerate report. The report context changed to the selected dates and returned the active `2026-04 | LT- Awareness campaign` with **MYR2,722.63** spend. Native Ads Manager for the same account and September period shows the identical campaign and spend, with 7-day click/1-day view attribution displayed. Native inventory has **40 campaigns**.

Connected collection progressed from ten to thirty campaigns, with zero descendant details, partial retained results and ongoing loading. The final status added Some details need a retry. The header continued to say complete while descendants were loading. Earlier continuation failure displayed Next batch unavailable and a disabled retry while collection remained running. Full-account completion, failure/denial recovery and truthful completeness remain acceptance limitations until individually verified. Do not mark META-3 passed from date regeneration alone.

Private screenshots: `tmp/native-meta-september-2026-10-02.png` and `tmp/connected-meta-september-2026-10-02.png`. No advertising writes, credential changes, emails or migrations were performed.

## Check limits

Full repository TypeScript checking remains blocked by pre-existing errors in artifacts/m07/domain-smoke.ts and outputs/dscaff-google-ads-apr-aug-2026/fetch-performance-data.mts. Full repository ESLint traversed generated .worktrees/.next bundles and was stopped; it did not finish. Scoped checks for the changed report component and regression script passed. The export fix is committed for review; production deployment has not been verified.
