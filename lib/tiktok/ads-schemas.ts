import { z } from "zod";

export const TikTokAuctionObjectiveSchema = z.enum([
  "APP_PROMOTION",
  "WEB_CONVERSIONS",
  "REACH",
  "TRAFFIC",
  "VIDEO_VIEWS",
  "ENGAGEMENT",
  "LEAD_GENERATION",
  "PRODUCT_SALES",
]);

export type TikTokAuctionObjective = z.infer<typeof TikTokAuctionObjectiveSchema>;

const operationStatus = z.enum(["ENABLE", "DISABLE"]);
const campaignBase = z.object({
  advertiser_id: z.string().min(1).optional(),
  campaign_name: z.string().min(1).max(512),
  budget_mode: z.string().optional(),
  budget: z.number().positive().optional(),
  budget_optimize_on: z.boolean().optional(),
  operation_status: operationStatus.default("DISABLE"),
  special_industries: z.array(z.string()).optional(),
}).passthrough();

export const TikTokAuctionCampaignCreateSchema = z.discriminatedUnion("objective_type", [
  campaignBase.extend({
    objective_type: z.literal("APP_PROMOTION"),
    app_promotion_type: z.enum(["APP_INSTALL", "APP_RETARGETING", "APP_PREREGISTRATION"]),
  }),
  campaignBase.extend({ objective_type: z.literal("WEB_CONVERSIONS") }),
  campaignBase.extend({ objective_type: z.literal("REACH") }),
  campaignBase.extend({ objective_type: z.literal("TRAFFIC") }),
  campaignBase.extend({ objective_type: z.literal("VIDEO_VIEWS") }),
  campaignBase.extend({ objective_type: z.literal("ENGAGEMENT") }),
  campaignBase.extend({ objective_type: z.literal("LEAD_GENERATION") }),
  campaignBase.extend({
    objective_type: z.literal("PRODUCT_SALES"),
    campaign_product_source: z.enum(["CATALOG", "STORE"]).optional(),
  }),
]);

export const TikTokJsonObjectSchema = z.record(z.string(), z.unknown());

export const TikTokApiEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z.unknown().optional(),
}).passthrough();

const SENSITIVE_KEY_PATTERN = /(^|_)(access[_-]?token|refresh[_-]?token|token|secret|auth[_-]?code|authorization|password)($|_)/i;

export function isSensitiveTikTokKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactTikTokSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTikTokSecrets);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Blob) return `[Blob ${value.size} bytes]`;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    isSensitiveTikTokKey(key) ? "[REDACTED]" : redactTikTokSecrets(child),
  ]));
}

export function assertNoTikTokSecrets(value: unknown, allowedKeys: string[] = []) {
  const allowed = new Set(allowedKeys.map((key) => key.toLowerCase()));
  const visit = (current: unknown, path: string[]) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    if (!current || typeof current !== "object" || current instanceof Blob) return;
    for (const [key, child] of Object.entries(current)) {
      if (isSensitiveTikTokKey(key) && !allowed.has(key.toLowerCase())) {
        throw new Error(`Sensitive field is not accepted in TikTok input: ${[...path, key].join(".")}`);
      }
      visit(child, [...path, key]);
    }
  };
  visit(value, []);
}

export function validateTikTokMutationPayload(action: string, payload: Record<string, unknown>) {
  assertNoTikTokSecrets(payload);
  if (action === "campaign.create") {
    return TikTokAuctionCampaignCreateSchema.parse(payload) as Record<string, unknown>;
  }
  return TikTokJsonObjectSchema.parse(payload);
}


