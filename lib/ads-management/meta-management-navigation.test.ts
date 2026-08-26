import assert from "node:assert/strict";
import test from "node:test";

import {
  selectMetaChangeRequestNavigation,
  selectMetaPrimaryNavigation,
} from "@/lib/ads-management/meta-management-navigation";

test("selecting a primary Meta section closes the Change requests dropdown", () => {
  assert.deepEqual(selectMetaPrimaryNavigation("campaigns"), {
    tab: "campaigns",
    changeRequestsOpen: false,
  });
});

test("selecting a Change requests option opens the group and activates its focused filter", () => {
  assert.deepEqual(selectMetaChangeRequestNavigation("creative"), {
    tab: "change_requests",
    changeRequestFilter: "creative",
    changeRequestsOpen: true,
  });
});
