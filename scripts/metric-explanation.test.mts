import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getMetricExplanation } = require("../components/reporting/metric-explanation.ts") as typeof import("../components/reporting/metric-explanation");

const metaCtr = getMetricExplanation("meta", {
  key: "ctr",
  label: "CTR (%)",
  value: 2.5,
  previousValue: 1.25,
  delta: 100,
  format: "percent",
});
assert.equal(metaCtr.source, "Meta Ads Manager");
assert.equal(metaCtr.formula, "Clicks ÷ impressions × 100.");

const googleCostPerConversion = getMetricExplanation("google", {
  key: "costPerConv",
  label: "Cost/Conv.",
  value: 25,
  previousValue: 20,
  delta: 25,
  format: "currency",
});
assert.equal(googleCostPerConversion.source, "Google Ads Manager");
assert.equal(googleCostPerConversion.formula, "Cost ÷ conversions.");

const mixedMeta = getMetricExplanation("meta", {
  key: "results",
  label: "Results",
  value: null,
  previousValue: null,
  displayValue: "Mixed",
  delta: null,
  format: "number",
});
assert.match(mixedMeta.mixedReason ?? "", /No Sales or Leads campaign/);
