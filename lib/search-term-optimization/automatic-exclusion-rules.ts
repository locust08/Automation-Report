import { APPROVED_AUTOMATION_CATEGORIES } from "@/lib/search-term-optimization/scoring";
import { stableSearchTermKey } from "@/lib/search-term-optimization/stable-search-term-key";
import type { OptimizationDashboardPayload, OptimizationResult } from "@/lib/search-term-optimization/types";

function signalIsConfirmed(row: OptimizationResult, signal: string) {
  return row.scoreBreakdown.find((item) => item.signal === signal)?.status === "yes";
}

export function isSearchTermDataFresh(row: Pick<OptimizationResult, "dataRetrievedAt">, now = Date.now()) {
  const retrievedAt = Date.parse(row.dataRetrievedAt);
  return Number.isFinite(retrievedAt) && retrievedAt <= now && now - retrievedAt <= 48 * 60 * 60 * 1000;
}

export function automaticExclusionSkipReasons(
  row: OptimizationResult,
  dashboard: Pick<OptimizationDashboardPayload, "source">,
  threshold: number,
) {
  const reasons: string[] = [];
  if (row.proposedAction !== "negative exact") reasons.push("Action is not negative exact");
  if (!Number.isInteger(threshold) || threshold < 90 || threshold > 100) reasons.push("Automatic threshold must be between 90 and 100");
  if (!Number.isFinite(row.safetyScore) || row.safetyScore > 100 || row.safetyScore < threshold) reasons.push(`Safety score ${row.safetyScore} does not meet ${threshold}–100`);
  if (row.conversions !== 0) reasons.push("Search term has conversions");
  if (row.qualifiedLeads === null) reasons.push("Qualified-lead signal is unknown");
  else if (row.qualifiedLeads !== 0) reasons.push("Search term has qualified leads");
  if (!dashboard.source.fresh || !isSearchTermDataFresh(row)) reasons.push("Google Ads data is stale or its retrieval timestamp is invalid");
  if (!APPROVED_AUTOMATION_CATEGORIES.has(row.mismatchCategory)) reasons.push("Mismatch category is not approved for automation");
  if (!signalIsConfirmed(row, "No live positive-keyword overlap")) reasons.push("Positive-keyword overlap was not explicitly ruled out");
  if (!signalIsConfirmed(row, "Search intent is absent from the landing page")) reasons.push("Landing-page mismatch was not explicitly confirmed");
  if (signalIsConfirmed(row, "Meaning is broad or ambiguous")) reasons.push("Search term meaning is ambiguous");
  if (signalIsConfirmed(row, "PM or client confirmation is required")) reasons.push("PM or client confirmation is required");
  if (!row.adGroupId || !/^\d+$/.test(row.adGroupId)) reasons.push("Google Ads ad group ID is unavailable");
  if (!row.searchTerm.trim() || row.searchTerm.length > 80 || row.searchTerm.trim().split(/\s+/).length > 10) reasons.push("Keyword exceeds Google Ads length or word limits");
  if (row.addedExcludedStatus?.toUpperCase() === "EXCLUDED") reasons.push("Search term is already excluded");
  if (row.previousDecision || row.reviewDecision || row.reviewStatus) reasons.push("A previous review decision is unresolved");
  for (const failure of row.hardGateFailures) {
    if (failure === "Account automation is disabled" || failure === "Required signal is unknown: qualified-lead signal") continue;
    if (!reasons.includes(failure)) reasons.push(failure);
  }
  return reasons;
}

/** Refresh cached eligibility without changing published/failed outcomes or reviews. */
export function applyAutomaticExclusionPolicy(
  row: OptimizationResult,
  dashboard: Pick<OptimizationDashboardPayload, "source">,
  threshold: number,
): OptimizationResult {
  // Lead data can be added after analysis. Keep its existing weighted signal current.
  const scoreBreakdown = row.scoreBreakdown.map(item => item.signal === "No available qualified-lead signal"
    ? { ...item, applied: row.qualifiedLeads === 0, status: row.qualifiedLeads == null ? "unknown" as const : row.qualifiedLeads === 0 ? "yes" as const : "no" as const }
    : item);
  const safetyScore = Math.max(0, Math.min(100, scoreBreakdown.reduce((sum, item) => sum + (item.applied ? item.points : 0), 0)));
  const cleaned = { ...row, scoreBreakdown, safetyScore, hardGateFailures: row.hardGateFailures.filter(failure =>
    failure !== "Account automation is disabled" &&
    failure !== "Required signal is unknown: qualified-lead signal" &&
    failure !== "Search term has qualified leads") };
  if (row.qualifiedLeads == null) cleaned.hardGateFailures.push("Required signal is unknown: qualified-lead signal");
  else if (row.qualifiedLeads !== 0) cleaned.hardGateFailures.push("Search term has qualified leads");
  const executionEligibility = isAutomaticExclusionEligible(cleaned, dashboard, threshold);
  return {
    ...cleaned,
    executionEligibility,
    safetyBand: safetyScore >= threshold ? "auto-safe" : safetyScore >= 60 ? "review-recommended" : "no-automatic-action",
    executionStatus: row.executionStatus === "published" || row.executionStatus === "failed" ? row.executionStatus
      : executionEligibility ? "eligible" : row.proposedAction === "no action" ? "not-eligible" : "review-required",
  };
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
