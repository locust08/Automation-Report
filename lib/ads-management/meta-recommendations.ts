import type { CampaignRow } from "@/lib/reporting/types";

export type MetaManagementRecommendation = {
  id: string;
  campaignId: string;
  campaignName: string;
  kind: "reduce_waste" | "scale_winner";
  category: "Efficiency" | "Growth";
  title: string;
  description: string;
  evidence: string;
  fieldPath: "campaign.budget.daily";
};

export type MetaManagementActivityState = {
  kind: "available" | "no_qualifying_activity";
  title: string;
  description: string;
};

export function getMetaManagementActivityState(input: {
  surface: "overview" | "recommendations";
  campaignCount: number;
  performanceRowCount: number;
  warnings: string[];
}): MetaManagementActivityState {
  if (input.surface === "overview" || input.performanceRowCount > 0) {
    return {
      kind: "available",
      title: "Meta performance is available",
      description: `${input.performanceRowCount} campaign performance rows are available for review.`,
    };
  }

  const providerWarning = input.warnings.find((warning) =>
    warning.toLowerCase().includes("meta ads returned no campaign rows"),
  );
  const synchronizedLabel = `${input.campaignCount} campaign ${input.campaignCount === 1 ? "record was" : "records were"} synchronized`;

  return {
    kind: "no_qualifying_activity",
    title: "No qualifying Meta activity for this date range",
    description: providerWarning
      ? `${synchronizedLabel}, but ${lowercaseFirst(providerWarning)}`
      : `${synchronizedLabel}, but no qualifying performance rows were returned for the selected date range.`,
  };
}

export function buildMetaManagementRecommendations(rows: CampaignRow[]): MetaManagementRecommendation[] {
  const metaRows = rows.filter((row) => row.platform === "meta" && row.spend > 0);
  if (metaRows.length === 0) return [];

  const recommendations: MetaManagementRecommendation[] = [];
  const wasteful = [...metaRows]
    .filter((row) => row.results <= 0)
    .sort((left, right) => right.spend - left.spend)[0];

  if (wasteful) {
    recommendations.push({
      id: `reduce-waste:${wasteful.id}`,
      campaignId: wasteful.id,
      campaignName: wasteful.campaignName,
      kind: "reduce_waste",
      category: "Efficiency",
      title: `Review spend on ${wasteful.campaignName}`,
      description: "This campaign spent during the selected range without recording a result. Review its budget before allocating more spend.",
      evidence: `${formatCurrency(wasteful.spend)} spent · ${formatNumber(wasteful.clicks)} clicks · 0 ${wasteful.resultLabel ?? "results"}`,
      fieldPath: "campaign.budget.daily",
    });
  }

  const winner = [...metaRows]
    .filter((row) => row.results > 0)
    .sort((left, right) => effectiveCostPerResult(left) - effectiveCostPerResult(right))[0];

  if (winner) {
    recommendations.push({
      id: `scale-winner:${winner.id}`,
      campaignId: winner.id,
      campaignName: winner.campaignName,
      kind: "scale_winner",
      category: "Growth",
      title: `Consider scaling ${winner.campaignName}`,
      description: "This is the most cost-efficient result-producing campaign in the selected range. Review a measured budget increase through Change Control.",
      evidence: `${formatNumber(winner.results)} ${winner.resultLabel ?? "results"} · ${formatCurrency(effectiveCostPerResult(winner))} per result`,
      fieldPath: "campaign.budget.daily",
    });
  }

  return recommendations;
}

function effectiveCostPerResult(row: CampaignRow) {
  return row.costPerResult > 0 ? row.costPerResult : row.spend / row.results;
}

function lowercaseFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value);
}
