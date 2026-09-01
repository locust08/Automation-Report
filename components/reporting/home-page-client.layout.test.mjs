import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./home-page-client.tsx", import.meta.url), "utf8");

test("renders the dashboard as a launcher without an account gate", () => {
  const dashboardTools = source.indexOf('aria-labelledby="dashboard-tools-heading"');
  const accountSelector = source.indexOf('aria-label="Account Name / Ad Account ID"');

  assert.notEqual(dashboardTools, -1);
  assert.equal(accountSelector, -1);
  assert.equal(source.includes("Select an account to enable the three report actions below."), false);
  assert.match(source, /const overallHref = "\/overall"/);
  assert.match(source, /const previewHref = "\/preview"/);
  assert.match(source, /const advancedHref = "\/advanced"/);
});

test("places account-independent actions inside the dashboard-tools section", () => {
  const dashboardTools = source.indexOf('aria-labelledby="dashboard-tools-heading"');
  const sendReport = source.indexOf("Send Report", dashboardTools);
  const mediaPlan = source.indexOf("Create Media Plan", dashboardTools);
  const campaignPlanning = source.indexOf("Campaign Planning &amp; Launch", dashboardTools);

  assert.notEqual(dashboardTools, -1);
  assert.ok(sendReport > dashboardTools);
  assert.ok(mediaPlan > dashboardTools);
  assert.ok(campaignPlanning > dashboardTools);
});

test("keeps section badges aligned without wrapping their labels", () => {
  assert.ok((source.match(/min-w-0 flex-1/g)?.length ?? 0) >= 2);
  assert.ok((source.match(/shrink-0 whitespace-nowrap/g)?.length ?? 0) >= 1);
});
