import { z } from "zod";

export const CAMPAIGN_BUDGET_INCREMENT = {
  google: 0.01,
  meta: 0.01,
  tiktok: 1,
} as const;

const MONEY_SCALE = 1_000_000;
const MAX_CURRENCY_AMOUNT = Number.MAX_SAFE_INTEGER / MONEY_SCALE;

export const M04_BUILD_STATES = [
  "pending_gate_1",
  "gate_1_in_progress",
  "gate_1_failed",
  "qa_failed",
  "reconciliation_required",
  "ready_to_deliver",
  "gate_2_in_progress",
  "gate_2_failed",
  "delivery_unverified",
  "verified",
  "handoff_complete",
  "cancelled",
] as const;

export type M04BuildState = (typeof M04_BUILD_STATES)[number];

export const M04_BUILD_TRANSITIONS = {
  pending_gate_1: ["gate_1_in_progress", "cancelled"],
  gate_1_in_progress: ["gate_1_failed", "qa_failed", "reconciliation_required", "ready_to_deliver"],
  gate_1_failed: ["gate_1_in_progress"],
  qa_failed: ["gate_1_in_progress"],
  reconciliation_required: ["gate_1_in_progress"],
  ready_to_deliver: ["gate_2_in_progress"],
  gate_2_in_progress: ["gate_2_failed", "delivery_unverified", "verified"],
  gate_2_failed: ["gate_2_in_progress"],
  delivery_unverified: ["gate_2_in_progress"],
  verified: ["handoff_complete"],
  handoff_complete: [],
  cancelled: [],
} as const satisfies Record<M04BuildState, readonly M04BuildState[]>;

const nonEmptyText = (maximum = 255) => z.string().trim().min(1).max(maximum);
const identifier = nonEmptyText(255);
const currencyAmount = z.number().finite().nonnegative().max(MAX_CURRENCY_AMOUNT).refine(
  (value) => hasAtMostSixDecimalPlaces(value),
  "Currency values support at most six decimal places.",
);
const positiveCurrencyAmount = currencyAmount.refine((value) => value > 0, "Currency value must be positive.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(
  (value) => isRealIsoDate(value),
  "Use a real calendar date.",
);
const httpUrl = z.string().trim().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Use an HTTP or HTTPS URL.");
const unorderedStrings = (minimum = 0, maximum = 100) => z.array(nonEmptyText()).min(minimum).max(maximum)
  .transform((values) => [...new Set(values)].sort(compareText));

const trackingSchema = z.object({
  url_parameters: z.record(nonEmptyText(100), nonEmptyText(500)).default({}),
  tracking_template: nonEmptyText(2_000).optional(),
  click_tracking_url: httpUrl.optional(),
  impression_tracking_url: httpUrl.optional(),
}).strict();

const commonDraftShape = {
  client_id: z.string().uuid(),
  client_name: nonEmptyText(120),
  ad_account_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  budget_package_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  campaign_name: nonEmptyText(160),
  provider_account_id: identifier,
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use an uppercase ISO currency code."),
  timezone: nonEmptyText(100),
  start_date: isoDate,
  end_date: isoDate,
  allocated_budget: positiveCurrencyAmount,
  destination: httpUrl,
  tracking: trackingSchema,
};

const bidTargetsSchema = z.object({
  target_cpa: positiveCurrencyAmount.optional(),
  target_roas: z.number().positive().max(100_000).optional(),
}).strict();

const googleNetworkSettingsSchema = z.object({
  google_search: z.boolean(),
  search_partners: z.boolean(),
  display_network: z.boolean(),
}).strict();

const googleTargetingSchema = z.object({
  audience_segments: unorderedStrings(0, 100),
  excluded_locations: unorderedStrings(0, 100),
}).strict();

const googleConversionSchema = z.object({
  action_id: identifier,
  category: z.enum(["purchase", "submit_lead_form", "page_view"]),
}).strict();

const googleCampaignStructureSchema = z.object({
  groups: z.array(z.object({
    name: nonEmptyText(255),
    keywords: z.array(z.object({
      text: nonEmptyText(80),
      match_type: z.enum(["exact", "phrase", "broad"]),
    }).strict()).max(2_000).default([]),
  }).strict()).min(1).max(200),
}).strict();

const googleCreativeSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("responsive_search_ad"),
    headlines: z.array(nonEmptyText(30)).min(3).max(15),
    descriptions: z.array(nonEmptyText(90)).min(2).max(4),
    path_1: z.string().trim().max(15).optional(),
    path_2: z.string().trim().max(15).optional(),
  }).strict(),
  z.object({
    format: z.literal("performance_max_asset_group"),
    headlines: z.array(nonEmptyText(30)).min(3).max(15),
    long_headlines: z.array(nonEmptyText(90)).min(1).max(5),
    descriptions: z.array(nonEmptyText(90)).min(2).max(5),
    business_name: nonEmptyText(25),
    image_asset_ids: unorderedStrings(1, 20),
    logo_asset_ids: unorderedStrings(1, 5),
    video_asset_ids: unorderedStrings(0, 5),
  }).strict(),
  z.object({
    format: z.literal("demand_gen_asset"),
    headlines: z.array(nonEmptyText(40)).min(1).max(5),
    descriptions: z.array(nonEmptyText(90)).min(1).max(5),
    business_name: nonEmptyText(25),
    image_asset_ids: unorderedStrings(1, 20),
    video_asset_ids: unorderedStrings(0, 5),
  }).strict(),
]);

const googleDraftObjectSchema = z.object({
  ...commonDraftShape,
  platform: z.literal("google"),
  objective: z.enum(["sales", "leads", "website_traffic"]),
  campaign_type: z.enum(["search", "performance_max", "demand_gen"]),
  bidding_strategy: z.enum([
    "maximize_conversions",
    "target_cpa",
    "maximize_conversion_value",
    "target_roas",
    "maximize_clicks",
  ]),
  bid_targets: bidTargetsSchema,
  network_settings: googleNetworkSettingsSchema,
  locations: unorderedStrings(1, 100),
  languages: unorderedStrings(1, 50),
  placements: z.object({
    inventory: z.enum(["google_search", "all_google_inventory", "discover_youtube_gmail"]),
  }).strict(),
  targeting: googleTargetingSchema,
  conversion: googleConversionSchema,
  campaign_structure: googleCampaignStructureSchema,
  creative: googleCreativeSchema,
}).strict();

const metaPlacementsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("automatic") }).strict(),
  z.object({
    mode: z.literal("manual"),
    values: z.array(z.enum([
      "facebook_feed",
      "facebook_reels",
      "facebook_stories",
      "instagram_feed",
      "instagram_reels",
      "instagram_stories",
    ])).min(1).transform((values) => [...new Set(values)].sort(compareText)),
  }).strict(),
]);

const metaTargetingSchema = z.object({
  countries: unorderedStrings(1, 50),
  age_min: z.number().int().min(18).max(65),
  age_max: z.number().int().min(18).max(65),
  genders: z.array(z.enum(["all", "female", "male"])).min(1).max(2)
    .transform((values) => [...new Set(values)].sort(compareText)),
  interests: unorderedStrings(0, 200),
}).strict().superRefine((value, context) => {
  if (value.age_max < value.age_min) {
    context.addIssue({ code: "custom", path: ["age_max"], message: "Maximum age must not be below minimum age." });
  }
  if (value.genders.includes("all") && value.genders.length > 1) {
    context.addIssue({ code: "custom", path: ["genders"], message: "All genders cannot be combined with another gender." });
  }
});

const metaCreativeSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("image"),
    image_asset_id: identifier,
    primary_text: nonEmptyText(2_200),
    headline: nonEmptyText(255),
    description: nonEmptyText(255).optional(),
    call_to_action: z.enum(["learn_more", "shop_now", "sign_up", "apply_now"]),
  }).strict(),
  z.object({
    format: z.literal("video"),
    video_asset_id: identifier,
    thumbnail_asset_id: identifier.optional(),
    primary_text: nonEmptyText(2_200),
    headline: nonEmptyText(255),
    call_to_action: z.enum(["learn_more", "shop_now", "sign_up", "apply_now"]),
  }).strict(),
  z.object({
    format: z.literal("carousel"),
    primary_text: nonEmptyText(2_200),
    cards: z.array(z.object({
      image_asset_id: identifier,
      headline: nonEmptyText(255),
      destination: httpUrl,
    }).strict()).min(2).max(10),
    call_to_action: z.enum(["learn_more", "shop_now", "sign_up", "apply_now"]),
  }).strict(),
  z.object({
    format: z.literal("existing_post"),
    post_id: identifier,
    eligibility_confirmed: z.literal(true),
  }).strict(),
]);

const metaDraftObjectSchema = z.object({
  ...commonDraftShape,
  platform: z.literal("meta"),
  objective: z.enum(["traffic", "leads", "sales"]),
  buying_type: z.literal("auction"),
  conversion_location: z.literal("website"),
  optimization_goal: z.enum(["landing_page_views", "link_clicks", "offsite_conversions"]),
  billing_event: z.literal("impressions"),
  pixel_id: identifier,
  conversion_event: z.enum(["view_content", "lead", "purchase"]),
  placements: metaPlacementsSchema,
  targeting: metaTargetingSchema,
  special_ad_categories: z.array(z.enum(["credit", "employment", "housing", "social_issues"]))
    .max(4).transform((values) => [...new Set(values)].sort(compareText)).default([]),
  creative: metaCreativeSchema,
}).strict();

const tikTokPlacementsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("automatic") }).strict(),
  z.object({ mode: z.literal("manual"), values: z.tuple([z.literal("tiktok")]) }).strict(),
]);

const tikTokTargetingSchema = z.object({
  countries: unorderedStrings(1, 50),
  languages: unorderedStrings(1, 50),
  age_groups: z.array(z.enum(["18-24", "25-34", "35-44", "45-54", "55+"])).min(1)
    .transform((values) => [...new Set(values)].sort(compareText)),
  genders: z.array(z.enum(["all", "female", "male"])).min(1).max(2)
    .transform((values) => [...new Set(values)].sort(compareText)),
  interests: unorderedStrings(0, 200),
  operating_systems: z.array(z.enum(["android", "ios"])).min(1)
    .transform((values) => [...new Set(values)].sort(compareText)),
}).strict().superRefine((value, context) => {
  if (value.genders.includes("all") && value.genders.length > 1) {
    context.addIssue({ code: "custom", path: ["genders"], message: "All genders cannot be combined with another gender." });
  }
});

const tikTokCreativeSchema = z.object({
  format: z.literal("single_video"),
  spark_ad: z.literal(false),
  video_id: identifier,
  ad_text: nonEmptyText(100),
  call_to_action: z.enum(["learn_more", "shop_now", "sign_up", "apply_now"]),
}).strict();

const tikTokDraftObjectSchema = z.object({
  ...commonDraftShape,
  platform: z.literal("tiktok"),
  objective: z.enum(["traffic", "web_conversions", "lead_generation"]),
  campaign_type: z.literal("auction"),
  budget_mode: z.literal("daily"),
  optimization_goal: z.enum(["click", "landing_page_view", "complete_payment", "lead"]),
  pixel_id: identifier,
  conversion_event: z.enum(["page_view", "purchase", "submit_form"]),
  placements: tikTokPlacementsSchema,
  targeting: tikTokTargetingSchema,
  identity: z.object({
    type: z.literal("regular"),
    display_name: nonEmptyText(40),
  }).strict(),
  creative: tikTokCreativeSchema,
}).strict();

const derivedBudgetShape = {
  increment_amount: z.literal(0),
  daily_budget: positiveCurrencyAmount,
  projected_total: positiveCurrencyAmount,
};

export const googleCampaignPlanDraftSchema = googleDraftObjectSchema.superRefine(validateCampaignPlanCombination);
export const metaCampaignPlanDraftSchema = metaDraftObjectSchema.superRefine(validateCampaignPlanCombination);
export const tikTokCampaignPlanDraftSchema = tikTokDraftObjectSchema.superRefine(validateCampaignPlanCombination);

export const campaignPlanDraftInputSchema = z.discriminatedUnion("platform", [
  googleDraftObjectSchema,
  metaDraftObjectSchema,
  tikTokDraftObjectSchema,
]).superRefine(validateCampaignPlanCombination);

export const campaignPlanSchema = z.discriminatedUnion("platform", [
  googleDraftObjectSchema.extend(derivedBudgetShape),
  metaDraftObjectSchema.extend(derivedBudgetShape),
  tikTokDraftObjectSchema.extend(derivedBudgetShape),
]).superRefine(validateCampaignPlanCombination);

export type CampaignPlanDraftInput = z.input<typeof campaignPlanDraftInputSchema>;
export type CampaignPlan = z.output<typeof campaignPlanSchema>;
export type GoogleCampaignPlan = Extract<CampaignPlan, { platform: "google" }>;
export type MetaCampaignPlan = Extract<CampaignPlan, { platform: "meta" }>;
export type TikTokCampaignPlan = Extract<CampaignPlan, { platform: "tiktok" }>;

export type CampaignBudgetProjection = {
  flight_days: number;
  platform_increment: number;
  increment_amount: 0;
  daily_budget: number;
  projected_total: number;
};

export function calculateCampaignBudget(input: {
  platform: keyof typeof CAMPAIGN_BUDGET_INCREMENT;
  allocated_budget: number;
  start_date: string;
  end_date: string;
}): CampaignBudgetProjection {
  const allocatedBudgetMicros = currencyToMicros(input.allocated_budget);
  if (allocatedBudgetMicros <= 0) throw new Error("Allocated budget must be positive.");

  const flightDays = inclusiveFlightDays(input.start_date, input.end_date);
  const platformIncrement = CAMPAIGN_BUDGET_INCREMENT[input.platform];
  const platformIncrementMicros = currencyToMicros(platformIncrement);
  const unroundedDailyMicros = Math.floor(allocatedBudgetMicros / flightDays);
  const dailyBudgetMicros = Math.floor(unroundedDailyMicros / platformIncrementMicros) * platformIncrementMicros;
  if (dailyBudgetMicros <= 0) {
    throw new Error("Allocated budget is too small for the platform daily-budget increment.");
  }

  const projectedTotalMicros = dailyBudgetMicros * flightDays;
  if (!Number.isSafeInteger(projectedTotalMicros)) {
    throw new Error("Projected total exceeds the supported safe-integer range.");
  }

  return {
    flight_days: flightDays,
    platform_increment: platformIncrement,
    increment_amount: 0,
    daily_budget: microsToCurrency(dailyBudgetMicros),
    projected_total: microsToCurrency(projectedTotalMicros),
  };
}

export function inclusiveFlightDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (end < start) throw new Error("End date must be on or after start date.");
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function normalizeCampaignPlan<T>(value: T): T {
  return normalizeCampaignValue(value) as T;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export type CampaignApprovalEvaluation =
  | { approved: true; reason: "approved" }
  | {
      approved: false;
      reason: "missing" | "not_approved" | "expired" | "superseded" | "revision_mismatch" | "hash_mismatch";
    };

export function evaluateCampaignApproval(input: {
  now: string | Date;
  active_revision_id: number;
  active_revision_hash: string;
  latest_approval_id: number | null;
  approval: {
    id: number;
    decision: "approved" | "rejected" | "cancelled";
    revision_id: number;
    revision_hash: string;
    expires_at: string | Date;
  } | null;
}): CampaignApprovalEvaluation {
  if (!input.approval) return { approved: false, reason: "missing" };
  if (input.approval.decision !== "approved") return { approved: false, reason: "not_approved" };
  if (input.latest_approval_id !== input.approval.id) return { approved: false, reason: "superseded" };
  if (parseInstant(input.approval.expires_at) <= parseInstant(input.now)) {
    return { approved: false, reason: "expired" };
  }
  if (input.approval.revision_id !== input.active_revision_id) {
    return { approved: false, reason: "revision_mismatch" };
  }
  if (input.approval.revision_hash !== input.active_revision_hash) {
    return { approved: false, reason: "hash_mismatch" };
  }
  return { approved: true, reason: "approved" };
}

export function canTransitionCampaignBuild(from: M04BuildState, to: M04BuildState): boolean {
  return (M04_BUILD_TRANSITIONS[from] as readonly M04BuildState[]).includes(to);
}

function validateCampaignPlanCombination(value: unknown, context: z.RefinementCtx): void {
  const plan = value as z.output<typeof googleDraftObjectSchema>
    | z.output<typeof metaDraftObjectSchema>
    | z.output<typeof tikTokDraftObjectSchema>;

  if (plan.end_date < plan.start_date) {
    context.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after start date." });
  }

  if (plan.platform === "google") {
    const expectedInventory = {
      search: "google_search",
      performance_max: "all_google_inventory",
      demand_gen: "discover_youtube_gmail",
    } as const;
    const expectedCreative = {
      search: "responsive_search_ad",
      performance_max: "performance_max_asset_group",
      demand_gen: "demand_gen_asset",
    } as const;

    if (plan.placements.inventory !== expectedInventory[plan.campaign_type]) {
      context.addIssue({ code: "custom", path: ["placements", "inventory"], message: "Inventory must match the Google campaign type." });
    }
    if (plan.creative.format !== expectedCreative[plan.campaign_type]) {
      context.addIssue({ code: "custom", path: ["creative", "format"], message: "Creative format must match the Google campaign type." });
    }
    if (plan.campaign_type === "search") {
      if (!plan.network_settings.google_search || plan.network_settings.display_network) {
        context.addIssue({ code: "custom", path: ["network_settings"], message: "Search requires Google Search and does not allow the Display Network." });
      }
      if (plan.campaign_structure.groups.some((group) => group.keywords.length === 0)) {
        context.addIssue({ code: "custom", path: ["campaign_structure", "groups"], message: "Every Search ad group requires at least one keyword." });
      }
    } else {
      if (plan.network_settings.google_search || plan.network_settings.search_partners || plan.network_settings.display_network) {
        context.addIssue({ code: "custom", path: ["network_settings"], message: "Performance Max and Demand Gen inventory is selected by campaign type, not Search network switches." });
      }
      if (plan.bidding_strategy === "maximize_clicks") {
        context.addIssue({ code: "custom", path: ["bidding_strategy"], message: "Maximize clicks is supported only for Search in M04 V1." });
      }
    }

    const hasTargetCpa = plan.bid_targets.target_cpa !== undefined;
    const hasTargetRoas = plan.bid_targets.target_roas !== undefined;
    if ((plan.bidding_strategy === "target_cpa") !== hasTargetCpa || (plan.bidding_strategy === "target_roas") !== hasTargetRoas) {
      context.addIssue({ code: "custom", path: ["bid_targets"], message: "Bid targets must exactly match the selected target bidding strategy." });
    }
  }

  if (plan.platform === "meta") {
    const supported = {
      traffic: plan.optimization_goal === "landing_page_views" || plan.optimization_goal === "link_clicks",
      leads: plan.optimization_goal === "offsite_conversions" && plan.conversion_event === "lead",
      sales: plan.optimization_goal === "offsite_conversions" && plan.conversion_event === "purchase",
    }[plan.objective];
    if (!supported) {
      context.addIssue({ code: "custom", path: ["optimization_goal"], message: "Meta optimization and event must match the objective." });
    }
    if (plan.objective === "traffic" && plan.conversion_event !== "view_content") {
      context.addIssue({ code: "custom", path: ["conversion_event"], message: "Meta Traffic uses the website view-content event in M04 V1." });
    }
  }

  if (plan.platform === "tiktok") {
    const supported = {
      traffic: (plan.optimization_goal === "click" || plan.optimization_goal === "landing_page_view")
        && plan.conversion_event === "page_view",
      web_conversions: plan.optimization_goal === "complete_payment" && plan.conversion_event === "purchase",
      lead_generation: plan.optimization_goal === "lead" && plan.conversion_event === "submit_form",
    }[plan.objective];
    if (!supported) {
      context.addIssue({ code: "custom", path: ["optimization_goal"], message: "TikTok optimization and event must match the objective." });
    }
  }
}

const UNORDERED_ARRAY_KEYS = new Set([
  "age_groups",
  "audience_segments",
  "countries",
  "excluded_locations",
  "genders",
  "image_asset_ids",
  "interests",
  "languages",
  "locations",
  "logo_asset_ids",
  "operating_systems",
  "special_ad_categories",
  "values",
  "video_asset_ids",
]);

function normalizeCampaignValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeCampaignValue(item));
    return key && UNORDERED_ARRAY_KEYS.has(key)
      ? values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"))
      : values;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      normalizeCampaignValue(childValue, childKey),
    ]));
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain a non-finite number.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => {
      const child = value[key];
      if (child === undefined) throw new Error("Canonical JSON cannot contain undefined values.");
      return [key, canonicalize(child)];
    }));
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function parseIsoDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("Use a real calendar date.");
  }
  return timestamp;
}

function isRealIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

function parseInstant(value: string | Date): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Approval timestamps must be valid instants.");
  return timestamp;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function currencyToMicros(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_CURRENCY_AMOUNT || !hasAtMostSixDecimalPlaces(value)) {
    throw new Error("Currency values must be finite, non-negative, and use at most six decimal places.");
  }
  const micros = Math.round(value * MONEY_SCALE);
  if (!Number.isSafeInteger(micros)) throw new Error("Currency value exceeds the supported safe-integer range.");
  return micros;
}

function microsToCurrency(value: number): number {
  return value / MONEY_SCALE;
}

function hasAtMostSixDecimalPlaces(value: number): boolean {
  return Number.isSafeInteger(Math.round(value * MONEY_SCALE))
    && Math.abs(value * MONEY_SCALE - Math.round(value * MONEY_SCALE)) < 0.000_001;
}
