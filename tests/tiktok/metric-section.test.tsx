import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MetricSection } from "../../components/reporting/metric-grid";
import type { SummaryMetric } from "../../lib/reporting/types";

test("renders TikTok branding without a missing image and uses an auto-fitting desktop grid", () => {
  const metrics: SummaryMetric[] = Array.from({ length: 8 }, (_, index) => ({
    key: index === 7 ? "spend" : `metric-${index}`,
    label: `Metric ${index + 1}`,
    value: index === 7 ? 100 : index,
    previousValue: index,
    delta: 0,
    format: "number",
  }));

  const html = renderToStaticMarkup(
    <MetricSection
      section={{ platform: "tiktok", title: "TikTok Ads", logoPath: "/TikTokLogo.png", metrics }}
    />,
  );

  assert.match(html, /TikTok Ads/);
  assert.doesNotMatch(html, /TikTokLogo\.png/);
  assert.match(html, /repeat\(auto-fit,minmax\(8rem,1fr\)\)/);
});

test("renders each ads platform as a distinct accessible color badge", () => {
  const metric: SummaryMetric = {
    key: "spend",
    label: "Ads Spent",
    value: 100,
    previousValue: 90,
    delta: 11.1,
    format: "currency",
  };

  const metaHtml = renderToStaticMarkup(
    <MetricSection
      section={{ platform: "meta", title: "Meta Ads", logoPath: "/MetaLogo.png", metrics: [metric] }}
    />,
  );
  const googleHtml = renderToStaticMarkup(
    <MetricSection
      section={{ platform: "google", title: "Google Ads", logoPath: "/GoogleLogo.png", metrics: [metric] }}
    />,
  );

  assert.match(metaHtml, /aria-label="Meta Ads"/);
  assert.match(metaHtml, /bg-\[#0866FF\]/);
  assert.doesNotMatch(metaHtml, /MetaLogo\.png/);
  assert.match(googleHtml, /aria-label="Google Ads"/);
  assert.match(googleHtml, /bg-\[#34A853\]/);
  assert.doesNotMatch(googleHtml, /GoogleLogo\.png/);
});
