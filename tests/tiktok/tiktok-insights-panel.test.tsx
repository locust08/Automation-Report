import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TikTokInsightsPanel } from "../../components/reporting/tiktok-insights-panel";

test("renders TikTok Top Ads and Device OS without the legacy audience breakdown", () => {
  const html = renderToStaticMarkup(<TikTokInsightsPanel payload={{
    account: {
      advertiserId: "123",
      advertiserName: "Bellamy MY",
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
      apiVersion: "v1.3",
      requestProvenance: "tiktok_api_v1.3",
    },
    totals: { spend: 10, impressions: 100, clicks: 2, reach: 80 },
    topAds: [
      { adId: "1", adName: "Winning video", thumbnailUrl: null, impressions: 100, spend: 10, reach: 80 },
    ],
    deviceOs: [{ key: "android", label: "Android", impressions: 75, share: 75 }],
    warnings: [],
    providerRequestIds: ["request-1"],
  }} />);

  assert.match(html, /Top Ads/);
  assert.match(html, /Winning video/);
  assert.match(html, /Media unavailable/);
  assert.match(html, /Device OS/);
  assert.match(html, /Android/);
  assert.doesNotMatch(html, /Audience Click Breakdown/);
});
