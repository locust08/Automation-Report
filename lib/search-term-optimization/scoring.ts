import type { ScoreBreakdownItem, SafetyBand } from "@/lib/search-term-optimization/types";

export const APPROVED_AUTOMATION_CATEGORIES = new Set([
  "job_intent",
  "portal_payment",
  "template_download",
  "competitor_brand",
  "wrong_product",
  "wrong_service",
  "unsupported_location",
]);

export type SafetySignals = {
  mismatchIsClear: boolean;
  mismatchCategory: string;
  conversions: number;
  noPositiveKeywordOverlap: boolean | null;
  landingIntentAbsent: boolean | null;
  noQualifiedLeadSignal: boolean | null;
  hasPaidClicksOrSpend: boolean;
  meaningIsAmbiguous: boolean;
  requiresConfirmation: boolean;
};

const SCORE_RULES: Array<{
  signal: string;
  points: number;
  read: (signals: SafetySignals) => boolean | null;
}> = [
  { signal: "AI identifies a clear mismatch", points: 30, read: (s) => s.mismatchIsClear },
  {
    signal: "Mismatch category is approved for automation",
    points: 20,
    read: (s) => APPROVED_AUTOMATION_CATEGORIES.has(s.mismatchCategory),
  },
  { signal: "Search term has zero conversions", points: 15, read: (s) => s.conversions === 0 },
  { signal: "No live positive-keyword overlap", points: 10, read: (s) => s.noPositiveKeywordOverlap },
  { signal: "Search intent is absent from the landing page", points: 10, read: (s) => s.landingIntentAbsent },
  { signal: "No available qualified-lead signal", points: 10, read: (s) => s.noQualifiedLeadSignal },
  { signal: "Term has produced paid clicks or spend", points: 5, read: (s) => s.hasPaidClicksOrSpend },
  { signal: "Meaning is broad or ambiguous", points: -30, read: (s) => s.meaningIsAmbiguous },
  { signal: "PM or client confirmation is required", points: -50, read: (s) => s.requiresConfirmation },
];

export function calculateSafetyScore(signals: SafetySignals) {
  const breakdown: ScoreBreakdownItem[] = SCORE_RULES.map((rule) => {
    const value = rule.read(signals);
    return {
      signal: rule.signal,
      points: rule.points,
      applied: value === true,
      status: value === null ? "unknown" : value ? "yes" : "no",
    };
  });
  const total = Math.max(
    0,
    Math.min(100, breakdown.reduce((sum, item) => sum + (item.applied ? item.points : 0), 0)),
  );

  return { total, band: safetyBand(total), breakdown };
}

export function safetyBand(score: number): SafetyBand {
  if (score >= 90) return "auto-safe";
  if (score >= 60) return "review-recommended";
  return "no-automatic-action";
}

export type HardGateInput = {
  automationEnabled: boolean;
  proposedAction: string;
  conversions: number;
  landingContextLoaded: boolean;
  googleAdsDataFresh: boolean;
  alreadyNegative: boolean;
  unresolvedPreviousDecision: boolean;
  validLength: boolean;
  exactMatchOnly: boolean;
  unknownRequiredSignals: string[];
};

export function evaluateHardGates(input: HardGateInput): string[] {
  const failures: string[] = [];
  if (!input.automationEnabled) failures.push("Account automation is disabled");
  if (input.proposedAction !== "negative exact") failures.push("Action is not negative exact");
  if (input.conversions !== 0) failures.push("Search term has conversions");
  if (!input.landingContextLoaded) failures.push("Landing-page context did not load");
  if (!input.googleAdsDataFresh) failures.push("Google Ads data is stale");
  if (input.alreadyNegative) failures.push("Search term is already negative");
  if (input.unresolvedPreviousDecision) failures.push("A previous decision is unresolved");
  if (!input.validLength) failures.push("Keyword exceeds Google Ads length or word limits");
  if (!input.exactMatchOnly) failures.push("Action is not exact match only");
  failures.push(...input.unknownRequiredSignals.map((signal) => `Required signal is unknown: ${signal}`));
  return failures;
}
