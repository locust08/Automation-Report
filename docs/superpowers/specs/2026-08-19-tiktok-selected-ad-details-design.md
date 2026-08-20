# TikTok Selected Ad Details Design

## Goal

Replace the compact TikTok setup card with a complete, read-only selected-ad detail experience. The view follows the supplied TikTok Ads Manager reference while preserving the reporting dashboard’s existing visual language, screenshot/PDF behavior, and privacy constraints.

## Scope

This change applies only to TikTok Campaign Preview. Meta and Google preview behavior remains unchanged.

The selected-ad area contains:

1. A full-width identity summary with campaign, ad group, ad name, status, creative type, source, and TikTok identity when available.
2. A responsive content row with ad-level metric cards on the left and the existing creative preview on the right.
3. A daily trend panel below with one selectable metric at a time.

## Data Contract

Extend the TikTok preview payload rather than introducing a second page-level fetch. Each selected TikTok ad may include a typed detail payload:

- identity: display name, identity type, source, item ID, and duration when returned by TikTok.
- metrics: spend, impressions, reach, frequency, destination clicks, all clicks, destination CTR, all-click CTR, destination CPC, CPM, and video views.
- daily: date plus nullable values for the supported metrics.
- currency, timezone, provider request IDs, warnings, and request provenance.

Unavailable provider values remain null and render as —. A successful empty report renders an explicit empty state rather than fabricated zeroes.

## TikTok Reporting

Use the existing validated, read-only TikTok v1.3 client and selected advertiser. Fetch selected-ad reporting with ad_id and stat_time_day dimensions for the chosen date range.

- Split additive synchronous requests into inclusive windows of at most 30 days.
- Aggregate spend, impressions, clicks, destination clicks, and video views by date.
- Use provider-reported reach where valid. Do not sum unique reach across independently split windows.
- Derive CTR, CPC, CPM, and frequency only when their denominators are available.
- Preserve bounded cooldown behavior and never automatically retry an ambiguous POST.
- A failure in the detail request must not remove the hierarchy or creative preview.

## UI Behavior

The existing white TikTok hierarchy workspace remains the selection surface.

Below it:

- A full-width summary strip displays Campaign, Ad group, Ad, Status, Creative type, Identity, Source, and Duration.
- Metrics use larger vertically spaced cards and may wrap into two columns on medium widths.
- The creative preview keeps its natural media ratio and is not forced to match the height of long primary text.
- Long primary text gets its own readable section below the summary rather than a narrow value box.
- The trend chart supports Spend, Impressions, Reach, Clicks, CTR, CPM, and Video views when available.
- Changing the selected ad refreshes only the selected-ad detail state and preserves campaign/ad-group selections.
- Loading, partial-data, reconnect-required, and empty states remain block-local.

## Interfaces

- Extend PreviewAdNode with an optional TikTok-only selected-ad detail contract.
- Extend the existing TikTok preview hierarchy fetch to hydrate details only for the selected ad.
- Keep route handlers thin; TikTok fetch and normalization remain in lib/reporting/tiktok.ts.
- Render the new section inside TikTokAdsPreviewWorkspace using focused components for summary, metrics, trend, text, and creative media.

## Testing

- Unit-test nullable metric derivation, frequency, destination/all-click separation, video views, and daily normalization.
- Contract-test selected-ad daily reporting, empty rows, missing fields, 429 cooldowns, authorization failures, and partial provider failures.
- Component-test the expanded summary, primary-text layout, metric cards, trend selector, empty state, and TikTok-only conditional rendering.
- Browser-test Bellamy TikTok SG selection changes, ad switching, chart updates, responsive stacking, screenshot mode, and no Meta/Google regression.
- Run the TikTok suite, focused ESLint, typecheck, and build; report unchanged pre-existing failures separately.

## Safety

The implementation remains read-only. It does not change TikTok, Doppler, Notion, Vercel, Cloudflare, databases, deployments, or advertising objects. Tokens and provider errors are never rendered into browser payloads.
