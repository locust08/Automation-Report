import assert from "node:assert/strict";
import test from "node:test";
import { metaVideoPlays } from "./video-views";
import { normalizeTikTokReportRows } from "./tiktok";

test("Meta views match KBS plays, preserving zero and missing values", () => {
  assert.equal(metaVideoPlays([{ action_type: "video_view", value: "400000" }]), 400000);
  assert.equal(metaVideoPlays([{ action_type: "video_view", value: "0" }]), 0);
  assert.equal(metaVideoPlays(undefined), null);
  assert.equal(metaVideoPlays([{ action_type: "video_view" }]), null);
});
test("TikTok views match KBS starts rather than impressions or completed views", () => {
  const rows = normalizeTikTokReportRows([{ dimensions: { ad_id: "ad" }, metrics: { reach: "500", clicks: "10", spend: "5", result: "2", video_play_actions: "56794", impressions: "99999", video_views_p100: "15" } }], "ad_id");
  assert.equal(rows[0].videoViews, 56794);
});

