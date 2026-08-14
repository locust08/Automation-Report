import type { Platform, SummaryMetric } from "@/lib/reporting/types";

export interface MetricExplanation {
  source: string;
  formula: string;
  mixedReason?: string;
}

export function getMetricExplanation(
  platform: Platform,
  metric: SummaryMetric
): MetricExplanation {
  if (metric.displayValue === "Mixed") {
    return {
      source: "Meta Ads Manager",
      formula: "A single result definition is not available for this account and period.",
      mixedReason:
        "No Sales or Leads campaign had reportable spend, so Results and Cost/Results cannot be compared as one metric.",
    };
  }

  const source = platform === "meta" ? "Meta Ads Manager" : "Google Ads Manager";
  return {
    source,
    formula: resolveMetricFormula(platform, metric.key),
  };
}

function resolveMetricFormula(platform: Platform, key: string): string {
  const formulas: Record<string, string> = {
    results:
      platform === "meta"
        ? "Reported Meta result. Overall summaries use Sales and Leads campaigns with reportable spend."
        : "Reported platform result.",
    conversions: "Reported Google Ads conversions.",
    costPerResult: "Eligible spend ÷ eligible reported results.",
    costPerResults: "Spend ÷ reported results.",
    costPerConv: "Cost ÷ conversions.",
    clicks: "Total recorded ad clicks.",
    ctr: "Clicks ÷ impressions × 100.",
    avgCpc: "Spend ÷ clicks.",
    cpm: "Spend ÷ impressions × 1,000.",
    impressions: "Total recorded ad impressions.",
    spend: "Total ad spend for the selected period.",
    youtubeEarnedShares: "Total earned YouTube shares.",
    youtubeEarnedLikes: "Total earned YouTube likes.",
  };

  return formulas[key] ?? "Reported platform metric for the selected period.";
}
