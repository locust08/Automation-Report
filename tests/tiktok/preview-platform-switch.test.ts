import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePreviewPlatform,
  shouldPreservePreviewHierarchySelection,
  switchReportAccountEntryPlatform,
} from "../../lib/reporting/preview-platform-context";

test("an explicit Meta account overrides a stale TikTok platform parameter", () => {
  assert.equal(resolvePreviewPlatform({
    requestedPlatform: "tiktok",
    metaAccountId: "265352415868160",
    googleAccountId: "",
    tiktokAccountId: "",
  }), "meta");
});

test("a hierarchy selection is discarded when its platform conflicts with the account", () => {
  assert.equal(shouldPreservePreviewHierarchySelection("tiktok", "meta"), false);
  assert.equal(shouldPreservePreviewHierarchySelection("meta", "meta"), true);
});

test("switching an account row clears the incompatible account selection", () => {
  assert.deepEqual(
    switchReportAccountEntryPlatform({
      key: "row-1",
      platform: "tiktok",
      accountId: "7512268241088299015",
      searchText: "Bellamy SG",
    }, "google"),
    {
      key: "row-1",
      platform: "google",
      accountId: "",
      searchText: "",
    },
  );
});
