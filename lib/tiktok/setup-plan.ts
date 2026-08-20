import crypto from "node:crypto";

import { z } from "zod";

export const TIKTOK_SETUP_PLAN_SCHEMA_VERSION = 3 as const;
export const TIKTOK_DYNAMIC_DAILY_MAX_MULTIPLIER = 1.25 as const;

export const TikTokSetupObjectiveSchema = z.enum([
  "TRAFFIC",
  "WEB_CONVERSIONS",
  "LEAD_GENERATION",
]);

export type TikTokSetupObjective = z.infer<typeof TikTokSetupObjectiveSchema>;

const v1ObjectiveInputSchema = z.union([
  TikTokSetupObjectiveSchema,
  z.literal("VIDEO_VIEWS").transform((): never => {
    throw new Error(
      "VIDEO_VIEWS is excluded from the v1 setup workflow because its dynamic daily budget mode is allowlist-only and v1 excludes lifetime budgets",
    );
  }),
]);

const nonEmptyText = z.string().trim().min(1);
const providerId = z.string().trim().regex(/^\d{1,64}$/, "Expected a numeric TikTok provider ID");
const opaqueProviderId = z.string().trim().regex(
  /^[A-Za-z0-9_-]{1,128}$/,
  "Expected a TikTok provider resource ID",
);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true });
const positiveMoney = z.number().finite().positive();
const positiveWholeMoney = z.number().int().positive();
const ianaTimeZone = z.string().trim().min(1).refine((value) => {
  if (!/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Expected a valid IANA timezone");
const httpsUrl = z.string().trim().url().refine(
  (value) => new URL(value).protocol === "https:",
  "Website destination URL must use HTTPS",
);

const approvalSchema = z.object({
  status: z.literal("APPROVED"),
  reference: nonEmptyText,
  approvedBy: nonEmptyText,
  approvedAt: isoDateTime,
}).strict();

const advertiserSchema = z.object({
  id: providerId,
  name: nonEmptyText,
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Expected an ISO 4217 currency code"),
  timezone: ianaTimeZone,
}).strict();

const mediaPlanSchema = z.object({
  id: nonEmptyText,
  clientName: nonEmptyText,
  startDate: dateOnly,
  endDate: dateOnly,
  totalApprovedBudget: positiveMoney,
  allocatedBudget: positiveMoney,
  approval: approvalSchema,
}).strict();

const briefSchema = z.object({
  id: nonEmptyText,
  productOrOffer: nonEmptyText,
  audienceSummary: nonEmptyText,
  objective: v1ObjectiveInputSchema,
  primaryKpi: nonEmptyText,
  primaryKpiTarget: z.number().finite().positive().optional(),
}).strict();

const targetingSchema = z.object({
  validation: z.object({
    status: z.literal("VALIDATED"),
    source: z.literal("TIKTOK_API"),
    advertiserId: providerId,
    validatedAt: isoDateTime,
  }).strict(),
  locationIds: z.array(providerId).min(1),
  placements: z.tuple([z.literal("PLACEMENT_TIKTOK")]),
  searchResultEnabled: z.literal(false),
  gender: z.enum(["GENDER_UNLIMITED", "GENDER_MALE", "GENDER_FEMALE"]),
  ageGroups: z.array(nonEmptyText).default([]),
  languageCodes: z.array(nonEmptyText).default([]),
  interestCategoryIds: z.array(providerId).default([]),
  audienceIds: z.array(providerId).default([]),
}).strict();

const trafficSettingsSchema = z.object({
  objective: z.literal("TRAFFIC"),
  destination: z.literal("WEBSITE"),
  destinationUrl: httpsUrl,
  optimizationGoal: z.enum(["CLICK", "TRAFFIC_LANDING_PAGE_VIEW"]),
  billingEvent: z.enum(["CPC", "OCPM"]),
}).strict().superRefine((value, context) => {
  if (value.optimizationGoal === "CLICK" && value.billingEvent !== "CPC") {
    context.addIssue({ code: "custom", path: ["billingEvent"], message: "CLICK optimization requires CPC billing" });
  }
  if (value.optimizationGoal === "TRAFFIC_LANDING_PAGE_VIEW" && value.billingEvent !== "OCPM") {
    context.addIssue({ code: "custom", path: ["billingEvent"], message: "TRAFFIC_LANDING_PAGE_VIEW optimization requires OCPM billing" });
  }
});

const webConversionsSettingsSchema = z.object({
  objective: z.literal("WEB_CONVERSIONS"),
  destination: z.literal("WEBSITE"),
  destinationUrl: httpsUrl,
  optimizationGoal: z.literal("CONVERT"),
  billingEvent: z.literal("OCPM"),
  pixelId: providerId,
  optimizationEvent: nonEmptyText,
}).strict();

const websiteLeadSettingsSchema = z.object({
  objective: z.literal("LEAD_GENERATION"),
  destination: z.literal("WEBSITE"),
  destinationUrl: httpsUrl,
  promotionTargetType: z.literal("EXTERNAL_WEBSITE"),
  optimizationGoal: z.literal("LEAD_GENERATION"),
  billingEvent: z.literal("OCPM"),
  pixelId: providerId,
  optimizationEvent: nonEmptyText,
}).strict();

const instantFormLeadSettingsSchema = z.object({
  objective: z.literal("LEAD_GENERATION"),
  destination: z.literal("INSTANT_FORM"),
  promotionTargetType: z.literal("INSTANT_PAGE"),
  optimizationGoal: z.literal("LEAD_GENERATION"),
  billingEvent: z.literal("OCPM"),
  pageId: providerId,
}).strict();

const leadSettingsSchema = z.union([websiteLeadSettingsSchema, instantFormLeadSettingsSchema]);

export const TikTokObjectiveSettingsSchema = z.union([
  trafficSettingsSchema,
  webConversionsSettingsSchema,
  leadSettingsSchema,
]);

const adSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: nonEmptyText.max(512),
  format: z.literal("SINGLE_VIDEO"),
  creativeMode: z.literal("REGULAR"),
  identity: z.object({
    type: z.literal("CUSTOMIZED_USER"),
    identityId: opaqueProviderId,
  }).strict(),
  video: z.object({
    videoId: opaqueProviderId,
  }).strict(),
  adText: nonEmptyText.max(100),
  callToAction: nonEmptyText,
}).strict();

const adGroupBaseShape = {
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: nonEmptyText.max(512),
  startDate: dateOnly,
  endDate: dateOnly,
  bidType: z.literal("BID_TYPE_NO_BID"),
  targeting: targetingSchema,
  objectiveSettings: TikTokObjectiveSettingsSchema,
  ads: z.array(adSchema).min(1),
};

const dynamicDailyAdGroupSchema = z.object({
  ...adGroupBaseShape,
  budgetMode: z.literal("BUDGET_MODE_DYNAMIC_DAILY_BUDGET"),
  dailyBudget: positiveWholeMoney,
}).strict();

const adGroupSchema = dynamicDailyAdGroupSchema;

const campaignSchema = z.object({
  name: nonEmptyText.max(512),
  campaignType: z.literal("AUCTION"),
  automationMode: z.literal("MANUAL"),
  budgetOwner: z.literal("ADGROUP"),
  specialIndustries: z.array(nonEmptyText).default([]),
}).strict();

export const TikTokSetupBuilderInputSchema = z.object({
  advertiser: advertiserSchema,
  brief: briefSchema,
  mediaPlan: mediaPlanSchema,
  campaign: campaignSchema,
  adGroups: z.array(adGroupSchema).min(1),
}).strict().superRefine((value, context) => {
  validateDateRange(value.mediaPlan.startDate, value.mediaPlan.endDate, context, ["mediaPlan"]);
  if (value.mediaPlan.allocatedBudget > value.mediaPlan.totalApprovedBudget) {
    context.addIssue({
      code: "custom",
      path: ["mediaPlan", "allocatedBudget"],
      message: "Allocated budget cannot exceed the approved media-plan budget",
    });
  }

  const groupKeys = new Set<string>();
  const adKeys = new Set<string>();
  let providerBudgetEnvelope = 0;
  value.adGroups.forEach((group, groupIndex) => {
    validateDateRange(group.startDate, group.endDate, context, ["adGroups", groupIndex]);
    if (group.startDate < value.mediaPlan.startDate || group.endDate > value.mediaPlan.endDate) {
      context.addIssue({
        code: "custom",
        path: ["adGroups", groupIndex],
        message: "Ad-group schedule must stay inside the approved media-plan period",
      });
    }
    if (group.objectiveSettings.objective !== value.brief.objective) {
      context.addIssue({
        code: "custom",
        path: ["adGroups", groupIndex, "objectiveSettings", "objective"],
        message: "Every ad group must use the approved brief objective",
      });
    }
    if (group.targeting.validation.advertiserId !== value.advertiser.id) {
      context.addIssue({
        code: "custom",
        path: ["adGroups", groupIndex, "targeting", "validation", "advertiserId"],
        message: "Targeting validation must belong to the selected advertiser",
      });
    }
    if (groupKeys.has(group.key)) {
      context.addIssue({ code: "custom", path: ["adGroups", groupIndex, "key"], message: "Ad-group keys must be unique" });
    }
    groupKeys.add(group.key);
    providerBudgetEnvelope += calculateTikTokAdGroupBudget(group).providerBudgetEnvelope;
    group.ads.forEach((ad, adIndex) => {
      if (adKeys.has(ad.key)) {
        context.addIssue({ code: "custom", path: ["adGroups", groupIndex, "ads", adIndex, "key"], message: "Ad keys must be unique across the revision" });
      }
      adKeys.add(ad.key);
    });
  });
  if (providerBudgetEnvelope > value.mediaPlan.allocatedBudget + 1e-9) {
    context.addIssue({
      code: "custom",
      path: ["adGroups"],
      message: `Provider budget envelope ${providerBudgetEnvelope} exceeds allocated budget ${value.mediaPlan.allocatedBudget}`,
    });
  }
});

export type TikTokSetupBuilderInput = z.infer<typeof TikTokSetupBuilderInputSchema>;

const calculationsSchema = z.object({
  budgetPolicy: z.object({
    id: z.literal("TIKTOK_DYNAMIC_DAILY_PER_DAY_125_V1"),
    dailyUpperBoundBps: z.literal(12_500),
    weeklyNettingApplied: z.literal(false),
    assumption: z.literal("UNCHANGED_BUDGET_AND_SCHEDULE"),
  }).strict(),
  mediaPlanDays: z.number().int().positive(),
  nominalPlannedSpend: z.number().finite().nonnegative(),
  providerBudgetEnvelope: z.number().finite().nonnegative(),
  overdeliveryHeadroom: z.number().finite().nonnegative(),
  remainingAllocationAfterEnvelope: z.number().finite().nonnegative(),
}).strict();

const revisionBodySchema = z.object({
  schemaVersion: z.literal(TIKTOK_SETUP_PLAN_SCHEMA_VERSION),
  platform: z.literal("TIKTOK"),
  plan: TikTokSetupBuilderInputSchema,
  calculations: calculationsSchema,
}).strict();

export const TikTokSetupRevisionSchema = revisionBodySchema.extend({
  revisionId: z.string().regex(/^ttrev_[a-f0-9]{20}$/),
  revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type TikTokSetupRevision = z.infer<typeof TikTokSetupRevisionSchema>;

function parseDate(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return timestamp;
}

export function inclusiveDays(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start > end) throw new Error(`Start date ${startDate} is after end date ${endDate}`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function calculateTikTokAdGroupBudget(
  group: z.infer<typeof adGroupSchema>,
) {
  const nominalPlannedSpend = inclusiveDays(group.startDate, group.endDate) * group.dailyBudget;
  return {
    nominalPlannedSpend,
    providerBudgetEnvelope: nominalPlannedSpend * TIKTOK_DYNAMIC_DAILY_MAX_MULTIPLIER,
  };
}

function validateDateRange(
  startDate: string,
  endDate: string,
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  try {
    inclusiveDays(startDate, endDate);
  } catch (error) {
    context.addIssue({
      code: "custom",
      path,
      message: error instanceof Error ? error.message : "Invalid date range",
    });
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizePlan(input: TikTokSetupBuilderInput): TikTokSetupBuilderInput {
  return {
    ...input,
    campaign: {
      ...input.campaign,
      specialIndustries: uniqueSorted(input.campaign.specialIndustries),
    },
    adGroups: [...input.adGroups]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((group) => ({
        ...group,
        targeting: {
          ...group.targeting,
          locationIds: uniqueSorted(group.targeting.locationIds),
          ageGroups: uniqueSorted(group.targeting.ageGroups),
          languageCodes: uniqueSorted(group.targeting.languageCodes),
          interestCategoryIds: uniqueSorted(group.targeting.interestCategoryIds),
          audienceIds: uniqueSorted(group.targeting.audienceIds),
        },
        ads: [...group.ads].sort((left, right) => left.key.localeCompare(right.key)),
      })),
  };
}

export function canonicalTikTokSetupValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalTikTokSetupValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalTikTokSetupValue(child)]),
  );
}

export function hashTikTokSetupValue(value: unknown): string {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalTikTokSetupValue(value)))
    .digest("hex");
}

function revisionBody(revision: TikTokSetupRevision) {
  return {
    schemaVersion: revision.schemaVersion,
    platform: revision.platform,
    plan: revision.plan,
    calculations: revision.calculations,
  };
}

function calculateTikTokSetupPlanTotals(plan: TikTokSetupBuilderInput) {
  const budgetTotals = plan.adGroups.reduce((totals, group) => {
    const budget = calculateTikTokAdGroupBudget(group);
    return {
      nominalPlannedSpend: totals.nominalPlannedSpend + budget.nominalPlannedSpend,
      providerBudgetEnvelope: totals.providerBudgetEnvelope + budget.providerBudgetEnvelope,
    };
  }, { nominalPlannedSpend: 0, providerBudgetEnvelope: 0 });
  return calculationsSchema.parse({
    budgetPolicy: {
      id: "TIKTOK_DYNAMIC_DAILY_PER_DAY_125_V1",
      dailyUpperBoundBps: 12_500,
      weeklyNettingApplied: false,
      assumption: "UNCHANGED_BUDGET_AND_SCHEDULE",
    },
    mediaPlanDays: inclusiveDays(plan.mediaPlan.startDate, plan.mediaPlan.endDate),
    nominalPlannedSpend: budgetTotals.nominalPlannedSpend,
    providerBudgetEnvelope: budgetTotals.providerBudgetEnvelope,
    overdeliveryHeadroom: budgetTotals.providerBudgetEnvelope - budgetTotals.nominalPlannedSpend,
    remainingAllocationAfterEnvelope: plan.mediaPlan.allocatedBudget - budgetTotals.providerBudgetEnvelope,
  });
}

export function buildTikTokSetupRevision(input: unknown): TikTokSetupRevision {
  const parsed = TikTokSetupBuilderInputSchema.parse(input);
  const plan = normalizePlan(parsed);
  const body = revisionBodySchema.parse({
    schemaVersion: TIKTOK_SETUP_PLAN_SCHEMA_VERSION,
    platform: "TIKTOK",
    plan,
    calculations: calculateTikTokSetupPlanTotals(plan),
  });
  const revisionHash = hashTikTokSetupValue(body);
  return TikTokSetupRevisionSchema.parse({
    ...body,
    revisionId: `ttrev_${revisionHash.slice(0, 20)}`,
    revisionHash,
  });
}

export function verifyTikTokSetupRevision(input: unknown): TikTokSetupRevision {
  const revision = TikTokSetupRevisionSchema.parse(input);
  const expectedCalculations = calculateTikTokSetupPlanTotals(revision.plan);
  if (hashTikTokSetupValue(revision.calculations) !== hashTikTokSetupValue(expectedCalculations)) {
    throw new Error("TikTok setup revision integrity check failed: derived calculations are inconsistent with the approved plan");
  }
  const expectedHash = hashTikTokSetupValue(revisionBody(revision));
  if (revision.revisionHash !== expectedHash || revision.revisionId !== `ttrev_${expectedHash.slice(0, 20)}`) {
    throw new Error("TikTok setup revision integrity check failed");
  }
  return revision;
}

