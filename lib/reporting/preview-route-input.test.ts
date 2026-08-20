import assert from "node:assert/strict";
import test from "node:test";

import {
  getPreviewExplicitAccountIds,
  normalizePreviewPlatform,
  resolvePreviewRouteAccountId,
} from "./preview-route-input";

test("does not reuse a staged route ID when an explicit TikTok advertiser is present", () => {
  const context = {
    accountId: null,
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: "7485938233214353409",
  };

  assert.equal(resolvePreviewRouteAccountId("7485938233214353409", context), null);
});

test("keeps a staged route ID as the generic fallback when no explicit platform ID exists", () => {
  const context = {
    accountId: null,
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: null,
  };

  assert.equal(resolvePreviewRouteAccountId("act_123456789", context), "act_123456789");
});

test("preserves TikTok platform and advertiser context for staged hierarchy routes", () => {
  const context = {
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: "7512268241088299015",
  };

  assert.equal(normalizePreviewPlatform("tiktok"), "tiktok");
  assert.deepEqual(getPreviewExplicitAccountIds(context), {
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: "7512268241088299015",
  });
});
