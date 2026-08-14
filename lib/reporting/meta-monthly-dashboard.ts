import { computeDelta, MIN_REPORTING_CAMPAIGN_SPEND } from "@/lib/reporting/metrics";
import { CampaignRow, SummaryMetric } from "@/lib/reporting/types";

const MIXED_OUTCOME_VALUE = "Mixed";

export function normalizeMetaMonthlyCampaignRows(rows: CampaignRow[]): CampaignRow[] {
  return rows;
}

export function buildMetaMonthlyOutcomeMetrics(
  currentRows: CampaignRow[],
  previousRows: CampaignRow[]
): SummaryMetric[] {
  const current = aggregateSalesAndLeadOutcomes(currentRows);
  const previous = aggregateSalesAndLeadOutcomes(previousRows);

  if (!current.hasEligibleCampaign) {
    const currentAwareness = getSingleAwarenessOutcome(currentRows);
    const previousAwareness = getSingleAwarenessOutcome(previousRows);
    if (currentAwareness) {
      const deltaEligible = Boolean(previousAwareness);
      return [
        outcomeMetric(
          "results",
          "Results",
          currentAwareness.results,
          previousAwareness?.results ?? 0,
          "number",
          deltaEligible
        ),
        outcomeMetric(
          "costPerResult",
          "Cost/Results",
          currentAwareness.costPerResult,
          previousAwareness?.costPerResult ?? 0,
          "currency",
          deltaEligible
        ),
      ];
    }

    return [
      mixedOutcomeMetric("results", "Results", "number"),
      mixedOutcomeMetric("costPerResult", "Cost/Results", "currency"),
    ];
  }

  const deltaEligible = previous.hasEligibleCampaign;
  return [
    outcomeMetric(
      "results",
      "Results",
      current.results,
      previous.results,
      "number",
      deltaEligible
    ),
    outcomeMetric(
      "costPerResult",
      "Cost/Results",
      current.costPerResult,
      previous.costPerResult,
      "currency",
      deltaEligible
    ),
  ];
}

function getSingleAwarenessOutcome(
  rows: CampaignRow[]
): Pick<CampaignRow, "results" | "costPerResult"> | null {
  const reportableRows = rows.filter(
    (row) => row.platform === "meta" && row.spend > MIN_REPORTING_CAMPAIGN_SPEND
  );
  if (
    reportableRows.length !== 1 ||
    !reportableRows[0].campaignType.toLowerCase().includes("awareness")
  ) {
    return null;
  }

  return {
    results: reportableRows[0].results,
    costPerResult: reportableRows[0].costPerResult,
  };
}

function isMetaSalesOrLeadCampaign(row: CampaignRow): boolean {
  if (row.platform !== "meta") {
    return false;
  }

  const campaignType = row.campaignType.toLowerCase();
  return campaignType.includes("sales") || campaignType.includes("lead");
}

function aggregateSalesAndLeadOutcomes(rows: CampaignRow[]): {
  hasEligibleCampaign: boolean;
  results: number;
  costPerResult: number;
} {
  const eligibleRows = rows.filter(
    (row) => row.spend > MIN_REPORTING_CAMPAIGN_SPEND && isMetaSalesOrLeadCampaign(row)
  );
  const results = eligibleRows.reduce((total, row) => total + row.results, 0);
  const spend = eligibleRows.reduce((total, row) => total + row.spend, 0);

  return {
    hasEligibleCampaign: eligibleRows.length > 0,
    results,
    costPerResult: results > 0 ? spend / results : 0,
  };
}

function mixedOutcomeMetric(
  key: string,
  label: string,
  format: SummaryMetric["format"]
): SummaryMetric {
  return {
    key,
    label,
    value: null,
    previousValue: null,
    displayValue: MIXED_OUTCOME_VALUE,
    delta: null,
    format,
  };
}

function outcomeMetric(
  key: string,
  label: string,
  currentValue: number,
  previousValue: number,
  format: SummaryMetric["format"],
  deltaEligible: boolean
): SummaryMetric {
  return {
    key,
    label,
    value: currentValue,
    previousValue: deltaEligible ? previousValue : null,
    delta: deltaEligible ? computeDelta(currentValue, previousValue) : null,
    format,
  };
}
