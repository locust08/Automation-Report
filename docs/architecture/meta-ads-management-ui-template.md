# Meta Ads Management UI Template

## Purpose

This document is the reusable layout and interaction template for the Meta Ads Management page at `/manage/meta`. It records what belongs on the page, where each element is placed, how the layout responds to smaller screens, and which safety rules must remain intact.

Use this template when refining the Meta page or creating a visually consistent management page for another advertising platform. Platform capabilities and provider adapters must remain separate.

## Page hierarchy

```text
ReportShell
├── Branded page header
│   ├── Meta Ads Management title
│   ├── Home
│   ├── Navigation
│   └── Logout
├── Account search card
│   ├── Meta Ads account search label
│   ├── Search input
│   ├── Search results and recent accounts dropdown
│   ├── Helper text
│   └── Selected account name and ID
├── Account controls row
│   ├── Compact date-range picker — left
│   └── Refresh official data — right
└── Account workspace
    ├── Section navigation — left on desktop / dropdown on mobile
    └── Focused content panel — right on desktop / below on mobile
```

The centered page width is `max-w-3xl` before an account is selected and expands to `max-w-7xl` after an account is loaded.

## Desktop layout

After account selection, the main workspace uses a two-column grid:

| Area | Width and position | Contents |
|---|---|---|
| Left navigation | Fixed `220px`; sticky near the top | Overview, resource sections, recommendations, divider, and the Change requests dropdown |
| Main content | Remaining width, with `min-width: 0` | Exactly one selected management or Change Control surface |

The grid should use a compact gap between the navigation and content. Do not place Change Control summary cards above the selected view; Change requests is a focused navigation option.

## Account search card

The account search card is the first white card beneath the branded header.

1. Show a clear `Meta Ads account search` label.
2. Use one full-width search input with a search icon.
3. Accept a company name or Meta ad-account ID.
4. Display the results dropdown directly beneath the input.
5. Divide the dropdown into `Results` and `Recent` groups.
6. Make the entire account row clickable; do not show a separate `Open →` action.
7. After selection, show the account display name and normalized account ID below a horizontal divider.

Search and recent-account interactions may use browser-local caching. Cached account choices are convenience data, not Change Control or approval evidence.

## Account controls row

Place the account controls in their own compact white row below the account card.

| Left side | Right side |
|---|---|
| Compact date-range picker | `Refresh official data` outline button |

The date control uses a white background and compact height. Its popover should align to the left edge of the trigger, keep the two calendar months close together, and use the project shadcn Select component for quick ranges.

Refreshing or applying a new date range performs read-only data retrieval. While refreshing, disable the refresh button and animate its refresh icon.

## Navigation

### Primary sections

Show these items in this order:

1. Overview
2. Campaigns
3. Ad sets
4. Ads
5. Creatives
6. Audience & placements
7. Recommendations

Use Lucide icons, left-aligned labels, and a compact row height. The selected item uses a pale red background, red text, and a subtle red border/ring. Unselected items use slate text and a light neutral hover state.

### Change requests

Place a horizontal divider below Recommendations. Change requests is the only collapsible navigation group.

Its options are:

1. All requests
2. Campaign
3. Ad sets
4. Ads
5. Creative

The resource options may show the number of supported change fields. Add the message `Provider execution remains locked.` below the group.

Selecting a resource option shows only that resource type and its supported fields. Selecting `All requests` shows the account-scoped M03 request workspace.

## Main content surfaces

### Overview

Place the metric cards first, followed by the Campaign performance table.

The metric grid uses up to four columns on large screens and collapses progressively on smaller screens. Typical metrics include results, cost per result, clicks, CTR, CPM, impressions, and ad spend.

The Campaign performance table contains:

| Column | Content |
|---|---|
| Campaign | Campaign name |
| Impressions | Formatted count |
| Clicks | Formatted count |
| CTR | Percentage |
| Results | Formatted count |
| Spend | Currency value |

If the selected period has no qualifying activity, keep the standard metric and table structure visible with zero or empty values. Do not replace the normal overview with a large warning panel merely because the date range has no spend.

### Campaigns, ad sets, and ads

Each section uses one white resource card:

1. Section title and synchronized record count.
2. Resource rows separated by subtle dividers.
3. Resource name, provider ID, status, and parent context.
4. Spend, clicks, and results columns.
5. `Request change` outline button on the right.

Selecting `Request change` opens the Meta Change Control editor with official account, campaign, entity, field, and baseline values prefilled. It must not call a Meta mutation endpoint.

### Creatives

Creative rows use the same resource-card pattern, with a thumbnail on the left when Meta returns one. Show creative title/copy and campaign/ad-set context in the middle, with `Request change` on the right.

Do not invent or fabricate a creative image when no provider thumbnail exists; use the standard image icon empty state.

### Audience & placements

Use a responsive two-column card grid for age, gender, region, and placement/device distributions. Each row contains a label on the left and the returned count on the right.

### Recommendations

Recommendations are dashboard-derived, evidence-based suggestions, not provider-issued instructions.

The surface contains:

1. Meta Ads label, title, and explanation.
2. Compact category filters.
3. Recommendation cards with category, title, rationale, performance evidence, and `Request change`.

The action opens Change Control; it never applies the recommendation directly to Meta.

### Change requests

Change requests use the shared M03 components rather than a Meta-specific workflow implementation.

The account-scoped workspace supports:

- Request list and filters.
- Draft creation and editing.
- Multi-field change items.
- Validation and exact-revision approval.
- Baseline conflicts and provider-plan preview.
- Cancellation.
- Operation, attempt, readback, and audit evidence.

When Campaign, Ad sets, Ads, or Creative is selected under Change requests, first show the supported fields and a paginated resource list. Opening a resource replaces that list with the focused request editor.

## Pagination standard

Apply pagination to every Meta resource list and table, including the account-scoped Change requests list.

| Rule | Value |
|---|---|
| Default rows per page | 10 |
| Selectable sizes | 10, 25, 50 |
| Position | Footer beneath the rows |
| Left footer content | Visible range and total, for example `1–10 of 16` |
| Right footer content | Page-size Select, Previous, page count, Next |
| Reset behavior | Return to page 1 when the page size or active filter changes |

Use client-side pagination for already synchronized Meta resource arrays. Use server-side pagination for M03 Change requests.

## Loading, empty, and error states

### Initial state

Before an account is selected, show one centered dashed card with a search icon, `Find a Meta Ads account`, and short guidance. Do not render the management navigation or empty data tables.

### Loading state

Keep the selected navigation visible. Replace the active content with skeletons shaped like the final metric cards, table rows, or resource rows. Avoid a single large spinner panel.

### Empty state

Keep the normal section structure. Use concise inline empty copy inside the relevant card. An empty response should not imply that the Meta connection failed.

### Error state

Show a compact red error panel below the controls row. Render safe normalized error text only; never expose credentials or raw sensitive provider responses.

## Responsive behavior

At widths below the desktop breakpoint:

- Replace the left navigation rail with one full-width shadcn Select.
- Group primary management sections and Change request options within that Select.
- Stack the date picker and refresh button when they no longer fit comfortably.
- Let metric cards collapse from four columns to two and then one.
- Keep wide tables horizontally scrollable.
- Stack resource row metrics and actions without clipping labels or buttons.

The mobile section selector must preserve the same selected state and behavior as the desktop navigation.

## Visual language

- Page background: light neutral gray from `ReportShell`.
- Surface background: white.
- Borders: subtle neutral borders.
- Radius: `rounded-xl` for compact controls and navigation; `rounded-2xl` for the account card.
- Shadows: light `shadow-sm`; reserve stronger shadow for the account-results dropdown.
- Accent: project red for active navigation, primary Change Control actions, and important state emphasis.
- Body text: slate/neutral tones with muted text for IDs and descriptions.
- Icons: Lucide React; do not use emoji or handcrafted icons.
- Spacing: compact and consistent; avoid oversized empty margins inside controls, calendars, tables, and navigation.

## Data and safety boundaries

1. Meta management reads may call official Meta GET endpoints through authenticated server routes.
2. `META_ACCESS_TOKEN`, `META_APP_SECRET`, Supabase service-role credentials, and raw provider evidence remain server-only.
3. The browser must never receive provider credentials.
4. `Request change` writes only to shared M03 workflow storage.
5. No Meta-specific Change Control tables are created.
6. Publish, Retry, Verify, Resolve conflict, and Execute rollback remain disabled while `provider_execution_locked` is true.
7. A successful provider response would not count as verification without official readback.
8. No Meta POST mutation is authorized by this page template.

## Implementation map

| Responsibility | Current implementation |
|---|---|
| Page composition and Meta views | `components/ads-management/meta-management-page-client.tsx` |
| Shared page shell | `components/reporting/report-shell.tsx` |
| Compact date picker | `components/reporting/report-header-month-picker.tsx` |
| Loading primitives | `components/ads-management/management-loading.tsx` and local Meta skeletons |
| Navigation state | `lib/ads-management/meta-management-navigation.ts` |
| Pagination model | `lib/ads-management/pagination.ts` |
| Meta supported field registry | `lib/change-control/meta-capability-registry.ts` |
| Meta request prefill | `lib/change-control/meta-management-builder.ts` |
| Shared M03 workspace | `components/change-control/m03-request-workspace.tsx` |
| M03 controller | `components/change-control/m03-workspace-controller.tsx` |

## Acceptance checklist

- [ ] Account search is Meta-only and the full account row is clickable.
- [ ] Selected account name and ID appear in the account card.
- [ ] Date picker is on the left and Refresh official data is on the right of a separate controls row.
- [ ] Desktop navigation is a sticky left rail.
- [ ] Mobile navigation is one shadcn Select.
- [ ] Change requests is the only collapsible desktop navigation group.
- [ ] Only one focused content surface is visible at a time.
- [ ] Overview, resources, and Change requests paginate at 10 rows by default.
- [ ] Operators can select 10, 25, or 50 rows.
- [ ] Loading uses content-shaped skeletons.
- [ ] Empty periods keep the normal cards and tables visible.
- [ ] Request change opens a deterministic M03 editor with official baselines.
- [ ] Browser errors and payloads contain no provider credentials.
- [ ] Provider-execution actions remain visibly locked and issue no Meta mutation.
