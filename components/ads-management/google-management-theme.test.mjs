import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all(
  [
    "google-management-page-client.tsx",
    "history-page-client.tsx",
    "change-request-page-client.tsx",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
);

const [managementPage, historyPanel, changeRequestPanel] = sources;
const combinedSource = sources.join("\n");

test("Google Ads Management uses red accents instead of decorative blue", () => {
  assert.doesNotMatch(
    combinedSource,
    /(?:[a-z-]+:)*(?:text|bg|border|ring)-(?:blue|violet|cyan|indigo|fuchsia|purple|sky|teal)-\d+/,
  );
  assert.doesNotMatch(combinedSource, /#2563eb|#f8fafd/i);

  assert.match(
    managementPage,
    /border-red-200 bg-red-50 text-red-800/,
  );
  assert.match(managementPage, /text-red-600/);
  assert.match(managementPage, /bg-red-600/);
  assert.match(managementPage, /focus-within:ring-red-200/);
  assert.match(managementPage, /bg-\[#fffafa\]/);
});

test("embedded history and change-request panels share the red theme", () => {
  assert.match(historyPanel, /hover:bg-red-50\/40/);
  assert.match(historyPanel, /text-red-700/);
  assert.match(changeRequestPanel, /border-red-200 bg-red-50/);
  assert.match(changeRequestPanel, /text-red-700/);
});

test("empty change history does not show an error banner", () => {
  assert.match(historyPanel, /error && items\.length > 0/);
  assert.match(historyPanel, /No change requests found for this account\./);
});

test("truncated management entity names expose their complete text", () => {
  assert.match(managementPage, /function ManagementEntityName/);
  assert.match(managementPage, /<TooltipTrigger asChild>/);
  assert.match(managementPage, /tabIndex=\{0\}/);
  assert.doesNotMatch(managementPage, /cursor: "help"/);
  assert.match(managementPage, /w-full cursor-default/);
  assert.match(managementPage, /text-center text-sm/);
  assert.match(managementPage, /align="center"/);
  assert.match(managementPage, /items-center/);
  assert.match(managementPage, /bg-\[#211114\]/);
  assert.match(managementPage, /<ManagementEntityName text=\{adGroup\.name\}/);
  assert.match(managementPage, /<ManagementEntityName text=\{campaign\.name\}/);
});

test("campaign report dates use the shadcn calendar picker", () => {
  assert.match(managementPage, /function ManagementDatePicker/);
  assert.match(managementPage, /<PopoverTrigger asChild>/);
  assert.match(managementPage, /<Calendar/);
  assert.match(managementPage, /disabled=\{\(date\) =>/);
  assert.doesNotMatch(managementPage, /id="campaign-(?:start|end)-date" type="date"/);
});

test("campaign performance exposes an interactive calendar-02 date range", () => {
  assert.match(managementPage, /import \{ Calendar02 \}/);
  assert.match(managementPage, /function ManagementDateRangePicker/);
  assert.match(managementPage, /mode="range"/);
  assert.equal(managementPage.match(/dateRangeControl=\{/g)?.length, 3);
  assert.doesNotMatch(managementPage, />Last 30 days</);
});

test("account search results are anchored directly below the search input", () => {
  const inputAnchor = managementPage.indexOf('<div className="relative mt-2">');
  const resultsPanel = managementPage.indexOf('absolute left-0 right-0 top-full', inputAnchor);
  const accountTitle = managementPage.indexOf('{currentAccount ? (', inputAnchor);
  assert.ok(inputAnchor >= 0);
  assert.ok(resultsPanel > inputAnchor);
  assert.ok(resultsPanel < accountTitle);
});

test("management report filters show ten options before scrolling", () => {
  assert.match(managementPage, /MANAGEMENT_FILTER_MENU_CLASS = "max-h-\[22rem\]"/);
  assert.equal(
    managementPage.match(/className=\{MANAGEMENT_FILTER_MENU_CLASS\}/g)?.length,
    3,
  );
});
