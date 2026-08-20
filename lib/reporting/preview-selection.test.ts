import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviewEntry } from "./preview-selection";

test("uses the TikTok platform name when an authorized preview has no campaigns", () => {
  const result = resolvePreviewEntry([{
    platform: "tiktok",
    title: "TikTok Ads Preview",
    logoPath: "/TikTokLogo.png",
    accountId: "7485938233214353409",
    accountName: null,
    fetchedAt: "2026-08-19T00:00:00.000Z",
    childLabel: "Ad Group",
    campaigns: [],
  }], {
    platform: "tiktok",
    campaignId: null,
    campaignName: null,
  });

  assert.equal(result.message, "No active TikTok Ads campaigns are available for this preview.");
});
