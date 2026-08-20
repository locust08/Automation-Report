# Design QA

- Source visual truth: `C:\Users\User\AppData\Local\Temp\codex-clipboard-770b7fbb-5645-4b98-b8de-7fbcb2e84037.png`
- Implementation screenshot: `C:\Users\User\Desktop\AdsReportingDashboard\Automation-Report-master\artifacts\meta-import-navigation.jpg`
- Browser viewport: 1554 × 901 CSS pixels at 1× density
- Source pixels: 397 × 150
- Implementation pixels: 1554 × 901
- Normalization: focused comparison of the navigation row within each red header; the source crop's unrelated annotation marker and surrounding crop were excluded
- State: `/meta-import`, default account loaded, no CSV selected

## Comparison evidence

- Full view: the Meta import page retains its existing banner, upload workflow, cards, and responsive desktop layout.
- Focused region: the implementation has the same six-button sequence as the source—Home, Overall, Preview, Advanced Report, Media Plan, and Meta CSV Import—with matching compact square proportions, translucent fills, white icons, and tight spacing.
- Primary interactions tested: all six links were present in the rendered accessibility tree with the expected destinations; Meta CSV Import is marked as the current page.
- Console errors checked: no error-level browser messages were present.

## Required fidelity surfaces

- Fonts and typography: existing import-page title and supporting text remain unchanged; the buttons use icon-only labels with accessible titles.
- Spacing and layout rhythm: the navigation row sits below the subtitle with the same compact button sizing and spacing as the source header.
- Colors and visual tokens: translucent white button fills and the active-state highlight preserve contrast against the existing red header artwork.
- Image and icon quality: the existing Lucide icon set is reused, matching the application's established report-header navigation and remaining sharp at 20 px.
- Copy and content: no import-page copy changed; labels and destinations match the existing report navigation.

## Comparison history

- Initial comparison: no actionable P0, P1, or P2 mismatch was found.
- No visual fixes were required after the browser capture.

## Findings

- No actionable P0, P1, or P2 visual issues remain.
- TypeScript, ESLint, whitespace validation, link rendering, and browser console checks pass.

## Follow-up polish

- P3: the active import button is slightly brighter than the source buttons to communicate current-page state; this is an intentional usability improvement.

## TikTok Preview QA — 2026-08-19

- Source visual truth: `C:\Users\User\AppData\Local\Temp\codex-clipboard-536ad6be-e188-446b-94a4-41acc0deaf4d.png`
- Implementation screenshot: `C:\Users\User\Desktop\AdsReportingDashboard\Automation-Report-master\artifacts\tiktok-preview-merged-white.png`
- Browser-rendered evidence: in-app Browser capture of `/preview?platform=tiktok&startDate=2026-07-01&endDate=2026-07-31&tiktokAccountId=7512268241088299015`
- Viewport: 1790 × 1262 CSS pixels at 1× density; implementation desktop capture 1792 × 1280 pixels.
- State: Bellamy TikTok SG, campaign `LT | BOSG | Community`, ad group switched from `2026-08` to `2026-07`.

### Comparison evidence

- Full view: the title, counts, campaign structure, selected ad-group summary, and ads table form one white rounded workspace matching the Meta hierarchy. The former black header and separate selector cards are absent.
- Focused region: ten TikTok ad groups remain in a fixed-height scroll area. The ads panel stays fixed, and selecting `2026-07` updates the selected-group heading without shifting the surrounding layout.
- Typography, spacing, borders, radii, slate/blue tokens, icon quality, and TikTok-specific copy follow the existing Meta component.

### Comparison history

- P1: separate black TikTok header. Fixed by merging title/counts and hierarchy into one white workspace.
- P2: ten ad groups expanded the page beyond the reference. Fixed with a 260px scrollable hierarchy list.
- Post-fix: 10 ad groups and 22 ads loaded; selection changed to `2026-07` with no report error.

### Findings

- No actionable P0, P1, or P2 differences remain for the annotated hierarchy region.

final result: passed

## TikTok Creative/Copy Merge and Date-Matched Data QA — 2026-08-19

- Merged creative and primary copy into one white card: video left, copy right, vertical desktop divider, and horizontal mobile divider.
- Primary copy is left-aligned with a constrained readable line length.
- Loading uses the same merged skeleton structure, preventing premature unavailable states.
- A July report now defaults to the `2026-07` TikTok ad group unless the URL explicitly selects another ad group.
- Browser verification returned the July daily chart with RM614.86 spend, 102,220 impressions, 14,394 reach, RM6.02 CPM, and 103,424 video views.

final result: passed

## TikTok Meta-Style Loading and Text QA — 2026-08-19

- Route: `/preview?platform=tiktok&startDate=2026-07-01&endDate=2026-07-31&tiktokAccountId=7512268241088299015`.
- Primary text is horizontally centered within a readable `68ch` content width and vertically centered in its independent card.
- Switching/selecting a TikTok ad renders skeletons for metadata, primary text, creative, KPI controls, and chart instead of briefly displaying unavailable-value states.
- After the provider response completes, skeletons are removed and genuine unavailable values use the normal `—` or empty-state treatment.
- The hierarchy remains visible and stable throughout the detail refresh, matching the Meta preview interaction pattern.

final result: passed

## TikTok Selected-Ad Details QA — 2026-08-19

- Visual reference: TikTok Ads Manager selected-ad detail supplied by the user, with the existing Google Ads edit-page shadcn chart as the interaction reference.
- Browser-rendered evidence: `/preview?platform=tiktok&startDate=2026-07-01&endDate=2026-07-31&tiktokAccountId=7512268241088299015`.
- State: Bellamy TikTok SG, campaign `LT | BOSG | Community`, ad group `2026-07`, ad `01 | Thinking of switching to organic?`.

### Verified surfaces

- The campaign hierarchy remains in its existing white workspace and changing the ad group refreshes the selected-ad data without losing the campaign selection.
- Campaign, ad group, ad, status, ad ID, creative type, identity, source, duration, and primary text are separated into readable responsive sections.
- The creative keeps its natural vertical ratio and exposes the existing public TikTok-post action without adding editing controls.
- Spend, Impressions, Reach, destination Clicks, destination CTR, CPM, and Video views render as selectable metric cards. Impressions is selected by default; Spend and Impressions were verified visible together.
- The daily chart uses the project shadcn chart container, tooltip, axes, grid, and multi-line toggle behavior. Bellamy SG returned daily data for 9–31 July 2026.
- Provider-unavailable values remain `—`; an optional-metric failure falls back to core daily metrics instead of hiding the hierarchy or creative.

### Findings

- Initial P1: TikTok accepted aggregate ad reporting but rejected the daily filter encoding, leaving the chart empty. Fixed by using the v1.3 JSON-array filter value and a core-metric fallback.
- No actionable P0, P1, or P2 visual issues remain in the selected-ad region.

final result: passed
## TikTok selected-ad trend calendar and metrics — 2026-08-19

- Verified the TikTok preview at 1794px desktop width with Bellamy SG and the July 2026 range.
- Confirmed the shadcn two-month range calendar opens as an anchored popover without shifting report content.
- Confirmed Frequency and Clicks (all) render as independent metric cards; Clicks (all) includes CTR (all).
- Confirmed the existing destination-click metric remains separate and the primary copy is 20px semibold with 36px line height.
- Confirmed chart data, selected-ad creative, and existing hierarchy remain visible.

Final result: passed.
