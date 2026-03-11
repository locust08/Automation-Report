import { computeDelta, emptyCampaignRow, mergeCampaignRows, safeDivide } from "@/lib/reporting/metrics";
import {
  CampaignRow,
  DateRangeConfig,
  InsightRow,
  PlatformInsightsSection,
} from "@/lib/reporting/types";

type InsightPlatform = PlatformInsightsSection["platform"];

interface CampaignSnapshot {
  key: string;
  row: CampaignRow;
  previousRow: CampaignRow | null;
  results: number;
  costPerResult: number;
  conversionRate: number;
  ctrDelta: number | null;
  resultDelta: number | null;
  costPerResultDelta: number | null;
}

interface CandidateInsight extends Omit<InsightRow, "priority"> {
  score: number;
}

export function buildPlatformInsights(input: {
  platform: InsightPlatform;
  currentRows: CampaignRow[];
  previousRows: CampaignRow[];
  dateRange: DateRangeConfig;
}): PlatformInsightsSection {
  const { platform, currentRows, previousRows, dateRange } = input;
  const rows = buildInsightRows(platform, currentRows, previousRows, dateRange);

  return {
    platform,
    title: platform === "meta" ? "Meta Insights" : "Google Insights",
    rows,
  };
}

function buildInsightRows(
  platform: InsightPlatform,
  currentRows: CampaignRow[],
  previousRows: CampaignRow[],
  dateRange: DateRangeConfig
): InsightRow[] {
  const scopedCurrentRows = currentRows.filter((row) => row.platform === platform && row.spend > 0);
  const scopedPreviousRows = previousRows.filter((row) => row.platform === platform);

  if (scopedCurrentRows.length === 0) {
    return [];
  }

  const previousMap = new Map(scopedPreviousRows.map((row) => [campaignKey(row), row]));
  const snapshots = scopedCurrentRows.map((row) => {
    const previousRow = previousMap.get(campaignKey(row)) ?? null;
    const results = row.results;
    const costPerResult = results > 0 ? row.spend / results : 0;
    const conversionRate = safeDivide(results * 100, row.clicks);

    return {
      key: campaignKey(row),
      row: {
        ...row,
        costPerResult,
      },
      previousRow,
      results,
      costPerResult,
      conversionRate,
      ctrDelta: computeDelta(row.ctr, previousRow?.ctr ?? 0),
      resultDelta: computeDelta(results, previousRow?.results ?? 0),
      costPerResultDelta: computeDelta(costPerResult, previousRow?.costPerResult ?? 0),
    } satisfies CampaignSnapshot;
  });

  const totals = scopedCurrentRows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow(`${platform}-insights-total`, platform, "All", "All campaigns")
  );
  const averageCtr = safeDivide(totals.clicks * 100, totals.impressions);
  const averageConversionRate = safeDivide(totals.results * 100, totals.clicks);
  const averageCostPerResult = totals.results > 0 ? totals.spend / totals.results : 0;

  const candidates: CandidateInsight[] = [];

  const budgetShiftCandidate = createBudgetShiftCandidate({
    platform,
    snapshots,
    averageCostPerResult,
    dateRange,
  });
  if (budgetShiftCandidate) {
    candidates.push(budgetShiftCandidate);
  }

  const pauseCandidate = createPauseCandidate({
    platform,
    snapshots,
    averageCostPerResult,
    totals,
    dateRange,
  });
  if (pauseCandidate) {
    candidates.push(pauseCandidate);
  }

  const headlineCandidate = createHeadlineTestCandidate({
    platform,
    snapshots,
    averageCtr,
    averageCostPerResult,
    dateRange,
  });
  if (headlineCandidate) {
    candidates.push(headlineCandidate);
  }

  const scaleCandidate = createScaleCandidate({
    platform,
    snapshots,
    averageCostPerResult,
    dateRange,
  });
  if (scaleCandidate) {
    candidates.push(scaleCandidate);
  }

  const budgetTrimCandidate = createBudgetTrimCandidate({
    platform,
    snapshots,
    averageCostPerResult,
    totals,
    dateRange,
  });
  if (budgetTrimCandidate) {
    candidates.push(budgetTrimCandidate);
  }

  const conversionRateCandidate = createConversionRateCandidate({
    platform,
    snapshots,
    averageConversionRate,
    averageCostPerResult,
    dateRange,
  });
  if (conversionRateCandidate) {
    candidates.push(conversionRateCandidate);
  }

  const selected: InsightRow[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (seen.has(candidate.whatToChange)) {
      continue;
    }

    selected.push({
      id: candidate.id,
      priority: selected.length + 1,
      whatToChange: candidate.whatToChange,
      whyThisMatters: candidate.whyThisMatters,
      successMetric: candidate.successMetric,
      decisionRule: candidate.decisionRule,
    });
    seen.add(candidate.whatToChange);

    if (selected.length === 3) {
      break;
    }
  }

  if (selected.length < 3) {
    selected.push(
      ...buildFallbackInsights({
        platform,
        snapshots,
        dateRange,
        startPriority: selected.length + 1,
      }).slice(0, 3 - selected.length)
    );
  }

  return selected.slice(0, 3);
}

function createBudgetShiftCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageCostPerResult: number;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  const efficientRows = input.snapshots
    .filter((snapshot) => snapshot.results > 0)
    .sort((left, right) => left.costPerResult - right.costPerResult);
  const best = efficientRows[0];
  if (!best) {
    return null;
  }

  const donor = input.snapshots
    .filter((snapshot) => snapshot.key !== best.key)
    .sort((left, right) => donorPriority(right, input.averageCostPerResult) - donorPriority(left, input.averageCostPerResult))[0];

  if (!donor || donor.row.spend <= 0) {
    return null;
  }

  const donorIsMeaningfullyWorse =
    donor.results === 0 ||
    best.costPerResult === 0 ||
    donor.costPerResult >= best.costPerResult * 1.35;
  if (!donorIsMeaningfullyWorse) {
    return null;
  }

  const costLabel = platformCostLabel(input.platform);
  const resultLabel = platformResultLabel(input.platform);
  const donorCostText =
    donor.results > 0
      ? `needed RM ${formatCurrency(donor.costPerResult)} per ${singularResultLabel(input.platform)}`
      : `spent RM ${formatCurrency(donor.row.spend)} without any ${resultLabel}`;

  return {
    id: `${input.platform}-budget-shift`,
    score: Math.max(donor.row.spend * 0.2, 1) + Math.max(donor.costPerResult - best.costPerResult, 0),
    whatToChange: `Shift 20% budget from ${quoteCampaign(donor.row.campaignName)} to ${quoteCampaign(best.row.campaignName)}.`,
    whyThisMatters: `${quoteCampaign(best.row.campaignName)} brought ${formatNumber(best.results)} ${resultLabel} at RM ${formatCurrency(best.costPerResult)} each in ${input.dateRange.currentLabel}, while ${quoteCampaign(donor.row.campaignName)} ${donorCostText}. This keeps the test to budget only and follows the current month data.`,
    successMetric: `${costLabel}: keep ${quoteCampaign(best.row.campaignName)} below RM ${formatCurrency(best.costPerResult * 1.1)} and lift total ${resultLabel}.`,
    decisionRule: `Keep and scale if total ${resultLabel} rise or stay flat after 7 days and ${quoteCampaign(best.row.campaignName)} remains at least 20% cheaper than ${quoteCampaign(donor.row.campaignName)}. Stop if the cost gap drops below 10% or total ${resultLabel} fall.`,
  };
}

function createPauseCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageCostPerResult: number;
  totals: CampaignRow;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  const zeroResultRow = input.snapshots
    .filter((snapshot) => snapshot.results === 0 && snapshot.row.spend > 0)
    .sort((left, right) => right.row.spend - left.row.spend)[0];

  const weakRow =
    zeroResultRow ??
    input.snapshots
      .filter(
        (snapshot) =>
          snapshot.results > 0 &&
          input.averageCostPerResult > 0 &&
          snapshot.costPerResult >= input.averageCostPerResult * 1.8
      )
      .sort((left, right) => right.row.spend - left.row.spend)[0];

  if (!weakRow) {
    return null;
  }

  const resultLabel = platformResultLabel(input.platform);
  const costLabel = platformCostLabel(input.platform);
  const totalCostPerResult = input.totals.results > 0 ? input.totals.spend / input.totals.results : 0;

  return {
    id: `${input.platform}-pause-waste`,
    score: weakRow.row.spend + (weakRow.results === 0 ? weakRow.row.spend : weakRow.costPerResult),
    whatToChange: `Pause ${quoteCampaign(weakRow.row.campaignName)} for 7 days.`,
    whyThisMatters: weakRow.results === 0
      ? `${quoteCampaign(weakRow.row.campaignName)} spent RM ${formatCurrency(weakRow.row.spend)} in ${input.dateRange.currentLabel} and produced 0 ${resultLabel}. That is the clearest place to cut wasted spend first.`
      : `${quoteCampaign(weakRow.row.campaignName)} spent RM ${formatCurrency(weakRow.row.spend)} in ${input.dateRange.currentLabel} and needed RM ${formatCurrency(weakRow.costPerResult)} per ${singularResultLabel(input.platform)}, far above the current account average of RM ${formatCurrency(input.averageCostPerResult)}.`,
    successMetric: `${costLabel}: move the account average from RM ${formatCurrency(totalCostPerResult)} to below RM ${formatCurrency(totalCostPerResult * 0.9 || totalCostPerResult)} without losing more than 10% of total ${resultLabel}.`,
    decisionRule: `Keep it paused if total ${resultLabel} stay within 10% of the current period after 7 days and account-wide ${costLabel} improves. Turn it back on only if total ${resultLabel} drop by more than 10%.`,
  };
}

function createHeadlineTestCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageCtr: number;
  averageCostPerResult: number;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  const target = input.snapshots
    .filter(
      (snapshot) =>
        snapshot.row.impressions > 0 &&
        snapshot.row.ctr < input.averageCtr &&
        snapshot.row.spend > 0
    )
    .sort((left, right) => right.row.impressions - left.row.impressions)[0];

  if (!target) {
    return null;
  }

  const targetCtrGoal = Math.max(target.row.ctr * 1.15, input.averageCtr || target.row.ctr + 0.3);
  const costLabel = platformCostLabel(input.platform);
  const resultLabel = platformResultLabel(input.platform);

  return {
    id: `${input.platform}-headline-test`,
    score: target.row.impressions * Math.max(input.averageCtr - target.row.ctr, 0.1),
    whatToChange: `Duplicate ${quoteCampaign(target.row.campaignName)} and test one new headline only.`,
    whyThisMatters: `${quoteCampaign(target.row.campaignName)} was shown ${formatNumber(target.row.impressions)} times in ${input.dateRange.currentLabel}, but only ${formatPercent(target.row.ctr)} of people clicked. The account average was ${formatPercent(input.averageCtr)}. This is a simple message test with one variable only.`,
    successMetric: `CTR: raise ${quoteCampaign(target.row.campaignName)} from ${formatPercent(target.row.ctr)} to at least ${formatPercent(targetCtrGoal)} while keeping ${costLabel} flat or lower.`,
    decisionRule: `Keep the new headline if CTR improves by at least 15% after 7 days and ${costLabel} does not get worse by more than 10%. Stop if clicks stay flat or total ${resultLabel} fall.`,
  };
}

function createScaleCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageCostPerResult: number;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  const winner = input.snapshots
    .filter(
      (snapshot) =>
        snapshot.results > 0 &&
        (input.averageCostPerResult === 0 || snapshot.costPerResult <= input.averageCostPerResult * 0.85)
    )
    .sort((left, right) => {
      if (right.results !== left.results) {
        return right.results - left.results;
      }
      return left.costPerResult - right.costPerResult;
    })[0];

  if (!winner) {
    return null;
  }

  const resultLabel = platformResultLabel(input.platform);
  const costLabel = platformCostLabel(input.platform);
  const performanceComparedWithLastPeriod = formatDeltaSentence({
    label: resultLabel,
    delta: winner.resultDelta,
    currentLabel: input.dateRange.currentLabel,
    previousLabel: input.dateRange.previousLabel,
  });

  return {
    id: `${input.platform}-scale-winner`,
    score: winner.results * 10 + Math.max(input.averageCostPerResult - winner.costPerResult, 0),
    whatToChange: `Increase daily budget on ${quoteCampaign(winner.row.campaignName)} by 15% only.`,
    whyThisMatters: `${quoteCampaign(winner.row.campaignName)} is the most efficient current winner with ${formatNumber(winner.results)} ${resultLabel} at RM ${formatCurrency(winner.costPerResult)} each in ${input.dateRange.currentLabel}. ${performanceComparedWithLastPeriod} This is the safest place to look for more volume.`,
    successMetric: `${resultLabel}: increase total ${resultLabel} by at least 10% while keeping ${costLabel} below RM ${formatCurrency(winner.costPerResult * 1.1)}.`,
    decisionRule: `Keep the higher budget if ${quoteCampaign(winner.row.campaignName)} adds at least 10% more ${resultLabel} after 7 days and ${costLabel} stays within 10% of the current level. Stop if cost rises faster than volume.`,
  };
}

function createBudgetTrimCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageCostPerResult: number;
  totals: CampaignRow;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  if (input.averageCostPerResult === 0) {
    return null;
  }

  const target = input.snapshots
    .filter((snapshot) => snapshot.costPerResult > input.averageCostPerResult * 1.25 && snapshot.results > 0)
    .sort((left, right) => right.row.spend - left.row.spend)[0];

  if (!target) {
    return null;
  }

  const costLabel = platformCostLabel(input.platform);
  const resultLabel = platformResultLabel(input.platform);
  const accountCost = input.totals.results > 0 ? input.totals.spend / input.totals.results : 0;

  return {
    id: `${input.platform}-trim-budget`,
    score: target.row.spend + (target.costPerResult - input.averageCostPerResult),
    whatToChange: `Reduce daily budget on ${quoteCampaign(target.row.campaignName)} by 15% only.`,
    whyThisMatters: `${quoteCampaign(target.row.campaignName)} spent RM ${formatCurrency(target.row.spend)} in ${input.dateRange.currentLabel} but its ${costLabel.toLowerCase()} was RM ${formatCurrency(target.costPerResult)}, above the account average of RM ${formatCurrency(input.averageCostPerResult)}. This is a controlled budget test on one campaign only.`,
    successMetric: `${costLabel}: bring the account average below RM ${formatCurrency(accountCost * 0.9 || accountCost)} while keeping total ${resultLabel} within 90% of the current level.`,
    decisionRule: `Keep the lower budget if account-wide ${costLabel} improves after 7 days and total ${resultLabel} stay within 10% of the current period. Stop if total ${resultLabel} drop too sharply.`,
  };
}

function createConversionRateCandidate(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  averageConversionRate: number;
  averageCostPerResult: number;
  dateRange: DateRangeConfig;
}): CandidateInsight | null {
  const target = input.snapshots
    .filter(
      (snapshot) =>
        snapshot.row.clicks >= 20 &&
        snapshot.results > 0 &&
        snapshot.conversionRate < input.averageConversionRate
    )
    .sort((left, right) => right.row.clicks - left.row.clicks)[0];

  if (!target) {
    return null;
  }

  const resultLabel = platformResultLabel(input.platform);
  const costLabel = platformCostLabel(input.platform);
  const targetRate = Math.max(target.conversionRate * 1.15, input.averageConversionRate || target.conversionRate + 1);

  return {
    id: `${input.platform}-offer-test`,
    score: target.row.clicks * Math.max(input.averageConversionRate - target.conversionRate, 0.2),
    whatToChange: `Keep the same audience in ${quoteCampaign(target.row.campaignName)} and test one new offer line only.`,
    whyThisMatters: `${quoteCampaign(target.row.campaignName)} already brought clicks in ${input.dateRange.currentLabel}, but only ${formatPercent(target.conversionRate)} turned into ${resultLabel}. The account average was ${formatPercent(input.averageConversionRate)}. This points to a message issue after the click, not an audience issue.`,
    successMetric: `CVR: raise ${quoteCampaign(target.row.campaignName)} from ${formatPercent(target.conversionRate)} to at least ${formatPercent(targetRate)} while keeping ${costLabel} at or below RM ${formatCurrency(Math.max(target.costPerResult, input.averageCostPerResult))}.`,
    decisionRule: `Keep the new offer line if conversion rate improves by at least 15% after 7 days and ${costLabel} stays flat or lower. Stop if conversion rate stays flat.`,
  };
}

function buildFallbackInsights(input: {
  platform: InsightPlatform;
  snapshots: CampaignSnapshot[];
  dateRange: DateRangeConfig;
  startPriority: number;
}): InsightRow[] {
  const resultLabel = platformResultLabel(input.platform);
  const costLabel = platformCostLabel(input.platform);

  return input.snapshots
    .sort((left, right) => right.row.spend - left.row.spend)
    .slice(0, 3)
    .map((snapshot, index) => ({
      id: `${input.platform}-fallback-${index}`,
      priority: input.startPriority + index,
      whatToChange:
        snapshot.results === 0
          ? `Pause ${quoteCampaign(snapshot.row.campaignName)} for 7 days.`
          : `Duplicate ${quoteCampaign(snapshot.row.campaignName)} and test one new headline only.`,
      whyThisMatters:
        snapshot.results === 0
          ? `${quoteCampaign(snapshot.row.campaignName)} spent RM ${formatCurrency(snapshot.row.spend)} in ${input.dateRange.currentLabel} and did not produce any ${resultLabel}.`
          : `${quoteCampaign(snapshot.row.campaignName)} is spending RM ${formatCurrency(snapshot.row.spend)} in ${input.dateRange.currentLabel}, so even a small improvement can move account totals.`,
      successMetric:
        snapshot.results === 0
          ? `${costLabel}: lower wasted spend without losing more than 10% of total ${resultLabel}.`
          : `CTR: improve response on ${quoteCampaign(snapshot.row.campaignName)} while holding ${costLabel} steady.`,
      decisionRule:
        snapshot.results === 0
          ? `Keep the pause if total ${resultLabel} stay stable after 7 days.`
          : `Keep the new version if CTR improves after 7 days and ${costLabel} does not get worse by more than 10%.`,
    }));
}

function campaignKey(row: CampaignRow): string {
  return `${row.platform}::${row.campaignType.trim().toLowerCase()}::${row.campaignName.trim().toLowerCase()}`;
}

function donorPriority(snapshot: CampaignSnapshot, averageCostPerResult: number): number {
  if (snapshot.results === 0) {
    return snapshot.row.spend + 1000;
  }

  if (averageCostPerResult === 0) {
    return snapshot.row.spend;
  }

  return snapshot.row.spend + Math.max(snapshot.costPerResult - averageCostPerResult, 0);
}

function quoteCampaign(name: string): string {
  return `"${name}"`;
}

function singularResultLabel(platform: InsightPlatform): string {
  return platform === "meta" ? "result" : "conversion";
}

function platformResultLabel(platform: InsightPlatform): string {
  return platform === "meta" ? "results" : "conversions";
}

function platformCostLabel(platform: InsightPlatform): string {
  return platform === "meta" ? "Cost per result" : "Cost per conversion";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatDeltaSentence(input: {
  label: string;
  delta: number | null;
  currentLabel: string;
  previousLabel: string;
}): string {
  if (input.delta === null) {
    return `There is not enough matching data from ${input.previousLabel} to compare this campaign cleanly.`;
  }

  if (Math.abs(input.delta) < 0.5) {
    return `${capitalize(input.label)} stayed almost flat versus ${input.previousLabel}.`;
  }

  if (input.delta > 0) {
    return `${capitalize(input.label)} were up ${formatPercent(input.delta)} versus ${input.previousLabel}.`;
  }

  return `${capitalize(input.label)} were down ${formatPercent(Math.abs(input.delta))} versus ${input.previousLabel}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
