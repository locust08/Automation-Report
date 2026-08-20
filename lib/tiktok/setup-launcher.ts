import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  TIKTOK_ADS_API_VERSION,
  type TikTokAdsActionName,
} from "@/lib/tiktok/ads-actions";
import type {
  TikTokAdsApiResult,
  TikTokAdsRequestInput,
  TikTokLiveAdvertiserInfo,
} from "@/lib/tiktok/ads-client";
import { prepareTikTokMutationPayload } from "@/lib/tiktok/ads-operations";
import type { TikTokAdvertiser } from "@/lib/tiktok/oauth";
import { redactTikTokSecrets } from "@/lib/tiktok/ads-schemas";
import {
  assertTikTokReceiptLockOwned,
  getTikTokSetupStateDirectory,
  hasTikTokInitializedReceipt,
  markTikTokReceiptInitialized,
  withTikTokReceiptLock,
  type TikTokReceiptLockExecutionMode,
  type TikTokReceiptLock,
} from "@/lib/tiktok/setup-receipt-lock";
import {
  hashTikTokSetupValue,
  verifyTikTokSetupRevision,
  type TikTokSetupRevision,
} from "@/lib/tiktok/setup-plan";

export const TIKTOK_SETUP_LAUNCHER_SCHEMA_VERSION = 3 as const;
export const TIKTOK_ACTIVATION_PREVIEW_TTL_MS = 15 * 60 * 1000;

export type TikTokSetupLauncherClient = {
  assertAdvertiser(advertiserId: string): TikTokAdvertiser;
  getLiveAdvertiserInfo(advertiserId: string): Promise<TikTokLiveAdvertiserInfo>;
  request<T = unknown>(
    action: TikTokAdsActionName,
    input: TikTokAdsRequestInput,
  ): Promise<TikTokAdsApiResult<T>>;
};

const resourceTypeSchema = z.enum(["CAMPAIGN", "ADGROUP", "AD"]);
type TikTokSetupResourceType = z.infer<typeof resourceTypeSchema>;

const createActionSchema = z.enum(["campaign.create", "adgroup.create", "ad.create"]);

const compiledDependencySchema = z.object({
  operationKey: z.string().min(1),
  inputField: z.enum(["campaign_id", "adgroup_id"]),
}).strict();

const compiledOperationSchema = z.object({
  operationKey: z.string().min(1),
  resourceType: resourceTypeSchema,
  action: createActionSchema,
  input: z.record(z.string(), z.unknown()),
  dependency: compiledDependencySchema.optional(),
}).strict();

export const TikTokCompiledSetupSchema = z.object({
  schemaVersion: z.literal(TIKTOK_SETUP_LAUNCHER_SCHEMA_VERSION),
  apiVersion: z.literal(TIKTOK_ADS_API_VERSION),
  revisionId: z.string().regex(/^ttrev_[a-f0-9]{20}$/),
  revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  advertiserId: z.string().min(1),
  operations: z.array(compiledOperationSchema).min(3),
  compileHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type TikTokCompiledSetup = z.infer<typeof TikTokCompiledSetupSchema>;
export type TikTokCompiledSetupOperation = z.infer<typeof compiledOperationSchema>;

const createStepStatusSchema = z.enum([
  "NOT_STARTED",
  "ATTEMPTING",
  "CREATED_UNVERIFIED",
  "VERIFIED",
  "AMBIGUOUS",
]);

const activationStepStatusSchema = z.enum([
  "NOT_STARTED",
  "ATTEMPTING",
  "APPLIED_UNVERIFIED",
  "VERIFIED",
  "AMBIGUOUS",
]);

const receiptStepSchema = z.object({
  operationKey: z.string().min(1),
  resourceType: resourceTypeSchema,
  action: createActionSchema,
  status: createStepStatusSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  resourceId: z.string().min(1).optional(),
  providerRequestId: z.string().optional(),
  verificationRequestId: z.string().optional(),
  attemptedAt: z.string().datetime().optional(),
  verifiedAt: z.string().datetime().optional(),
  error: z.unknown().optional(),
}).strict();

const activationStepSchema = z.object({
  operationKey: z.string().min(1),
  resourceType: resourceTypeSchema,
  action: z.enum(["campaign.status", "adgroup.status", "ad.status"]),
  resourceId: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  materialConfigHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: activationStepStatusSchema,
  providerRequestId: z.string().optional(),
  verificationRequestId: z.string().optional(),
  attemptedAt: z.string().datetime().optional(),
  verifiedAt: z.string().datetime().optional(),
  error: z.unknown().optional(),
}).strict();

const activationSchema = z.object({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  previewedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  steps: z.array(activationStepSchema).min(3),
}).strict();

export const TikTokSetupLaunchReceiptSchema = z.object({
  schemaVersion: z.literal(TIKTOK_SETUP_LAUNCHER_SCHEMA_VERSION),
  apiVersion: z.literal(TIKTOK_ADS_API_VERSION),
  revisionId: z.string().regex(/^ttrev_[a-f0-9]{20}$/),
  revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  compileHash: z.string().regex(/^[a-f0-9]{64}$/),
  advertiser: z.object({
    advertiser_id: z.string().min(1),
    advertiser_name: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timezone: z.string().min(1),
  }).strict(),
  status: z.enum([
    "PREVIEWED",
    "CREATING",
    "CREATED_DISABLED",
    "ACTIVATION_PREVIEWED",
    "ACTIVATING",
    "ACTIVE",
    "BLOCKED",
  ]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  compiledOperations: z.array(compiledOperationSchema).min(3),
  steps: z.record(z.string(), receiptStepSchema),
  activation: activationSchema.optional(),
  receiptIntegrityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export type TikTokSetupLaunchReceipt = z.infer<typeof TikTokSetupLaunchReceiptSchema>;
type TikTokSetupLaunchReceiptStep = z.infer<typeof receiptStepSchema>;
type TikTokSetupActivationStep = z.infer<typeof activationStepSchema>;

function compactRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => (
      value !== undefined && (!Array.isArray(value) || value.length > 0)
    )),
  );
}

function stableTikTokProviderRequestId(revisionHash: string, operationKey: string) {
  const hex = hashTikTokSetupValue({ revisionHash, operationKey }).slice(0, 13);
  return Number.parseInt(hex, 16).toString();
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsAsUtc(parts: DateTimeParts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function sameDateTime(left: DateTimeParts, right: DateTimeParts) {
  return Object.keys(left).every((key) => (
    left[key as keyof DateTimeParts] === right[key as keyof DateTimeParts]
  ));
}

function formatUtcTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterForTimeZone(timeZone: string) {
  const existing = zonedFormatterCache.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // Force eager validation of the IANA identifier.
  formatter.format(new Date(0));
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
}

function zonedPartsWithFormatter(timestamp: number, formatter: Intl.DateTimeFormat): DateTimeParts {
  const values = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function localIanaDateTimeToTikTokUtc(params: {
  date: string;
  time: string;
  timeZone: string;
  disambiguation?: "reject" | "earlier" | "later";
}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.date);
  if (!match) throw new Error(`Invalid schedule date: ${params.date}`);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(params.time);
  if (!timeMatch) throw new Error(`Invalid schedule time: ${params.time}`);
  const desired: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3]),
  };
  const pseudoUtc = partsAsUtc(desired);
  const calendarRoundTrip = new Date(pseudoUtc);
  if (
    calendarRoundTrip.getUTCFullYear() !== desired.year
    || calendarRoundTrip.getUTCMonth() + 1 !== desired.month
    || calendarRoundTrip.getUTCDate() !== desired.day
    || calendarRoundTrip.getUTCHours() !== desired.hour
    || calendarRoundTrip.getUTCMinutes() !== desired.minute
    || calendarRoundTrip.getUTCSeconds() !== desired.second
  ) {
    throw new Error(`Invalid schedule boundary: ${params.date} ${params.time}`);
  }
  const formatter = formatterForTimeZone(params.timeZone);
  const possibleOffsets = new Set<number>();
  for (let deltaHours = -72; deltaHours <= 72; deltaHours += 1) {
    const sampledInstant = pseudoUtc + (deltaHours * 3_600_000);
    possibleOffsets.add(partsAsUtc(zonedPartsWithFormatter(sampledInstant, formatter)) - sampledInstant);
  }
  const candidates = [...possibleOffsets]
    .map((offset) => pseudoUtc - offset)
    .filter((candidate) => sameDateTime(
      zonedPartsWithFormatter(candidate, formatter),
      desired,
    ))
    .filter((candidate, index, values) => values.indexOf(candidate) === index)
    .sort((left, right) => left - right);
  if (candidates.length === 0) {
    throw new Error(
      `Schedule boundary ${params.date} ${params.time} does not exist in ${params.timeZone}`,
    );
  }
  if (candidates.length > 1 && (params.disambiguation ?? "reject") === "reject") {
    throw new Error(
      `Schedule boundary ${params.date} ${params.time} is ambiguous in ${params.timeZone}`,
    );
  }
  const candidate = params.disambiguation === "later"
    ? candidates[candidates.length - 1]
    : candidates[0];
  return formatUtcTimestamp(candidate);
}

export function convertTikTokLocalScheduleToUtc(params: {
  date: string;
  time: "00:00:00" | "23:59:59";
  timeZone: string;
}) {
  return localIanaDateTimeToTikTokUtc({
    ...params,
    disambiguation: params.time === "00:00:00" ? "earlier" : "later",
  });
}

function objectiveAdGroupInput(
  settings: TikTokSetupRevision["plan"]["adGroups"][number]["objectiveSettings"],
) {
  if (settings.objective === "TRAFFIC") {
    return {
      promotion_type: "WEBSITE",
      optimization_goal: settings.optimizationGoal,
      billing_event: settings.billingEvent,
    };
  }
  if (settings.objective === "WEB_CONVERSIONS") {
    return {
      promotion_type: "WEBSITE",
      optimization_goal: settings.optimizationGoal,
      billing_event: settings.billingEvent,
      pixel_id: settings.pixelId,
      optimization_event: settings.optimizationEvent,
    };
  }
  if (settings.objective === "LEAD_GENERATION") {
    return compactRecord({
      promotion_type: "LEAD_GENERATION",
      promotion_target_type: settings.promotionTargetType,
      optimization_goal: settings.optimizationGoal,
      billing_event: settings.billingEvent,
      pixel_id: settings.destination === "WEBSITE" ? settings.pixelId : undefined,
      optimization_event: settings.destination === "WEBSITE" ? settings.optimizationEvent : undefined,
    });
  }
  throw new Error("Unsupported TikTok v1 objective settings");
}

function objectiveAdInput(
  settings: TikTokSetupRevision["plan"]["adGroups"][number]["objectiveSettings"],
) {
  if (settings.destination === "WEBSITE") {
    return { landing_page_url: settings.destinationUrl };
  }
  if (settings.objective === "LEAD_GENERATION" && settings.destination === "INSTANT_FORM") {
    return { page_id: settings.pageId };
  }
  return {};
}

function compiledBody(compiled: Omit<TikTokCompiledSetup, "compileHash">) {
  return compiled;
}

export function compileTikTokSetupRevision(input: unknown): TikTokCompiledSetup {
  const revision = verifyTikTokSetupRevision(input);
  const operations: TikTokCompiledSetupOperation[] = [];
  operations.push({
    operationKey: "campaign",
    resourceType: "CAMPAIGN",
    action: "campaign.create",
    input: compactRecord({
      request_id: stableTikTokProviderRequestId(revision.revisionHash, "campaign"),
      campaign_name: revision.plan.campaign.name,
      objective_type: revision.plan.brief.objective,
      budget_optimize_on: false,
      special_industries: revision.plan.campaign.specialIndustries,
      operation_status: "DISABLE",
    }),
  });

  for (const group of revision.plan.adGroups) {
    const groupOperationKey = `adgroup:${group.key}`;
    operations.push({
      operationKey: groupOperationKey,
      resourceType: "ADGROUP",
      action: "adgroup.create",
      dependency: { operationKey: "campaign", inputField: "campaign_id" },
      input: compactRecord({
        request_id: stableTikTokProviderRequestId(revision.revisionHash, groupOperationKey),
        objective_type: revision.plan.brief.objective,
        adgroup_name: group.name,
        placement_type: "PLACEMENT_TYPE_NORMAL",
        placements: group.targeting.placements,
        search_result_enabled: group.targeting.searchResultEnabled,
        location_ids: group.targeting.locationIds,
        gender: group.targeting.gender,
        age_groups: group.targeting.ageGroups,
        languages: group.targeting.languageCodes,
        interest_category_ids: group.targeting.interestCategoryIds,
        audience_ids: group.targeting.audienceIds,
        budget_mode: group.budgetMode,
        budget: group.dailyBudget,
        schedule_type: "SCHEDULE_START_END",
        schedule_start_time: convertTikTokLocalScheduleToUtc({
          date: group.startDate,
          time: "00:00:00",
          timeZone: revision.plan.advertiser.timezone,
        }),
        schedule_end_time: convertTikTokLocalScheduleToUtc({
          date: group.endDate,
          time: "23:59:59",
          timeZone: revision.plan.advertiser.timezone,
        }),
        bid_type: group.bidType,
        pacing: "PACING_MODE_SMOOTH",
        creative_material_mode: "CUSTOM",
        operation_status: "DISABLE",
        ...objectiveAdGroupInput(group.objectiveSettings),
      }),
    });

    for (const ad of group.ads) {
      operations.push({
        operationKey: `ad:${ad.key}`,
        resourceType: "AD",
        action: "ad.create",
        dependency: { operationKey: groupOperationKey, inputField: "adgroup_id" },
        input: {
          request_id: stableTikTokProviderRequestId(revision.revisionHash, `ad:${ad.key}`),
          objective_type: revision.plan.brief.objective,
          operation_status: "DISABLE",
          creatives: [{
            ad_name: ad.name,
            ad_format: ad.format,
            identity_type: ad.identity.type,
            identity_id: ad.identity.identityId,
            video_id: ad.video.videoId,
            ad_text: ad.adText,
            call_to_action: ad.callToAction,
            ...objectiveAdInput(group.objectiveSettings),
          }],
        },
      });
    }
  }

  const body: Omit<TikTokCompiledSetup, "compileHash"> = {
    schemaVersion: TIKTOK_SETUP_LAUNCHER_SCHEMA_VERSION,
    apiVersion: TIKTOK_ADS_API_VERSION,
    revisionId: revision.revisionId,
    revisionHash: revision.revisionHash,
    advertiserId: revision.plan.advertiser.id,
    operations,
  };
  return TikTokCompiledSetupSchema.parse({
    ...body,
    compileHash: hashTikTokSetupValue(compiledBody(body)),
  });
}

export function getTikTokSetupLaunchReceiptPath(revisionId: string, root = process.cwd()) {
  if (!/^ttrev_[a-f0-9]{20}$/.test(revisionId)) throw new Error("Invalid TikTok setup revision ID");
  return path.join(getTikTokSetupStateDirectory(root), `receipt_${revisionId}.json`);
}

function nowIso(now?: () => Date) {
  return (now?.() ?? new Date()).toISOString();
}

async function readReceipt(revisionId: string, root?: string) {
  const receiptPath = getTikTokSetupLaunchReceiptPath(revisionId, root);
  try {
    const receipt = TikTokSetupLaunchReceiptSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));
    if (receipt.receiptIntegrityHash !== calculateReceiptIntegrityHash(receipt)) {
      throw new Error("TikTok setup receipt integrity check failed");
    }
    assertReceiptStepBindings(receipt);
    return {
      receipt,
      receiptPath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function calculateReceiptIntegrityHash(receipt: TikTokSetupLaunchReceipt) {
  const body = { ...receipt };
  delete body.receiptIntegrityHash;
  return hashTikTokSetupValue(body);
}

function assertReceiptStepBindings(receipt: TikTokSetupLaunchReceipt) {
  const expectedOperationKeys = receipt.compiledOperations
    .map((operation) => operation.operationKey)
    .sort((left, right) => left.localeCompare(right));
  const actualStepKeys = Object.keys(receipt.steps).sort((left, right) => left.localeCompare(right));
  if (hashTikTokSetupValue(actualStepKeys) !== hashTikTokSetupValue(expectedOperationKeys)) {
    throw new Error("TikTok setup receipt step set does not match compiled operations");
  }
  for (const operation of receipt.compiledOperations) {
    const step = receipt.steps[operation.operationKey];
    if (
      !step
      || step.operationKey !== operation.operationKey
      || step.resourceType !== operation.resourceType
      || step.action !== operation.action
    ) {
      throw new Error(`TikTok setup receipt step binding is invalid: ${operation.operationKey}`);
    }
    if (step.payloadHash) {
      const expectedPayload = prepareTikTokMutationPayload(
        operation.action,
        receipt.advertiser.advertiser_id,
        materializeCreateInput(operation, receipt),
      ).payload;
      if (step.payloadHash !== hashTikTokSetupValue(expectedPayload)) {
        throw new Error(`TikTok setup receipt payload binding is invalid: ${operation.operationKey}`);
      }
    }
  }
  const createSteps = Object.values(receipt.steps);
  if (receipt.status === "PREVIEWED" && createSteps.some((step) => step.status !== "NOT_STARTED")) {
    throw new Error("TikTok setup receipt PREVIEWED state has progressed create steps");
  }
  if (
    ["CREATED_DISABLED", "ACTIVATION_PREVIEWED", "ACTIVATING", "ACTIVE"].includes(receipt.status)
    && createSteps.some((step) => step.status !== "VERIFIED")
  ) {
    throw new Error(`TikTok setup receipt ${receipt.status} state requires verified create steps`);
  }
  if (!receipt.activation) {
    if (["ACTIVATION_PREVIEWED", "ACTIVATING", "ACTIVE"].includes(receipt.status)) {
      throw new Error(`TikTok setup receipt ${receipt.status} state requires an activation binding`);
    }
    return;
  }
  const orderedOperationKeys = [
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "AD"),
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "ADGROUP"),
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "CAMPAIGN"),
  ].map((operation) => operation.operationKey);
  if (hashTikTokSetupValue(receipt.activation.steps.map((step) => step.operationKey))
    !== hashTikTokSetupValue(orderedOperationKeys)) {
    throw new Error("TikTok activation receipt order does not match compiled operations");
  }
  for (const activationStep of receipt.activation.steps) {
    const operation = receipt.compiledOperations.find(
      (candidate) => candidate.operationKey === activationStep.operationKey,
    );
    const createStep = receipt.steps[activationStep.operationKey];
    if (
      !operation
      || !createStep?.resourceId
      || activationStep.resourceType !== operation.resourceType
      || activationStep.action !== statusAction(operation.resourceType)
      || activationStep.resourceId !== createStep.resourceId
    ) {
      throw new Error(`TikTok activation receipt resource binding is invalid: ${activationStep.operationKey}`);
    }
    const expectedPayload = statusPayload({
      resourceType: operation.resourceType,
      resourceId: createStep.resourceId,
      advertiserId: receipt.advertiser.advertiser_id,
    });
    if (activationStep.payloadHash !== hashTikTokSetupValue(expectedPayload)) {
      throw new Error(`TikTok activation receipt payload binding is invalid: ${activationStep.operationKey}`);
    }
    if (activationStep.materialConfigHash !== hashTikTokSetupValue(
      materialConfigForOperation(operation, receipt),
    )) {
      throw new Error(`TikTok activation receipt material binding is invalid: ${activationStep.operationKey}`);
    }
  }
  if (
    receipt.status === "ACTIVATION_PREVIEWED"
    && receipt.activation.steps.some((step) => step.status !== "NOT_STARTED")
  ) {
    throw new Error("TikTok activation preview state has progressed activation steps");
  }
  if (receipt.status === "ACTIVE" && receipt.activation.steps.some((step) => step.status !== "VERIFIED")) {
    throw new Error("TikTok ACTIVE receipt requires verified activation steps");
  }
}

async function writeReceipt(
  receipt: TikTokSetupLaunchReceipt,
  lock: TikTokReceiptLock,
  root?: string,
) {
  await assertTikTokReceiptLockOwned(lock);
  const parsed = TikTokSetupLaunchReceiptSchema.parse({
    ...receipt,
    receiptIntegrityHash: calculateReceiptIntegrityHash(receipt),
  });
  const destination = getTikTokSetupLaunchReceiptPath(parsed.revisionId, root);
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = `${destination}.${lock.token}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    await assertTikTokReceiptLockOwned(lock);
    await rename(temporary, destination);
    const directoryHandle = await open(directory, "r");
    try {
      try {
        await directoryHandle.sync();
      } catch (error) {
        if (
          process.platform !== "win32"
          || !(error instanceof Error)
          || !("code" in error)
          || error.code !== "EPERM"
        ) {
          throw error;
        }
      }
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { receipt: parsed, receiptPath: destination };
}

async function exactAdvertiser(params: {
  client: TikTokSetupLauncherClient;
  revision: TikTokSetupRevision;
}) {
  params.client.assertAdvertiser(params.revision.plan.advertiser.id);
  const advertiser = await params.client.getLiveAdvertiserInfo(params.revision.plan.advertiser.id);
  const planned = params.revision.plan.advertiser;
  if (advertiser.advertiser_id !== planned.id) {
    throw new Error(`TikTok advertiser ID mismatch: expected ${planned.id}, received ${advertiser.advertiser_id}`);
  }
  if (advertiser.advertiser_name !== planned.name) {
    throw new Error(
      `TikTok advertiser name mismatch: expected ${planned.name}, received ${advertiser.advertiser_name}`,
    );
  }
  if (advertiser.currency !== planned.currency) {
    throw new Error(`TikTok advertiser currency mismatch: expected ${planned.currency}, received ${advertiser.currency}`);
  }
  if (advertiser.timezone !== planned.timezone) {
    throw new Error(`TikTok advertiser timezone mismatch: expected ${planned.timezone}, received ${advertiser.timezone}`);
  }
  return advertiser;
}

function assertReceiptMatches(
  receipt: TikTokSetupLaunchReceipt,
  compiled: TikTokCompiledSetup,
  advertiser: TikTokLiveAdvertiserInfo,
) {
  if (
    receipt.revisionId !== compiled.revisionId
    || receipt.revisionHash !== compiled.revisionHash
    || receipt.compileHash !== compiled.compileHash
    || receipt.advertiser.advertiser_id !== advertiser.advertiser_id
    || receipt.advertiser.advertiser_name !== advertiser.advertiser_name
    || receipt.advertiser.currency !== advertiser.currency
    || receipt.advertiser.timezone !== advertiser.timezone
    || hashTikTokSetupValue(receipt.compiledOperations) !== hashTikTokSetupValue(compiled.operations)
  ) {
    throw new Error("TikTok setup receipt does not match the immutable approved revision");
  }
}

function containsProviderId(value: unknown, keys: string[], expected: string): boolean {
  if (Array.isArray(value)) return value.some((child) => containsProviderId(child, keys, expected));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (keys.includes(key)) {
      if (Array.isArray(child)) return child.some((item) => String(item) === expected);
      if (String(child) === expected) return true;
    }
    return containsProviderId(child, keys, expected);
  });
}

function safeError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "Unknown TikTok launcher error";
  const message = rawMessage.replace(
    /(access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|app[-_ ]?secret|authorization|auth[-_ ]?code|password)\s*[:=]\s*\S+/gi,
    "$1=[redacted]",
  );
  return redactTikTokSecrets({
    name: error instanceof Error ? error.name : "Error",
    message,
  });
}

async function validateReferencedAssets(params: {
  client: TikTokSetupLauncherClient;
  revision: TikTokSetupRevision;
}) {
  const advertiserId = params.revision.plan.advertiser.id;
  const identities = new Set<string>();
  const videos = new Set<string>();
  const pixels = new Set<string>();
  const forms = new Set<string>();
  for (const group of params.revision.plan.adGroups) {
    const settings = group.objectiveSettings;
    if (
      settings.objective === "WEB_CONVERSIONS"
      || (settings.objective === "LEAD_GENERATION" && settings.destination === "WEBSITE")
    ) pixels.add(settings.pixelId);
    if (settings.objective === "LEAD_GENERATION" && settings.destination === "INSTANT_FORM") {
      forms.add(settings.pageId);
    }
    for (const ad of group.ads) {
      identities.add(ad.identity.identityId);
      videos.add(ad.video.videoId);
    }
  }

  if (pixels.size > 0) {
    const response = await params.client.request("pixel.list", {
      advertiser_id: advertiserId,
      page: 1,
      page_size: 1000,
    });
    for (const pixelId of pixels) {
      if (!containsProviderId(response.data, ["pixel_id"], pixelId)) {
        throw new Error(`Required TikTok pixel is unavailable: ${pixelId}`);
      }
    }
  }
  for (const pageId of forms) {
    const response = await params.client.request("lead-form.get", {
      advertiser_id: advertiserId,
      page_id: pageId,
    });
    if (!containsProviderId(response.data, ["page_id"], pageId)) {
      throw new Error(`Required TikTok Instant Form is unavailable: ${pageId}`);
    }
  }
  if (identities.size > 0) {
    const response = await params.client.request("identity.list", {
      advertiser_id: advertiserId,
      filtering: { identity_ids: [...identities].sort() },
      page: 1,
      page_size: 1000,
    });
    for (const identityId of identities) {
      if (!containsProviderId(response.data, ["identity_id"], identityId)) {
        throw new Error(`Required TikTok identity is unavailable: ${identityId}`);
      }
    }
  }
  if (videos.size > 0) {
    const response = await params.client.request("asset.video-search", {
      advertiser_id: advertiserId,
      filtering: { video_ids: [...videos].sort() },
      page: 1,
      page_size: 1000,
    });
    for (const videoId of videos) {
      if (!containsProviderId(response.data, ["video_id", "id"], videoId)) {
        throw new Error(`Required TikTok video is unavailable: ${videoId}`);
      }
    }
  }
}

function initializeReceipt(params: {
  compiled: TikTokCompiledSetup;
  advertiser: TikTokLiveAdvertiserInfo;
  timestamp: string;
}): TikTokSetupLaunchReceipt {
  const steps = Object.fromEntries(params.compiled.operations.map((operation) => [
    operation.operationKey,
    {
      operationKey: operation.operationKey,
      resourceType: operation.resourceType,
      action: operation.action,
      status: "NOT_STARTED" as const,
    },
  ]));
  return TikTokSetupLaunchReceiptSchema.parse({
    schemaVersion: TIKTOK_SETUP_LAUNCHER_SCHEMA_VERSION,
    apiVersion: TIKTOK_ADS_API_VERSION,
    revisionId: params.compiled.revisionId,
    revisionHash: params.compiled.revisionHash,
    compileHash: params.compiled.compileHash,
    advertiser: params.advertiser,
    status: "PREVIEWED",
    createdAt: params.timestamp,
    updatedAt: params.timestamp,
    compiledOperations: params.compiled.operations,
    steps,
  });
}

async function previewTikTokDisabledSetupUnlocked(params: {
  client: TikTokSetupLauncherClient;
  revision: unknown;
  initializeNewReceipt?: boolean;
  root?: string;
  now?: () => Date;
  lock: TikTokReceiptLock;
}) {
  const revision = verifyTikTokSetupRevision(params.revision);
  const compiled = compileTikTokSetupRevision(revision);
  const advertiser = await exactAdvertiser({ client: params.client, revision });
  const durableInitializationExists = await hasTikTokInitializedReceipt(params.lock);
  const existing = await readReceipt(revision.revisionId, params.root);
  if (existing) {
    assertReceiptMatches(existing.receipt, compiled, advertiser);
    if (!durableInitializationExists) {
      await markTikTokReceiptInitialized(params.lock, existing.receipt.createdAt);
    }
    return existing;
  }
  if (durableInitializationExists) {
    throw new Error(
      "The durable TikTok setup receipt is missing for an initialized revision. Reconcile provider state and restore the receipt; automatic reinitialization is blocked",
    );
  }
  if (params.initializeNewReceipt !== true) {
    throw new Error(
      "No durable TikTok setup receipt exists. Reconcile the advertiser for prior objects, then pass initializeNewReceipt=true only for a confirmed brand-new build",
    );
  }

  for (const operation of compiled.operations) {
    prepareTikTokMutationPayload(operation.action, advertiser.advertiser_id, operation.input);
  }
  await validateReferencedAssets({ client: params.client, revision });
  const initialized = await writeReceipt(initializeReceipt({
    compiled,
    advertiser,
    timestamp: nowIso(params.now),
  }), params.lock, params.root);
  await markTikTokReceiptInitialized(params.lock, initialized.receipt.createdAt);
  return initialized;
}

async function requireReceipt(params: {
  revision: TikTokSetupRevision;
  compiled: TikTokCompiledSetup;
  advertiser: TikTokLiveAdvertiserInfo;
  root?: string;
}) {
  const stored = await readReceipt(params.revision.revisionId, params.root);
  if (!stored) {
    throw new Error("Run the TikTok setup launcher in preview mode before apply");
  }
  assertReceiptMatches(stored.receipt, params.compiled, params.advertiser);
  return stored;
}

function assertConfirmation(advertiser: TikTokLiveAdvertiserInfo, confirmation: string) {
  if (confirmation !== advertiser.advertiser_name) {
    throw new Error("Exact TikTok advertiser-name confirmation is required");
  }
}

function materializeCreateInput(
  operation: TikTokCompiledSetupOperation,
  receipt: TikTokSetupLaunchReceipt,
) {
  const input = structuredClone(operation.input);
  if (operation.dependency) {
    const resourceId = receipt.steps[operation.dependency.operationKey]?.resourceId;
    if (!resourceId) throw new Error(`Missing verified dependency: ${operation.dependency.operationKey}`);
    input[operation.dependency.inputField] = resourceId;
  }
  return input;
}

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const children = value.map(comparableValue);
    return children.every((child) => ["string", "number", "boolean"].includes(typeof child))
      ? [...children].sort((left, right) => String(left).localeCompare(String(right)))
      : children;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, comparableValue(child)]));
}

function assertMaterialConfigSubset(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  pathPrefix = "",
) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (!(key in actual)) throw new Error(`TikTok GET verification is missing material field ${path}`);
    const actualValue = actual[key];
    if (
      expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)
      && actualValue && typeof actualValue === "object" && !Array.isArray(actualValue)
    ) {
      assertMaterialConfigSubset(
        actualValue as Record<string, unknown>,
        expectedValue as Record<string, unknown>,
        path,
      );
      continue;
    }
    if (hashTikTokSetupValue(comparableValue(actualValue)) !== hashTikTokSetupValue(comparableValue(expectedValue))) {
      throw new Error(`TikTok GET verification detected material configuration drift at ${path}`);
    }
  }
}

function materialConfigForOperation(
  operation: TikTokCompiledSetupOperation,
  receipt: TikTokSetupLaunchReceipt,
) {
  const materialized = materializeCreateInput(operation, receipt);
  const prepared = prepareTikTokMutationPayload(
    operation.action,
    receipt.advertiser.advertiser_id,
    materialized,
  ).payload;
  const { advertiser_id: _advertiserId, request_id: _requestId, operation_status: _status, ...providerConfig } = prepared;
  void _advertiserId;
  void _requestId;
  void _status;
  if (operation.resourceType !== "AD") return providerConfig;
  const creatives = providerConfig.creatives;
  if (!Array.isArray(creatives) || creatives.length !== 1 || !creatives[0] || typeof creatives[0] !== "object") {
    throw new Error(`TikTok ad operation must contain exactly one creative: ${operation.operationKey}`);
  }
  const { creatives: _creatives, ...adRoot } = providerConfig;
  void _creatives;
  return { ...adRoot, ...(creatives[0] as Record<string, unknown>) };
}

function requireCompiledOperation(
  receipt: TikTokSetupLaunchReceipt,
  operationKey: string,
) {
  const operation = receipt.compiledOperations.find(
    (candidate) => candidate.operationKey === operationKey,
  );
  if (!operation) throw new Error(`Receipt is missing compiled operation ${operationKey}`);
  return operation;
}

function expectedActivationMaterialConfig(
  receipt: TikTokSetupLaunchReceipt,
  step: TikTokSetupActivationStep,
) {
  const config = materialConfigForOperation(
    requireCompiledOperation(receipt, step.operationKey),
    receipt,
  );
  if (hashTikTokSetupValue(config) !== step.materialConfigHash) {
    throw new Error(`TikTok activation material binding changed for ${step.operationKey}`);
  }
  return config;
}

function expectedIdKey(resourceType: TikTokSetupResourceType) {
  if (resourceType === "CAMPAIGN") return "campaign_id";
  if (resourceType === "ADGROUP") return "adgroup_id";
  return "ad_id";
}

function collectResourceIds(value: unknown, key: string): string[] {
  const values = new Set<string>();
  const pluralKey = `${key}s`;
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [childKey, child] of Object.entries(current as Record<string, unknown>)) {
      if (childKey === key && (typeof child === "string" || typeof child === "number")) {
        values.add(String(child));
      } else if (childKey === pluralKey && Array.isArray(child)) {
        child.forEach((item) => {
          if (typeof item === "string" || typeof item === "number") values.add(String(item));
        });
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return [...values];
}

function verificationSpec(resourceType: TikTokSetupResourceType, resourceId: string) {
  if (resourceType === "CAMPAIGN") {
    return { action: "campaign.get" as const, idKey: "campaign_id", filtering: { campaign_ids: [resourceId] } };
  }
  if (resourceType === "ADGROUP") {
    return { action: "adgroup.get" as const, idKey: "adgroup_id", filtering: { adgroup_ids: [resourceId] } };
  }
  return { action: "ad.get" as const, idKey: "ad_id", filtering: { ad_ids: [resourceId] } };
}

function findEntity(value: unknown, idKey: string, resourceId: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const entity = findEntity(child, idKey, resourceId);
      if (entity) return entity;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (String(record[idKey] ?? "") === resourceId) return record;
  for (const child of Object.values(record)) {
    const entity = findEntity(child, idKey, resourceId);
    if (entity) return entity;
  }
  return undefined;
}

async function verifyResource(params: {
  client: TikTokSetupLauncherClient;
  advertiserId: string;
  resourceType: TikTokSetupResourceType;
  resourceId: string;
  expectedOperationStatus: "DISABLE" | "ENABLE";
  expectedMaterialConfig: Record<string, unknown>;
}) {
  const spec = verificationSpec(params.resourceType, params.resourceId);
  const response = await params.client.request(spec.action, {
    advertiser_id: params.advertiserId,
    filtering: spec.filtering,
    page: 1,
    page_size: 1,
  });
  const entity = findEntity(response.data, spec.idKey, params.resourceId);
  if (!entity) throw new Error(`TikTok GET verification did not return ${spec.idKey}=${params.resourceId}`);
  if (entity.operation_status !== params.expectedOperationStatus) {
    throw new Error(
      `TikTok GET verification expected ${params.expectedOperationStatus} for ${spec.idKey}=${params.resourceId}`,
    );
  }
  assertMaterialConfigSubset(entity, params.expectedMaterialConfig);
  return { requestId: response.requestId, entity };
}

function ambiguousCreateError(operationKey: string) {
  return new Error(
    `TikTok create state is ambiguous for ${operationKey}; reconcile the provider object and receipt manually. The launcher will not retry POST.`,
  );
}

async function persistBlockedCreate(params: {
  receipt: TikTokSetupLaunchReceipt;
  step: TikTokSetupLaunchReceiptStep;
  lock: TikTokReceiptLock;
  root?: string;
  now?: () => Date;
  error: unknown;
}) {
  params.step.error = safeError(params.error);
  params.receipt.status = "BLOCKED";
  params.receipt.updatedAt = nowIso(params.now);
  await writeReceipt(params.receipt, params.lock, params.root);
}

async function createTikTokDisabledSetupUnlocked(params: {
  client: TikTokSetupLauncherClient;
  revision: unknown;
  confirmAdvertiserName: string;
  root?: string;
  now?: () => Date;
  lock: TikTokReceiptLock;
}) {
  const revision = verifyTikTokSetupRevision(params.revision);
  const compiled = compileTikTokSetupRevision(revision);
  const advertiser = await exactAdvertiser({ client: params.client, revision });
  assertConfirmation(advertiser, params.confirmAdvertiserName);
  const stored = await requireReceipt({ revision, compiled, advertiser, root: params.root });
  const receipt = stored.receipt;
  if (
    receipt.activation
    || receipt.status === "ACTIVE"
    || receipt.status === "CREATED_DISABLED"
    || receipt.status === "ACTIVATION_PREVIEWED"
  ) {
    return stored;
  }

  for (const operation of compiled.operations) {
    const step = receipt.steps[operation.operationKey];
    if (!step) throw new Error(`Receipt is missing create step ${operation.operationKey}`);
    if (step.status === "VERIFIED") continue;
    if (step.status === "ATTEMPTING" || step.status === "AMBIGUOUS") {
      step.status = "AMBIGUOUS";
      await persistBlockedCreate({ receipt, step, lock: params.lock, root: params.root, now: params.now, error: ambiguousCreateError(step.operationKey) });
      throw ambiguousCreateError(step.operationKey);
    }

    if (step.status === "CREATED_UNVERIFIED") {
      if (!step.resourceId) throw ambiguousCreateError(step.operationKey);
      try {
        const verification = await verifyResource({
          client: params.client,
          advertiserId: advertiser.advertiser_id,
          resourceType: step.resourceType,
          resourceId: step.resourceId,
          expectedOperationStatus: "DISABLE",
          expectedMaterialConfig: materialConfigForOperation(operation, receipt),
        });
        step.status = "VERIFIED";
        step.verificationRequestId = verification.requestId;
        step.verifiedAt = nowIso(params.now);
        step.error = undefined;
        receipt.updatedAt = step.verifiedAt;
        receipt.status = "CREATING";
        await writeReceipt(receipt, params.lock, params.root);
        continue;
      } catch (error) {
        await persistBlockedCreate({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
        throw new Error(`TikTok GET verification is unavailable for ${step.operationKey}; no create POST was retried`);
      }
    }

    const materializedInput = materializeCreateInput(operation, receipt);
    const prepared = prepareTikTokMutationPayload(
      operation.action,
      advertiser.advertiser_id,
      materializedInput,
    );
    const payloadHash = hashTikTokSetupValue(prepared.payload);
    if (step.payloadHash && step.payloadHash !== payloadHash) {
      throw new Error(`Create payload changed for ${step.operationKey}`);
    }
    step.payloadHash = payloadHash;
    step.status = "ATTEMPTING";
    step.attemptedAt = nowIso(params.now);
    step.error = undefined;
    receipt.status = "CREATING";
    receipt.updatedAt = step.attemptedAt;
    await writeReceipt(receipt, params.lock, params.root);

    let response: TikTokAdsApiResult;
    try {
      await assertTikTokReceiptLockOwned(params.lock);
      response = await params.client.request(operation.action, prepared.payload);
      await assertTikTokReceiptLockOwned(params.lock);
    } catch (error) {
      step.status = "AMBIGUOUS";
      await persistBlockedCreate({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
      throw ambiguousCreateError(step.operationKey);
    }

    const ids = collectResourceIds(response.data, expectedIdKey(step.resourceType));
    if (ids.length !== 1) {
      step.status = "AMBIGUOUS";
      step.providerRequestId = response.requestId;
      await persistBlockedCreate({
        receipt,
        step,
        lock: params.lock,
        root: params.root,
        now: params.now,
        error: new Error(`Expected exactly one provider resource ID, received ${ids.length}`),
      });
      throw ambiguousCreateError(step.operationKey);
    }
    step.resourceId = ids[0];
    step.providerRequestId = response.requestId;
    step.status = "CREATED_UNVERIFIED";
    receipt.updatedAt = nowIso(params.now);
    await writeReceipt(receipt, params.lock, params.root);

    try {
      const verification = await verifyResource({
        client: params.client,
        advertiserId: advertiser.advertiser_id,
        resourceType: step.resourceType,
        resourceId: step.resourceId,
        expectedOperationStatus: "DISABLE",
        expectedMaterialConfig: materialConfigForOperation(operation, receipt),
      });
      step.status = "VERIFIED";
      step.verificationRequestId = verification.requestId;
      step.verifiedAt = nowIso(params.now);
      receipt.updatedAt = step.verifiedAt;
      await writeReceipt(receipt, params.lock, params.root);
    } catch (error) {
      await persistBlockedCreate({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
      throw new Error(`TikTok object was created but GET verification is unavailable for ${step.operationKey}; no create POST will be retried`);
    }
  }

  receipt.status = "CREATED_DISABLED";
  receipt.updatedAt = nowIso(params.now);
  return writeReceipt(receipt, params.lock, params.root);
}

function statusAction(resourceType: TikTokSetupResourceType) {
  if (resourceType === "CAMPAIGN") return "campaign.status" as const;
  if (resourceType === "ADGROUP") return "adgroup.status" as const;
  return "ad.status" as const;
}

function statusPayload(params: {
  resourceType: TikTokSetupResourceType;
  resourceId: string;
  advertiserId: string;
}) {
  const idsField = params.resourceType === "CAMPAIGN"
    ? "campaign_ids"
    : params.resourceType === "ADGROUP" ? "adgroup_ids" : "ad_ids";
  return prepareTikTokMutationPayload(statusAction(params.resourceType), params.advertiserId, {
    [idsField]: [params.resourceId],
    operation_status: "ENABLE",
  }).payload;
}

function buildActivationSteps(receipt: TikTokSetupLaunchReceipt): TikTokSetupActivationStep[] {
  const orderedOperations = [
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "AD"),
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "ADGROUP"),
    ...receipt.compiledOperations.filter((operation) => operation.resourceType === "CAMPAIGN"),
  ];
  return orderedOperations.map((operation) => {
    const createStep = receipt.steps[operation.operationKey];
    if (createStep?.status !== "VERIFIED" || !createStep.resourceId) {
      throw new Error(`TikTok setup resource is not verified disabled: ${operation.operationKey}`);
    }
    const payload = statusPayload({
      resourceType: operation.resourceType,
      resourceId: createStep.resourceId,
      advertiserId: receipt.advertiser.advertiser_id,
    });
    return {
      operationKey: operation.operationKey,
      resourceType: operation.resourceType,
      action: statusAction(operation.resourceType),
      resourceId: createStep.resourceId,
      payloadHash: hashTikTokSetupValue(payload),
      materialConfigHash: hashTikTokSetupValue(materialConfigForOperation(operation, receipt)),
      status: "NOT_STARTED",
    };
  });
}

function activationHash(
  receipt: TikTokSetupLaunchReceipt,
  preview: {
    previewedAt: string;
    expiresAt: string;
    steps: TikTokSetupActivationStep[];
  },
) {
  return hashTikTokSetupValue({
    revisionId: receipt.revisionId,
    revisionHash: receipt.revisionHash,
    compileHash: receipt.compileHash,
    previewedAt: preview.previewedAt,
    expiresAt: preview.expiresAt,
    operations: preview.steps.map(({
      operationKey,
      resourceType,
      action,
      resourceId,
      payloadHash,
      materialConfigHash,
    }) => ({
      operationKey, resourceType, action, resourceId, payloadHash, materialConfigHash,
    })),
  });
}

function assertActivationPreviewIntegrity(receipt: TikTokSetupLaunchReceipt) {
  if (!receipt.activation) throw new Error("Run the separate TikTok activation preview before activate");
  if (receipt.activation.previewHash !== activationHash(receipt, receipt.activation)) {
    throw new Error("TikTok activation preview no longer matches its immutable resource set");
  }
  return receipt.activation;
}

async function previewTikTokSetupActivationUnlocked(params: {
  client: TikTokSetupLauncherClient;
  revision: unknown;
  root?: string;
  now?: () => Date;
  lock: TikTokReceiptLock;
}) {
  const revision = verifyTikTokSetupRevision(params.revision);
  const compiled = compileTikTokSetupRevision(revision);
  const advertiser = await exactAdvertiser({ client: params.client, revision });
  const stored = await requireReceipt({ revision, compiled, advertiser, root: params.root });
  const receipt = stored.receipt;
  if (receipt.status === "ACTIVE") {
    const activation = assertActivationPreviewIntegrity(receipt);
    for (const step of activation.steps) {
      await verifyResource({
        client: params.client,
        advertiserId: advertiser.advertiser_id,
        resourceType: step.resourceType,
        resourceId: step.resourceId,
        expectedOperationStatus: "ENABLE",
        expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
      });
    }
    return stored;
  }
  if (receipt.activation) {
    assertActivationPreviewIntegrity(receipt);
    if (receipt.activation.steps.some((step) => step.status !== "NOT_STARTED")) {
      throw new Error("TikTok activation preview cannot be refreshed after activation has started");
    }
  }
  if (receipt.status !== "CREATED_DISABLED" && receipt.status !== "ACTIVATION_PREVIEWED") {
    throw new Error("All TikTok campaign, ad-group, and ad objects must be verified disabled before activation preview");
  }

  for (const operation of receipt.compiledOperations) {
    const step = receipt.steps[operation.operationKey];
    if (step.status !== "VERIFIED" || !step.resourceId) {
      throw new Error(`TikTok setup resource is not verified disabled: ${operation.operationKey}`);
    }
    await verifyResource({
      client: params.client,
      advertiserId: advertiser.advertiser_id,
      resourceType: step.resourceType,
      resourceId: step.resourceId,
      expectedOperationStatus: "DISABLE",
      expectedMaterialConfig: materialConfigForOperation(operation, receipt),
    });
  }

  const steps = buildActivationSteps(receipt);
  const previewedAt = nowIso(params.now);
  const expiresAt = new Date(
    Date.parse(previewedAt) + TIKTOK_ACTIVATION_PREVIEW_TTL_MS,
  ).toISOString();
  const preview = {
    previewedAt,
    expiresAt,
    steps,
  };
  receipt.activation = {
    ...preview,
    previewHash: activationHash(receipt, preview),
  };
  receipt.status = "ACTIVATION_PREVIEWED";
  receipt.updatedAt = receipt.activation.previewedAt;
  return writeReceipt(receipt, params.lock, params.root);
}

function ambiguousActivationError(operationKey: string) {
  return new Error(
    `TikTok activation state is ambiguous for ${operationKey}; reconcile with GET before any further mutation. The launcher will not retry POST.`,
  );
}

async function persistBlockedActivation(params: {
  receipt: TikTokSetupLaunchReceipt;
  step: TikTokSetupActivationStep;
  lock: TikTokReceiptLock;
  root?: string;
  now?: () => Date;
  error: unknown;
}) {
  params.step.error = safeError(params.error);
  params.receipt.status = "BLOCKED";
  params.receipt.updatedAt = nowIso(params.now);
  await writeReceipt(params.receipt, params.lock, params.root);
}

async function activateTikTokSetupUnlocked(params: {
  client: TikTokSetupLauncherClient;
  revision: unknown;
  confirmAdvertiserName: string;
  root?: string;
  now?: () => Date;
  lock: TikTokReceiptLock;
}) {
  const revision = verifyTikTokSetupRevision(params.revision);
  const compiled = compileTikTokSetupRevision(revision);
  const advertiser = await exactAdvertiser({ client: params.client, revision });
  assertConfirmation(advertiser, params.confirmAdvertiserName);
  const stored = await requireReceipt({ revision, compiled, advertiser, root: params.root });
  const receipt = stored.receipt;
  const activation = assertActivationPreviewIntegrity(receipt);

  for (const step of activation.steps) {
    if (step.status === "ATTEMPTING" || step.status === "AMBIGUOUS") {
      step.status = "AMBIGUOUS";
      await persistBlockedActivation({ receipt, step, lock: params.lock, root: params.root, now: params.now, error: ambiguousActivationError(step.operationKey) });
      throw ambiguousActivationError(step.operationKey);
    }
  }

  const activationHasStarted = activation.steps.some((step) => step.status !== "NOT_STARTED");
  if (!activationHasStarted && Date.parse(nowIso(params.now)) >= Date.parse(activation.expiresAt)) {
    throw new Error("TikTok activation preview expired; run a fresh activation preview before activate");
  }

  // Re-read the complete immutable provider configuration before any status mutation.
  // A resumed step that already submitted ENABLE must read back as enabled; untouched
  // children and parents must still be disabled.
  for (const step of activation.steps) {
    await verifyResource({
      client: params.client,
      advertiserId: advertiser.advertiser_id,
      resourceType: step.resourceType,
      resourceId: step.resourceId,
      expectedOperationStatus: step.status === "NOT_STARTED" ? "DISABLE" : "ENABLE",
      expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
    });
  }

  if (receipt.status === "ACTIVE") return stored;

  for (const step of activation.steps) {
    if (step.status === "VERIFIED") continue;
    if (step.status === "APPLIED_UNVERIFIED") {
      try {
        const verification = await verifyResource({
          client: params.client,
          advertiserId: advertiser.advertiser_id,
          resourceType: step.resourceType,
          resourceId: step.resourceId,
          expectedOperationStatus: "ENABLE",
          expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
        });
        step.status = "VERIFIED";
        step.verificationRequestId = verification.requestId;
        step.verifiedAt = nowIso(params.now);
        step.error = undefined;
        receipt.status = "ACTIVATING";
        receipt.updatedAt = step.verifiedAt;
        await writeReceipt(receipt, params.lock, params.root);
        continue;
      } catch (error) {
        await persistBlockedActivation({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
        throw new Error(`TikTok activation GET verification is unavailable for ${step.operationKey}; no status POST was retried`);
      }
    }

    if (Date.parse(nowIso(params.now)) >= Date.parse(activation.expiresAt)) {
      throw new Error("TikTok activation preview expired before status mutation; manual review is required");
    }

    if (step.resourceType === "CAMPAIGN") {
      for (const graphStep of activation.steps) {
        if (graphStep.resourceType !== "CAMPAIGN" && graphStep.status !== "VERIFIED") {
          throw new Error(
            `TikTok child is not verified enabled before campaign activation: ${graphStep.operationKey}`,
          );
        }
        await verifyResource({
          client: params.client,
          advertiserId: advertiser.advertiser_id,
          resourceType: graphStep.resourceType,
          resourceId: graphStep.resourceId,
          expectedOperationStatus: graphStep.resourceType === "CAMPAIGN" ? "DISABLE" : "ENABLE",
          expectedMaterialConfig: expectedActivationMaterialConfig(receipt, graphStep),
        });
      }
    } else {
      await verifyResource({
        client: params.client,
        advertiserId: advertiser.advertiser_id,
        resourceType: step.resourceType,
        resourceId: step.resourceId,
        expectedOperationStatus: "DISABLE",
        expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
      });
    }

    const payload = statusPayload({
      resourceType: step.resourceType,
      resourceId: step.resourceId,
      advertiserId: advertiser.advertiser_id,
    });
    if (hashTikTokSetupValue(payload) !== step.payloadHash) {
      throw new Error(`Activation payload changed for ${step.operationKey}`);
    }
    step.status = "ATTEMPTING";
    step.attemptedAt = nowIso(params.now);
    step.error = undefined;
    receipt.status = "ACTIVATING";
    receipt.updatedAt = step.attemptedAt;
    await writeReceipt(receipt, params.lock, params.root);

    let response: TikTokAdsApiResult;
    try {
      await assertTikTokReceiptLockOwned(params.lock);
      response = await params.client.request(step.action, payload);
      await assertTikTokReceiptLockOwned(params.lock);
    } catch (error) {
      step.status = "AMBIGUOUS";
      await persistBlockedActivation({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
      throw ambiguousActivationError(step.operationKey);
    }
    step.providerRequestId = response.requestId;
    step.status = "APPLIED_UNVERIFIED";
    receipt.updatedAt = nowIso(params.now);
    await writeReceipt(receipt, params.lock, params.root);

    try {
      const verification = await verifyResource({
        client: params.client,
        advertiserId: advertiser.advertiser_id,
        resourceType: step.resourceType,
        resourceId: step.resourceId,
        expectedOperationStatus: "ENABLE",
        expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
      });
      step.status = "VERIFIED";
      step.verificationRequestId = verification.requestId;
      step.verifiedAt = nowIso(params.now);
      receipt.updatedAt = step.verifiedAt;
      await writeReceipt(receipt, params.lock, params.root);
    } catch (error) {
      await persistBlockedActivation({ receipt, step, lock: params.lock, root: params.root, now: params.now, error });
      throw new Error(`TikTok status was submitted but GET verification is unavailable for ${step.operationKey}; no status POST will be retried`);
    }
  }

  // A final full readback makes terminal ACTIVE resumable without trusting prior
  // per-step success responses or stale local state.
  for (const step of activation.steps) {
    await verifyResource({
      client: params.client,
      advertiserId: advertiser.advertiser_id,
      resourceType: step.resourceType,
      resourceId: step.resourceId,
      expectedOperationStatus: "ENABLE",
      expectedMaterialConfig: expectedActivationMaterialConfig(receipt, step),
    });
  }

  receipt.status = "ACTIVE";
  receipt.updatedAt = nowIso(params.now);
  return writeReceipt(receipt, params.lock, params.root);
}

type TikTokSetupReadGateParams = {
  client: TikTokSetupLauncherClient;
  revision: unknown;
  executionMode: TikTokReceiptLockExecutionMode;
  initializeNewReceipt?: boolean;
  root?: string;
  now?: () => Date;
  lockTimeoutMs?: number;
};

type TikTokSetupMutationGateParams = TikTokSetupReadGateParams & {
  confirmAdvertiserName: string;
};

export async function previewTikTokDisabledSetup(params: TikTokSetupReadGateParams) {
  const revision = verifyTikTokSetupRevision(params.revision);
  return withTikTokReceiptLock({
    revisionId: revision.revisionId,
    operation: "preview",
    executionMode: params.executionMode,
    root: params.root,
    now: params.now,
    timeoutMs: params.lockTimeoutMs,
    run: (lock) => previewTikTokDisabledSetupUnlocked({ ...params, revision, lock }),
  });
}

export async function createTikTokDisabledSetup(params: TikTokSetupMutationGateParams) {
  const revision = verifyTikTokSetupRevision(params.revision);
  return withTikTokReceiptLock({
    revisionId: revision.revisionId,
    operation: "create",
    executionMode: params.executionMode,
    root: params.root,
    now: params.now,
    timeoutMs: params.lockTimeoutMs,
    run: (lock) => createTikTokDisabledSetupUnlocked({ ...params, revision, lock }),
  });
}

export async function previewTikTokSetupActivation(params: TikTokSetupReadGateParams) {
  const revision = verifyTikTokSetupRevision(params.revision);
  return withTikTokReceiptLock({
    revisionId: revision.revisionId,
    operation: "activation-preview",
    executionMode: params.executionMode,
    root: params.root,
    now: params.now,
    timeoutMs: params.lockTimeoutMs,
    run: (lock) => previewTikTokSetupActivationUnlocked({ ...params, revision, lock }),
  });
}

export async function activateTikTokSetup(params: TikTokSetupMutationGateParams) {
  const revision = verifyTikTokSetupRevision(params.revision);
  return withTikTokReceiptLock({
    revisionId: revision.revisionId,
    operation: "activate",
    executionMode: params.executionMode,
    root: params.root,
    now: params.now,
    timeoutMs: params.lockTimeoutMs,
    run: (lock) => activateTikTokSetupUnlocked({ ...params, revision, lock }),
  });
}
