# TikTok Selected Ad Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TikTok-only selected-ad detail panel with expanded metadata, reliable metrics, a daily trend chart, primary text, and creative preview.

**Architecture:** Extend the existing TikTok preview hierarchy response with an optional selected-ad detail contract. A focused normalizer owns nullable metric derivation and daily aggregation; the existing TikTok adapter fetches the selected ad’s daily report and metadata; a dedicated client component renders the screenshot-inspired detail experience without changing Meta or Google.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TikTok API for Business v1.3, Recharts 3, Tailwind CSS 4, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-19-tiktok-selected-ad-details-design.md`

## Global Constraints

- TikTok access remains read-only.
- Missing metrics render as `—`, never fabricated zeroes.
- Do not sum unique reach across independently split windows.
- A selected-ad detail failure must not hide the hierarchy or creative preview.
- Do not expose tokens or raw provider errors in browser payloads.
- Meta and Google preview behavior remains unchanged.

---

### Task 1: Selected-ad detail types and metric normalization

**Files:**
- Create: `lib/reporting/tiktok-selected-ad.ts`
- Modify: `lib/reporting/types.ts:370-490`
- Create: `tests/tiktok/tiktok-selected-ad-details.test.ts`

**Interfaces:**
- Produces: `TikTokSelectedAdDetail`, `TikTokSelectedAdMetrics`, `TikTokSelectedAdDailyPoint`.
- Produces: `normalizeTikTokSelectedAdReport(rows, metadata): TikTokSelectedAdDetail`.

- [ ] **Step 1: Write the failing normalization test**

```ts
test("normalizes nullable TikTok ad metrics and daily points", () => {
  const detail = normalizeTikTokSelectedAdReport([
    {
      dimensions: { stat_time_day: "2026-08-12 00:00:00", ad_id: "ad-1" },
      metrics: {
        spend: "10",
        impressions: "1000",
        reach: "800",
        clicks: "20",
        destination_clicks: "10",
        video_play_actions: "700",
      },
    },
  ], {
    adId: "ad-1",
    adName: "03 | A little of nature",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });

  assert.equal(detail.metrics.frequency, 1.25);
  assert.equal(detail.metrics.destinationCtr, 1);
  assert.equal(detail.metrics.allClickCtr, 2);
  assert.equal(detail.daily[0]?.videoViews, 700);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test tests/tiktok/tiktok-selected-ad-details.test.ts`

Expected: FAIL because `tiktok-selected-ad.ts` does not exist.

- [ ] **Step 3: Add the typed contracts**

```ts
export interface TikTokSelectedAdMetrics {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  destinationClicks: number | null;
  allClicks: number | null;
  destinationCtr: number | null;
  allClickCtr: number | null;
  destinationCpc: number | null;
  cpm: number | null;
  videoViews: number | null;
}

export interface TikTokSelectedAdDailyPoint extends TikTokSelectedAdMetrics {
  date: string;
}

export interface TikTokSelectedAdDetail {
  adId: string;
  adName: string;
  identityName: string | null;
  identityType: string | null;
  source: string | null;
  durationSeconds: number | null;
  currency: string;
  timezone: string;
  metrics: TikTokSelectedAdMetrics;
  daily: TikTokSelectedAdDailyPoint[];
  warnings: string[];
  providerRequestIds: string[];
}
```

Add `tiktokDetail?: TikTokSelectedAdDetail | null` to `PreviewAdNode`.

- [ ] **Step 4: Implement nullable derivation and daily aggregation**

Implement helpers that parse finite provider values, aggregate additive fields by date, derive rates only with valid denominators, and leave absent provider fields as `null`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --import tsx --test tests/tiktok/tiktok-selected-ad-details.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/reporting/types.ts lib/reporting/tiktok-selected-ad.ts tests/tiktok/tiktok-selected-ad-details.test.ts
git commit -m "feat: normalize TikTok selected ad details"
```

### Task 2: Selected-ad TikTok reporting adapter

**Files:**
- Modify: `lib/reporting/tiktok.ts:116-370`
- Modify: `tests/tiktok/reporting-adapter.test.ts`
- Modify: `tests/tiktok/tiktok-preview-hierarchy.test.tsx`

**Interfaces:**
- Consumes: `normalizeTikTokSelectedAdReport`.
- Produces: selected `PreviewAdNode.tiktokDetail` populated from TikTok v1.3.

- [ ] **Step 1: Write a failing adapter test**

Add a mocked client test asserting the selected-ad request includes:

```ts
assert.deepEqual(call.dimensions, ["ad_id", "stat_time_day"]);
assert.deepEqual(call.metrics, [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "destination_clicks",
  "video_play_actions",
]);
```

Assert only the selected ad receives `tiktokDetail` and provider request IDs are preserved.

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `node --import tsx --test tests/tiktok/reporting-adapter.test.ts`

Expected: FAIL because the selected-ad daily request is absent.

- [ ] **Step 3: Add the selected-ad daily request**

Extend `fetchTikTokReportLevel` with optional dimensions and metrics while preserving its current defaults. Request selected-ad daily rows only when `selectedAdId` is present.

- [ ] **Step 4: Hydrate selected-ad metadata**

Map TikTok ad object fields into identity name/type, source, duration, primary text, and creative type. Catch detail-only failures and attach a short warning while retaining hierarchy and creative data.

- [ ] **Step 5: Run adapter and hierarchy tests**

Run:

```bash
node --import tsx --test tests/tiktok/reporting-adapter.test.ts
node --import tsx --test tests/tiktok/tiktok-preview-hierarchy.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/reporting/tiktok.ts tests/tiktok/reporting-adapter.test.ts tests/tiktok/tiktok-preview-hierarchy.test.tsx
git commit -m "feat: fetch TikTok selected ad reporting"
```

### Task 3: Expanded selected-ad UI

**Files:**
- Create: `components/reporting/tiktok-selected-ad-details.tsx`
- Modify: `components/reporting/preview-hierarchy.tsx:126-255`
- Create: `tests/tiktok/tiktok-selected-ad-details-panel.test.tsx`

**Interfaces:**
- Consumes: `TikTokSelectedAdDetail`, selected campaign/ad-group/ad names, status, primary text, and creative.
- Produces: `TikTokSelectedAdDetailsPanel`.

- [ ] **Step 1: Write the failing component test**

```tsx
const html = renderToStaticMarkup(
  <TikTokSelectedAdDetailsPanel
    campaignName="LT | BOSG | Community"
    adGroupName="2026-08"
    ad={adFixture}
    detail={detailFixture}
  />,
);

assert.match(html, /Campaign/);
assert.match(html, /Ad group/);
assert.match(html, /03 \| A little of nature/);
assert.match(html, /Impressions/);
assert.match(html, /Video views/);
assert.match(html, /Primary text/);
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `node --import tsx --test tests/tiktok/tiktok-selected-ad-details-panel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the summary and metric layout**

Create a full-width summary strip with campaign, ad group, ad, status, creative type, identity, source, and duration. Render metric cards with a `formatNullableMetric` helper and `—` for null.

- [ ] **Step 4: Implement primary text and creative layout**

Render primary text in a separate readable article. Keep the creative preview in its own naturally sized card and preserve the existing external TikTok post link.

- [ ] **Step 5: Replace the compact TikTok setup block**

In `TikTokAdsPreviewWorkspace`, retain the unified hierarchy card, then render `TikTokSelectedAdDetailsPanel`. Do not change Meta or Google branches.

- [ ] **Step 6: Run component and hierarchy tests**

Run:

```bash
node --import tsx --test tests/tiktok/tiktok-selected-ad-details-panel.test.tsx
node --import tsx --test tests/tiktok/tiktok-preview-hierarchy.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/reporting/tiktok-selected-ad-details.tsx components/reporting/preview-hierarchy.tsx tests/tiktok/tiktok-selected-ad-details-panel.test.tsx
git commit -m "feat: expand TikTok selected ad preview"
```

### Task 4: Daily trend chart and block-local states

**Files:**
- Modify: `components/reporting/tiktok-selected-ad-details.tsx`
- Modify: `tests/tiktok/tiktok-selected-ad-details-panel.test.tsx`

**Interfaces:**
- Consumes: `TikTokSelectedAdDailyPoint[]`.
- Produces: interactive Spend, Impressions, Reach, Clicks, CTR, CPM, and Video views chart selector.

- [ ] **Step 1: Add failing tests for trend and empty states**

Assert the rendered markup contains the metric selector labels and that an empty daily array renders `No daily TikTok delivery data is available for this ad.`

- [ ] **Step 2: Run the component test and verify RED**

Run: `node --import tsx --test tests/tiktok/tiktok-selected-ad-details-panel.test.tsx`

Expected: FAIL because the trend controls and empty state are absent.

- [ ] **Step 3: Implement the client-side trend selector**

Use Recharts `LineChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, and `Line`. Keep the chart inside a fixed minimum-height card and derive the plotted value from the selected metric key.

- [ ] **Step 4: Implement partial-data warnings**

Display short sanitized warnings above the affected block. Preserve the summary, primary text, and creative preview when daily reporting is unavailable.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --import tsx --test tests/tiktok/tiktok-selected-ad-details-panel.test.tsx`

Expected: PASS.

```bash
git add components/reporting/tiktok-selected-ad-details.tsx tests/tiktok/tiktok-selected-ad-details-panel.test.tsx
git commit -m "feat: chart TikTok selected ad trends"
```

### Task 5: Regression and browser verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: completed selected-ad data and UI.
- Produces: verified TikTok preview with documented evidence.

- [ ] **Step 1: Run automated verification**

```bash
npm run test:tiktok
npx eslint components/reporting/preview-hierarchy.tsx components/reporting/tiktok-selected-ad-details.tsx lib/reporting/tiktok.ts lib/reporting/tiktok-selected-ad.ts tests/tiktok/tiktok-selected-ad-details.test.ts tests/tiktok/tiktok-selected-ad-details-panel.test.tsx
npm run typecheck
npm run build
```

Expected: TikTok tests and focused ESLint pass. Any unchanged pre-existing typecheck/build failures are reported separately.

- [ ] **Step 2: Browser-test Bellamy TikTok SG**

Open the existing SG preview route. Select `2026-07`, then select each ad. Verify the summary, metrics, primary text, creative, and chart update while the hierarchy selection remains stable.

- [ ] **Step 3: Verify partial and responsive states**

Test a missing-media ad, an empty daily response fixture, desktop layout, narrow responsive stacking, screenshot mode, and the absence of raw provider errors.

- [ ] **Step 4: Re-run Meta and Google preview smoke checks**

Load one Meta and one Google preview account and confirm their existing layouts and selections remain unchanged.

- [ ] **Step 5: Update design QA and commit**

Append the source screenshot, browser-rendered implementation evidence, interaction checks, fixes, and final result to `design-qa.md`.

```bash
git add design-qa.md
git commit -m "test: verify TikTok selected ad details"
```
