import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoogleEntityViewLayout,
  GOOGLE_PAGINATED_LIST_CLASS,
  selectGoogleChangeRequestNavigation,
  selectGooglePrimaryNavigation,
  shouldDismissGoogleAccountSearch,
} from "./google-management-navigation";

test("Google paginated lists keep square footer edges", () => {
  assert.equal(GOOGLE_PAGINATED_LIST_CLASS, "overflow-hidden");
  assert.doesNotMatch(GOOGLE_PAGINATED_LIST_CLASS, /rounded/);
});

test("Google entity views keep filters in the performance header without a duplicate date picker", () => {
  assert.deepEqual(getGoogleEntityViewLayout("campaigns"), {
    performanceTitle: "Campaign performance",
    filterLabel: "Campaign filter",
    filterPlacement: "performance_header",
    showLocalDatePicker: false,
  });
  assert.deepEqual(getGoogleEntityViewLayout("ad_groups"), {
    performanceTitle: "Ad group performance",
    filterLabel: "Ad group filter",
    filterPlacement: "performance_header",
    showLocalDatePicker: false,
  });
  assert.deepEqual(getGoogleEntityViewLayout("ads"), {
    performanceTitle: "Ad performance",
    filterLabel: "Ad filter",
    filterPlacement: "performance_header",
    showLocalDatePicker: false,
  });
});

test("Google account search stays open for pointer events inside its container", () => {
  const searchContainer = {};
  assert.equal(shouldDismissGoogleAccountSearch(searchContainer, [{}, searchContainer, {}]), false);
});

test("Google account search closes for pointer events outside its container", () => {
  assert.equal(shouldDismissGoogleAccountSearch({}, [{}, {}]), true);
});

test("selecting a primary Google section closes the Change requests dropdown", () => {
  assert.deepEqual(selectGooglePrimaryNavigation("campaigns"), {
    view: "campaigns",
    changeRequestsOpen: false,
  });
});

test("selecting a Google Change requests option opens the group and activates its filter", () => {
  assert.deepEqual(selectGoogleChangeRequestNavigation("ad_group"), {
    view: "change_requests",
    changeRequestFilter: "ad_group",
    changeRequestsOpen: true,
  });
});
