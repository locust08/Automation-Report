import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readComponent = (name) =>
  readFile(new URL(`./${name}`, import.meta.url), "utf8");

const [overall, shell, filters, metrics, campaigns, audience] = await Promise.all([
  readComponent("overall-page-client.tsx"),
  readComponent("report-shell.tsx"),
  readComponent("report-filters-bar.tsx"),
  readComponent("metric-grid.tsx"),
  readComponent("campaign-table.tsx"),
  readComponent("audience-click-breakdown.tsx"),
]);

test("enables balanced compact sizing only for interactive overall reports", () => {
  assert.match(overall, /const compactInteractive = !screenshotMode/);
  assert.match(overall, /compactResponsive=\{compactInteractive\}/);
  assert.match(overall, /variant=\{compactInteractive \? "compact" : "header"\}/);
  assert.match(shell, /text-\[clamp\(1\.75rem,3\.2vw,2\.5rem\)\]/);
  assert.match(shell, /minmax\(260px,360px\)/);
});

test("keeps compact account filters readable before the large breakpoint", () => {
  assert.match(filters, /lg:flex-row lg:flex-wrap lg:items-start/);
  assert.match(filters, /compact \? "h-9 text-xs" : "h-10 text-sm"/);
  assert.match(filters, /compact \? "h-9 px-3 text-xs sm:min-w-\[112px\]"/);
});

test("opts report body sections into compact sizing without changing defaults", () => {
  assert.match(metrics, /compact = false/);
  assert.match(campaigns, /compact = false/);
  assert.match(audience, /compact = false/);
  assert.match(audience, /compact && !screenshotMode/);
  assert.match(campaigns, /xl:hidden/);
  assert.match(campaigns, /xl:block/);
});
