import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const filtersSource = await readFile(new URL("./report-filters-bar.tsx", import.meta.url), "utf8");
const advancedSource = await readFile(new URL("./advanced-page-client.tsx", import.meta.url), "utf8");
const overallSource = await readFile(new URL("./overall-page-client.tsx", import.meta.url), "utf8");
const overallRouteSource = await readFile(new URL("../../app/overall/page.tsx", import.meta.url), "utf8");

test("report filters remember and immediately apply selected accounts", () => {
  assert.match(filtersSource, /immediateAccountApply\?: boolean/);
  assert.match(filtersSource, /writeRememberedReportAccount/);
  assert.match(filtersSource, /readRememberedReportAccount/);
  assert.match(filtersSource, /clearRememberedReportAccount/);
});

test("advanced reports use the shared searchable report filters", () => {
  assert.match(advancedSource, /ReportFiltersBar/);
  assert.equal(advancedSource.includes("Enter an Ad Account ID on the home page"), false);
  assert.equal(advancedSource.includes("Switch Account"), false);
});

test("the overall report accepts remembered TikTok account parameters", () => {
  assert.match(overallRouteSource, /tiktokAccountId:/);
  assert.match(overallRouteSource, /value === "tiktok"/);
});

test("split reports hide the redundant TikTok account context strip", () => {
  assert.match(overallSource, /showTikTokAccountContext=\{false\}/);
  assert.match(overallSource, /showTikTokAccountContext \? data\.tiktokAccounts/);
});
