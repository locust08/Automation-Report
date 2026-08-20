import assert from "node:assert/strict";
import test from "node:test";

import { buildTikTokPreviewMediaFields } from "../../lib/reporting/tiktok";

test("maps a TikTok post item into preview creative media and a public post link", () => {
  const result = buildTikTokPreviewMediaFields(
    {
      ad_id: "1873302881134018",
      ad_name: "03 | A little of nature",
      ad_text: "A little of nature, brought home with purpose and care.",
      tiktok_item_id: "7647063902656040213",
    },
    {
      thumbnailUrl: "https://p16-common-sign.tiktokcdn.com/cover.jpg",
      publicPostUrl: "https://www.tiktok.com/@bellamysorganic.sg/video/7647063902656040213",
    },
  );

  assert.equal(result.creative?.thumbnailUrl, "https://p16-common-sign.tiktokcdn.com/cover.jpg");
  assert.equal(result.creative?.posterUrl, "https://p16-common-sign.tiktokcdn.com/cover.jpg");
  assert.equal(result.creative?.videoPermalinkUrl, "https://www.tiktok.com/@bellamysorganic.sg/video/7647063902656040213");
  assert.deepEqual(result.previewLinks, [{
    label: "Open TikTok post",
    url: "https://www.tiktok.com/@bellamysorganic.sg/video/7647063902656040213",
    publicPostUrl: "https://www.tiktok.com/@bellamysorganic.sg/video/7647063902656040213",
    linkKind: "publicPost",
  }]);
});
