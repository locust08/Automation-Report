import { APPROVED_AUTOMATION_CATEGORIES } from "@/lib/search-term-optimization/scoring";
import { stableSearchTermKey } from "@/lib/search-term-optimization/stable-search-term-key";
import type { OptimizationDashboardPayload, OptimizationResult } from "@/lib/search-term-optimization/types";

export const AUTOMATIC_EXCLUSION_RUN_CAP = 25;

function signalIsConfirmed(row: OptimizationResult, signal: string) {
  return row.scoreBreakdown.find((item) => item.signal === signal)?.status === "yes";
}

export function automaticExclusionSkipReasons(
  row: OptimizationResult,
  dashboard: Pick<OptimizationDashboardPayload, "source">,
  threshold: number,
) {
  const reasons: string[] = [];
  if (row.proposedAction !== "negative exact") reasons.push("Action is not negative exact");
  if (!Number.isInteger(threshold) || threshold < 90 || threshold > 100) reasons.push("Automatic threshold must be between 90 and 100");
  if (row.safetyScore < threshold) reasons.push(`Safety score ${row.safetyScore} is below ${threshold}`);
  if (row.conversions !== 0) reasons.push("Search term has conversions");
  if (row.qualifiedLeads === null) reasons.push("Qualified-lead signal is unknown");
  else if (row.qualifiedLeads !== 0) reasons.push("Search term has qualified leads");
  if (!dashboard.source.fresh) reasons.push("Google Ads data is stale");
  if (!APPROVED_AUTOMATION_CATEGORIES.has(row.mismatchCategory)) reasons.push("Mismatch category is not approved for automation");
  if (!signalIsConfirmed(row, "No live positive-keyword overlap")) reasons.push("Positive-keyword overlap was not explicitly ruled out");
  if (!signalIsConfirmed(row, "Search intent is absent from the landing page")) reasons.push("Landing-page mismatch was not explicitly confirmed");
  if (signalIsConfirmed(row, "Meaning is broad or ambiguous")) reasons.push("Search term meaning is ambiguous");
  if (signalIsConfirmed(row, "PM or client confirmation is required")) reasons.push("PM or client confirmation is required");
  if (!row.adGroupId || !/^\d+$/.test(row.adGroupId)) reasons.push("Google Ads ad group ID is unavailable");
  if (row.addedExcludedStatus?.toUpperCase() === "EXCLUDED") reasons.push("Search term is already excluded");
  if (row.previousDecision || row.reviewDecision || row.reviewStatus) reasons.push("A previous review decision is unresolved");
  for (const failure of row.hardGateFailures) {
    if (failure === "Account automation is disabled" || failure === "Required signal is unknown: qualified-lead signal") continue;
    if (!reasons.includes(failure)) reasons.push(failure);
  }
  return reasons;
}

export function isAutomaticExclusionEligible(
  row: OptimizationResult,
  dashboard: Pick<OptimizationDashboardPayload, "source">,
  threshold: number,
) {
  return automaticExclusionSkipReasons(row, dashboard, threshold).length === 0;
}

export function selectAutomaticExclusionCandidates(
  rows: OptimizationResult[],
  dashboard: Pick<OptimizationDashboardPayload, "source">,
  threshold: number,
) {
  return rows
    .filter((row) => isAutomaticExclusionEligible(row, dashboard, threshold))
    .sort((left, right) => right.safetyScore - left.safetyScore || right.spend - left.spend || stableSearchTermKey(left).localeCompare(stableSearchTermKey(right)));
}
