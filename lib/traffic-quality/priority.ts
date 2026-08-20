export type TrafficQualityPriority = "critical" | "high" | "medium" | "normal" | "kiv";
export type TrafficQualityCadence = "immediate" | "weekly" | "biweekly" | "monthly" | "manual";

export type PriorityThresholds = {
  spendThreshold: number;
  clicksThreshold: number;
  invalidLeadsThreshold: number;
  complaintsThreshold: number;
  recencyDays: number;
  crossCampaignThreshold: number;
  crossClientThreshold: number;
};

export type PriorityInput = Partial<{
  spend: number;
  clicks: number;
  spamLeads: number;
  totalLeads: number;
  invalidLeads: number;
  qualifiedLeads: number;
  complaints: number;
  daysSinceDetected: number;
  aiConfidence: number;
  crossCampaignRecurrence: number;
  crossClientRecurrence: number;
  spendRatio: number;
  clicksRatio: number;
  spamLeadRate: number;
  invalidLeadsRatio: number;
  hasNoQualifiedLeads: boolean;
  complaintRatio: number;
  recencyRatio: number;
  crossCampaignRecurrenceRatio: number;
  crossClientRecurrenceRatio: number;
  manualKiv: boolean;
}>;

const DEFAULT_THRESHOLDS: PriorityThresholds = {
  spendThreshold: 100,
  clicksThreshold: 25,
  invalidLeadsThreshold: 2,
  complaintsThreshold: 1,
  recencyDays: 7,
  crossCampaignThreshold: 2,
  crossClientThreshold: 2,
};

const WEIGHTS = [
  ["Spend", 20],
  ["Clicks", 10],
  ["Spam-lead rate", 20],
  ["Invalid leads", 10],
  ["No qualified leads", 10],
  ["Client complaints", 15],
  ["Recency", 5],
  ["AI confidence", 5],
  ["Cross-campaign recurrence", 5],
  ["Cross-client recurrence", 5],
] as const;

function ratio(value: number | undefined, threshold: number) {
  if (!Number.isFinite(value) || threshold <= 0) return 0;
  return clamp((value ?? 0) / threshold);
}

function clamp(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value ?? 0));
}

export function calculateTrafficQualityPriority(input: PriorityInput, overrides: Partial<PriorityThresholds> = {}) {
  if (input.manualKiv) return { score: 0, priority: "kiv" as const, breakdown: [] };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...overrides };
  const factors = [
    input.spendRatio ?? ratio(input.spend, thresholds.spendThreshold),
    input.clicksRatio ?? ratio(input.clicks, thresholds.clicksThreshold),
    input.spamLeadRate ?? ratio(input.spamLeads, Math.max(1, input.totalLeads ?? 0)),
    input.invalidLeadsRatio ?? ratio(input.invalidLeads, thresholds.invalidLeadsThreshold),
    input.hasNoQualifiedLeads ?? (input.qualifiedLeads === 0),
    input.complaintRatio ?? ratio(input.complaints, thresholds.complaintsThreshold),
    input.recencyRatio ?? (input.daysSinceDetected === undefined ? 0 : clamp((thresholds.recencyDays - input.daysSinceDetected + 1) / thresholds.recencyDays)),
    clamp((input.aiConfidence ?? 0) / 100),
    input.crossCampaignRecurrenceRatio ?? ratio(input.crossCampaignRecurrence, thresholds.crossCampaignThreshold),
    input.crossClientRecurrenceRatio ?? ratio(input.crossClientRecurrence, thresholds.crossClientThreshold),
  ];
  const breakdown = WEIGHTS.map(([signal, weight], index) => ({
    signal,
    weight,
    factor: typeof factors[index] === "boolean" ? (factors[index] ? 1 : 0) : clamp(factors[index] as number),
    points: Math.round(weight * (typeof factors[index] === "boolean" ? (factors[index] ? 1 : 0) : clamp(factors[index] as number))),
  }));
  const score = Math.max(0, Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0)));
  return { score, priority: priorityBand(score), breakdown };
}

export function priorityBand(score: number): Exclude<TrafficQualityPriority, "kiv"> {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "normal";
}

export function priorityCadence(priority: TrafficQualityPriority): TrafficQualityCadence {
  return ({ critical: "immediate", high: "weekly", medium: "biweekly", normal: "monthly", kiv: "manual" } as const)[priority];
}
