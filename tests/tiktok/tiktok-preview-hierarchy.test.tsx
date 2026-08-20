import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PreviewHierarchy } from "../../components/reporting/preview-hierarchy";
import type { PreviewPlatformSection } from "../../lib/reporting/types";

test("renders a TikTok preview without Google branding or editing controls", () => {
  const section: PreviewPlatformSection = {
    platform: "tiktok",
    title: "TikTok Ads Preview",
    logoPath: "/TikTokLogo.png",
    accountId: "7512267932496560146",
    accountName: "Bellamy MY",
    fetchedAt: "2026-08-19T00:00:00.000Z",
    childLabel: "Ad Group",
    campaigns: [{
      id: "campaign-1",
      name: "LT | BOMY | Community",
      status: "ENABLE",
      details: [],
      children: [],
      performance: null,
    }],
  };

  const html = renderToStaticMarkup(
    <PreviewHierarchy section={section} initialCampaignId="campaign-1" />,
  );

  assert.match(html, /TikTok Ads Preview/);
  assert.doesNotMatch(html, /Google Ads Preview|live search preview|>Edit</);
});

test("renders TikTok hierarchy using the Meta-style campaign structure workspace", () => {
  const section: PreviewPlatformSection = {
    platform: "tiktok",
    title: "TikTok Ads Preview",
    logoPath: "/TikTokLogo.png",
    accountId: "7512267932496560146",
    accountName: "Bellamy MY",
    fetchedAt: "2026-08-19T00:00:00.000Z",
    childLabel: "Ad Group",
    campaigns: [{
      id: "campaign-1",
      name: "LT | BOMY | Community",
      status: "ENABLE",
      details: [],
      performance: null,
      children: [{
        id: "ad-group-1",
        name: "Community ad group",
        status: "ENABLE",
        details: [],
        performance: null,
        ads: [{
          id: "ad-1",
          name: "Community ad",
          status: "ENABLE",
          details: [],
          creative: null,
          previewLinks: [],
          performance: null,
        }],
      }],
    }],
  };

  const html = renderToStaticMarkup(
    <PreviewHierarchy
      section={section}
      initialCampaignId="campaign-1"
      initialChildId="ad-group-1"
      initialAdId="ad-1"
    />,
  );

  assert.match(html, /Campaign structure/);
  assert.match(html, /Selected ad group/);
  assert.match(html, /Community ad group/);
  assert.match(html, /Community ad/);
  assert.match(html, /data-tiktok-preview-workspace="true"/);
  assert.doesNotMatch(html.slice(0, html.indexOf("Selected TikTok setup")), /bg-\[#17171b\]/);
  assert.match(html, /data-hierarchy-scroll="true"/);
  assert.doesNotMatch(html, /Choose campaign|Choose ad group|Choose ad/);
});
