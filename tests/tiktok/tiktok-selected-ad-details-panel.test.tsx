import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TikTokSelectedAdDetailsPanel } from "../../components/reporting/tiktok-selected-ad-details";
import type { PreviewAdNode, TikTokSelectedAdDetail } from "../../lib/reporting/types";

const ad: PreviewAdNode = {
  id: "ad-1",
  name: "03 | A little of nature",
  status: "ENABLE",
  details: [
    { label: "Creative type", value: "SINGLE_VIDEO" },
    { label: "Primary text", value: "A thoughtful story about nature." },
  ],
  creative: { id: "creative-1", thumbnailUrl: "https://example.com/creative.jpg" },
  previewLinks: [{ label: "TikTok post", url: "https://www.tiktok.com/@bellamy/video/1" }],
};

const detail: TikTokSelectedAdDetail = {
  adId: "ad-1",
  adName: ad.name,
  identityName: "Bellamy's Organic Singapore",
  identityType: "Spark Ad",
  source: "TikTok account (Spark Ad)",
  durationSeconds: null,
  currency: "MYR",
  timezone: "Asia/Kuala_Lumpur",
  metrics: {
    spend: 341.03,
    impressions: 123963,
    reach: 101240,
    frequency: 1.22,
    destinationClicks: 0,
    allClicks: 189,
    destinationCtr: 0,
    allClickCtr: 0.15,
    destinationCpc: null,
    cpm: 2.75,
    videoViews: 120528,
  },
  daily: [{
    date: "2026-08-12",
    spend: 10,
    impressions: 10000,
    reach: 9000,
    frequency: 1.11,
    destinationClicks: 0,
    allClicks: 10,
    destinationCtr: 0,
    allClickCtr: 0.1,
    destinationCpc: null,
    cpm: 1,
    videoViews: 9500,
  }],
  warnings: [],
  providerRequestIds: ["request-1"],
};

test("renders expanded TikTok selected-ad metadata, metrics, primary text, and chart controls", () => {
  const html = renderToStaticMarkup(
    <TikTokSelectedAdDetailsPanel
      campaignName="LT | BOSG | Community"
      adGroupName="2026-08"
      ad={ad}
      detail={detail}
      startDate="2026-08-12"
      endDate="2026-08-19"
      onDateRangeChange={() => undefined}
    />,
  );

  assert.match(html, /Campaign/);
  assert.match(html, /Ad group/);
  assert.match(html, /03 \| A little of nature/);
  assert.match(html, /Impressions/);
  assert.match(html, /Frequency/);
  assert.match(html, /Clicks \(all\)/);
  assert.match(html, /CTR \(all\).*0\.15%/);
  assert.match(html, /Video views/);
  assert.match(html, /Primary text/);
  assert.match(html, /A thoughtful story about nature/);
  assert.match(html, /Daily performance trend/);
  assert.match(html, /Visible on chart/);
  assert.match(html, /data-tiktok-trend-date-filter="true"/);
  assert.match(html, /Open date range picker/);
  assert.match(html, /data-tiktok-primary-text="true"[^>]*>[\s\S]*text-xl font-semibold leading-9/);
});

test("renders a clear empty daily state without hiding selected-ad details", () => {
  const html = renderToStaticMarkup(
    <TikTokSelectedAdDetailsPanel campaignName="Campaign" adGroupName="Group" ad={ad} detail={{ ...detail, daily: [] }} />,
  );
  assert.match(html, /No daily TikTok delivery data is available for this ad/);
  assert.match(html, /Creative preview/);
});

test("merges creative and left-aligned primary text with a divider and renders skeletons while loading", () => {
  const html = renderToStaticMarkup(
    <TikTokSelectedAdDetailsPanel
      campaignName="Campaign"
      adGroupName="Group"
      ad={ad}
      detail={null}
      loading
    />,
  );

  assert.match(html, /data-tiktok-creative-copy="true"/);
  assert.match(html, /data-tiktok-primary-text="true"[^>]*class="[^"]*text-left/);
  assert.match(html, /data-tiktok-creative-divider="true"/);
  assert.match(html, /data-tiktok-selected-ad-skeleton="true"/);
  assert.doesNotMatch(html, /No daily TikTok delivery data is available/);
  assert.doesNotMatch(html, /Creative media is unavailable/);
});
