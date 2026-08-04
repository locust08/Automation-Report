import type {
  SearchTermMismatchCategory,
  SearchTermSafetyBand,
  SearchTermSafetyInput,
  SearchTermSafetyResult,
  SafetyScoreSignal,
} from "@/lib/search-term-optimization/types";

export const AUTO_SAFE_SCORE = 90;
const AUTOMATION_CATEGORIES = new Set<SearchTermMismatchCategory>([
  "competitor_brand",
  "wrong_product",
  "wrong_service",
  "portal_navigation",
  "stable_irrelevant_intent",
  "unsupported_location",
]);

export function calculateSearchTermSafety(input: SearchTermSafetyInput): SearchTermSafetyResult {
  const signals: SafetyScoreSignal[] = [
    signal("clear_mismatch", "AI identified a clear mismatch", 30, input.mismatchIsClear),
    signal(
      "approved_category",
      "Mismatch category is approved for automation",
      20,
      AUTOMATION_CATEGORIES.has(input.mismatchCategory)
    ),
    signal("zero_conversions", "Search term has zero conversions", 15, input.conversions === 0),
    signal(
      "no_positive_overlap",
      "No live positive-keyword overlap",
      10,
      input.hasPositiveKeywordOverlap === false
    ),
    signal(
      "absent_from_landing_page",
      "Intent is absent from the landing page",
      10,
      input.absentFromLandingPage === true
    ),
    signal(
      "no_qualified_leads",
      "No available qualified-lead signal",
      10,
      input.qualifiedLeads === null || input.qualifiedLeads === 0
    ),
    signal("paid_activity", "Term produced paid clicks or spend", 5, input.clicks > 0 || input.cost > 0),
    signal("ambiguous", "Meaning is broad or ambiguous", -30, input.ambiguous),
    signal(
      "confirmation_required",
      "PM or client confirmation is required",
      -50,
      input.clientConfirmationRequired
    ),
  ];

  const safetyScore = clamp(signals.reduce((total, item) => total + (item.applied ? item.points : 0), 0));
  const safetyBand: SearchTermSafetyBand =
    safetyScore >= AUTO_SAFE_SCORE
      ? "auto_safe"
      : safetyScore >= 60
        ? "review_recommended"
        : "no_automatic_action";
  const hardGateFailures = evaluateHardGates(input);

  return {
    safetyScore,
    safetyBand,
    scoreBreakdown: signals,
    hardGateFailures,
    executionEligibility: safetyScore >= AUTO_SAFE_SCORE && hardGateFailures.length === 0,
  };
}

function evaluateHardGates(input: SearchTermSafetyInput): string[] {
  const failures: string[] = [];
  if (!input.automationEnabled) failures.push("Automatic exclusion is disabled for this account.");
  if (input.proposedAction !== "negative exact") failures.push("Only negative exact actions can run automatically.");
  if (input.conversions !== 0) failures.push("The search term has conversions.");
  if (!input.landingPageContextLoaded) failures.push("Landing-page context is unavailable.");
  if (!input.dataFresh) failures.push("Google Ads data is stale.");
  if (input.alreadyNegative) failures.push("The search term is already negative.");
  if (input.hasUnresolvedDecision) failures.push("A previous decision is unresolved.");
  if (input.matchType !== "EXACT") failures.push("Automatic actions must use exact match.");
  if (input.hasPositiveKeywordOverlap === null) failures.push("Positive-keyword overlap is unknown.");
  if (input.absentFromLandingPage === null) failures.push("Landing-page overlap is unknown.");
  if (input.searchTerm.length > 80) failures.push("Search term exceeds 80 characters.");
  if (input.searchTerm.trim().split(/\s+/).filter(Boolean).length > 10) failures.push("Search term exceeds 10 words.");
  return failures;
}

function signal(key: string, label: string, points: number, applied: boolean): SafetyScoreSignal {
  return { key, label, points, applied };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
