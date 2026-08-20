import { z } from "zod";

export const TRAFFIC_QUALITY_CLASSIFICATIONS = [
  "Highly relevant",
  "Relevant",
  "Low intent",
  "Research intent",
  "Job-seeking intent",
  "Free or cheap intent",
  "Wrong service",
  "Wrong location",
  "Competitor-related",
  "Existing customer support query",
  "Spam or suspicious",
  "Unclear or human review required",
] as const;

export const TRAFFIC_QUALITY_ACTIONS = ["keep", "exclude", "review"] as const;
export const NEGATIVE_MATCH_TYPES = ["exact", "phrase", "broad"] as const;

const recommendationSchema = z.object({
  classification: z.enum(TRAFFIC_QUALITY_CLASSIFICATIONS),
  recommendedAction: z.enum(TRAFFIC_QUALITY_ACTIONS),
  recommendedNegativeMatchType: z.enum(NEGATIVE_MATCH_TYPES).nullable(),
  confidence: z.number().finite().min(0).max(100),
  reason: z.string().trim().min(1).max(2_000),
  clientConfirmationRequired: z.boolean(),
}).superRefine((value, context) => {
  if (value.recommendedAction === "exclude" && value.recommendedNegativeMatchType === null) {
    context.addIssue({ code: "custom", path: ["recommendedNegativeMatchType"], message: "An exclusion requires a negative match type." });
  }
});

export type TrafficQualityRecommendation = z.infer<typeof recommendationSchema>;

const SAFE_FALLBACK: TrafficQualityRecommendation = {
  classification: "Unclear or human review required",
  recommendedAction: "review",
  recommendedNegativeMatchType: null,
  confidence: 0,
  reason: "AI output was unavailable or invalid; human review is required.",
  clientConfirmationRequired: true,
};

export function normalizeTrafficQualityRecommendation(input: unknown): TrafficQualityRecommendation {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : null;
  const normalized = raw ? {
    classification: raw.classification,
    recommendedAction: raw.recommendedAction ?? raw.recommended_action ?? raw.action,
    recommendedNegativeMatchType: raw.recommendedNegativeMatchType ?? raw.recommended_negative_match_type ?? raw.negativeMatchType ?? null,
    confidence: raw.confidence,
    reason: raw.reason ?? raw.explanation,
    clientConfirmationRequired: raw.clientConfirmationRequired ?? raw.client_confirmation_required,
  } : input;
  const parsed = recommendationSchema.safeParse(normalized);
  return parsed.success ? parsed.data : { ...SAFE_FALLBACK };
}
