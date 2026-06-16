import {
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_NETWORK,
  DEFAULT_TARGET_LOCATION,
  MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS,
  MEDIA_PLAN_RESPONSE_JSON_SCHEMA,
  MediaPlan,
  MediaPlanFormData,
  MediaPlanGenerateOpenAIMeta,
  MediaPlanGenerationStatus,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";
import {
  MediaPlanValidationIssue,
  validateGeneratedMediaPlan,
  validateMediaPlanForm,
} from "@/lib/media-plan/validation";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MEDIA_PLAN_TIMEOUT_MS = 120_000;
const OPENAI_PENDING_STATUSES = new Set(["queued", "in_progress"]);
const MEDIA_PLAN_OUTPUT_CONTRACT = `
Return one JSON object that matches this exact contract. Do not wrap it in markdown or prose.

Required top-level keys: batchPreviewId, campaign, adGroups, planningNotes.
campaign must include: campaignName, brandOrClientName, businessName, campaignObjective, campaignType, biddingStrategy, websiteUrl, finalUrl, startDate, averageDailyBudget, targetCPA, network, networkNotes, targetLocation, language.
Each adGroups item must include: adGroupName, intentType, keywords, displayPath1, displayPath2, headlines, descriptions, sitelinks.

Google Search constraints:
- campaignType must be "Search".
- network must be ["Google Search Only"].
- keywords must be objects with text and matchType ("BROAD", "PHRASE", or "EXACT").
- displayPath1 and displayPath2 must be 15 characters or fewer.
- headlines must contain at least 3 strings, each 30 characters or fewer.
- descriptions must contain at least 2 strings, each 90 characters or fewer.
- Avoid unsupported or unverified claims such as "guaranteed", "#1", "cheapest", specific prices, or review-star claims.
- If the landing page uses licensed/certified/accredited language, keep it only when central to the offer and add a planning warning for human verification.

Notion mapping:
- one adGroups item becomes one Google Ads Ad Group Setup Requests row.
- campaign.brandOrClientName -> "04 Brand / Client Name".
- campaign.campaignName -> "05 Campaign Name".
- campaign.businessName -> "49 Business Name".
- adGroup.displayPath1/displayPath2 -> "28 Display Path 1"/"29 Display Path 2".
- adGroup.keywords -> "18 Keyword 1" through "27 Keyword 10".
`.trim();
const PROMPT_CONTENT_REQUIRED_PATHS = [
  "campaign.campaignName",
  "campaign.brandOrClientName",
  "campaign.businessName",
  "adGroups.0.keywords",
  "adGroups.0.displayPath1",
  "adGroups.0.displayPath2",
] as const;

export class MediaPlanInputError extends Error {
  readonly issues: MediaPlanValidationIssue[];
  readonly httpStatus = 400;

  constructor(issues: MediaPlanValidationIssue[]) {
    super("Please fix the media plan form before generating.");
    this.name = "MediaPlanInputError";
    this.issues = issues;
  }
}

export class MediaPlanConfigError extends Error {
  readonly httpStatus = 500;

  constructor(message: string) {
    super(message);
    this.name = "MediaPlanConfigError";
  }
}

export class MediaPlanOutputError extends Error {
  readonly issues: MediaPlanValidationIssue[];
  readonly httpStatus = 502;

  constructor(message: string, issues: MediaPlanValidationIssue[] = []) {
    super(message);
    this.name = "MediaPlanOutputError";
    this.issues = issues;
  }
}

export interface GenerateMediaPlanResult {
  status: "completed";
  plan: MediaPlan;
  openAi: MediaPlanGenerateOpenAIMeta;
}

export interface PendingMediaPlanGenerationResult {
  status: Exclude<MediaPlanGenerationStatus, "completed">;
  openAi: MediaPlanGenerateOpenAIMeta & {
    responseId: string;
  };
}

export type MediaPlanGenerationResult = GenerateMediaPlanResult | PendingMediaPlanGenerationResult;

interface OpenAIResponsePayload {
  id?: string;
  model?: string;
  status?: string;
  metadata?: Record<string, string>;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  error?: {
    message?: string;
  } | null;
  incomplete_details?: {
    reason?: string;
  } | null;
}

export async function startMediaPlanGeneration(form: MediaPlanFormData): Promise<MediaPlanGenerationResult> {
  const validation = validateMediaPlanForm(form);
  if (!validation.valid) {
    console.warn("[media-plan:generate] validation_failed", {
      paths: validation.issues.map((issue) => issue.path),
    });
    throw new MediaPlanInputError(validation.issues);
  }

  const config = resolveMediaPlanOpenAIConfig();
  console.info("[media-plan:generate] openai_request_started", {
    promptId: config.promptId,
    model: config.model,
    background: true,
  });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: true,
        background: true,
        metadata: buildResponseMetadata(form),
        prompt: {
          id: config.promptId,
          variables: buildPromptVariables(form),
        },
        input: buildRuntimeInstruction(form),
        text: {
          format: {
            type: "json_schema",
            name: "google_search_media_plan",
            strict: true,
            schema: MEDIA_PLAN_RESPONSE_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    console.error("[media-plan:generate] openai_request_failed", {
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new MediaPlanOutputError(
      isAbortError(error)
        ? "OpenAI media plan generation timed out before a response ID was received."
        : "OpenAI media plan generation request failed."
    );
  }

  const parsed = await parseOpenAIResponse(response, "media plan generation");
  return normalizeOpenAIResponse(parsed, {
    fallbackModel: config.model,
    formDefaults: form,
    elapsedMs: Date.now() - startedAt,
    logPrefix: "[media-plan:generate]",
  });
}

export async function retrieveMediaPlanGeneration(
  responseId: string,
  formDefaults?: Partial<MediaPlanFormData> | null
): Promise<MediaPlanGenerationResult> {
  const trimmedResponseId = responseId.trim();
  if (!trimmedResponseId) {
    throw new MediaPlanInputError([{ path: "responseId", message: "OpenAI response ID is required." }]);
  }

  const config = resolveMediaPlanOpenAIReadConfig();
  console.info("[media-plan:generate] openai_response_retrieve_started", {
    responseId: trimmedResponseId,
  });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(`${OPENAI_RESPONSES_ENDPOINT}/${encodeURIComponent(trimmedResponseId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[media-plan:generate] openai_response_retrieve_failed", {
      responseId: trimmedResponseId,
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new MediaPlanOutputError(
      isAbortError(error)
        ? "OpenAI media plan generation timed out; still no valid response received."
        : "OpenAI media plan generation status request failed."
    );
  }

  const parsed = await parseOpenAIResponse(response, "media plan generation status");
  return normalizeOpenAIResponse(parsed, {
    fallbackModel: config.model,
    formDefaults: formDefaults ?? mediaPlanFormFromMetadata(parsed.metadata),
    elapsedMs: Date.now() - startedAt,
    logPrefix: "[media-plan:generate]",
  });
}

export async function generateMediaPlan(form: MediaPlanFormData): Promise<GenerateMediaPlanResult> {
  const result = await startMediaPlanGeneration(form);
  if (result.status !== "completed") {
    throw new MediaPlanOutputError(
      `OpenAI media plan generation is still ${result.status}. Use response ID ${result.openAi.responseId} to poll for completion.`
    );
  }
  return result;
}

async function parseOpenAIResponse(response: Response, label: string): Promise<OpenAIResponsePayload> {
  const bodyText = await response.text();
  if (!response.ok) {
    const message = parseOpenAIErrorMessage(bodyText) ?? (bodyText.slice(0, 240) || "OpenAI request failed.");
    console.error("[media-plan:generate] openai_http_response_failed", {
      status: response.status,
      message,
    });
    throw new MediaPlanOutputError(`OpenAI ${label} failed with status ${response.status}: ${message}`);
  }

  try {
    return JSON.parse(bodyText) as OpenAIResponsePayload;
  } catch {
    throw new MediaPlanOutputError("OpenAI response was not valid JSON.");
  }
}

function normalizeOpenAIResponse(
  parsed: OpenAIResponsePayload,
  options: {
    fallbackModel: string | null;
    formDefaults: Partial<MediaPlanFormData> | null;
    elapsedMs: number;
    logPrefix: string;
  }
): MediaPlanGenerationResult {
  const responseId = parsed.id ?? null;
  const status = normalizeOpenAIStatus(parsed);

  if (status !== "completed") {
    if (OPENAI_PENDING_STATUSES.has(status)) {
      if (!responseId) {
        throw new MediaPlanOutputError("OpenAI response did not include a response ID for polling.");
      }
      console.info(`${options.logPrefix} openai_generation_pending`, {
        responseId,
        status,
        elapsedMs: options.elapsedMs,
      });
      return {
        status: status as Exclude<MediaPlanGenerationStatus, "completed">,
        openAi: {
          responseId,
          model: parsed.model ?? options.fallbackModel,
          startedAt: readStartedAt(parsed.metadata),
          status: status as MediaPlanGenerationStatus,
        },
      };
    }

    const message =
      parsed.error?.message?.trim() ||
      parsed.incomplete_details?.reason?.trim() ||
      `OpenAI media plan generation ended with status ${status}.`;
    console.error(`${options.logPrefix} openai_generation_terminal_failure`, {
      responseId,
      status,
      elapsedMs: options.elapsedMs,
      message,
    });
    throw new MediaPlanOutputError(message);
  }

  const outputText = extractOpenAIOutputText(parsed);
  if (!outputText) {
    console.error(`${options.logPrefix} openai_empty_output`, {
      responseId,
      status,
      elapsedMs: options.elapsedMs,
    });
    throw new MediaPlanOutputError("OpenAI response did not include structured text output.");
  }

  let candidatePlan: unknown;
  try {
    candidatePlan = JSON.parse(outputText) as unknown;
  } catch {
    throw new MediaPlanOutputError("OpenAI media plan output was not valid JSON.");
  }

  const normalizedCandidatePlan = normalizeGeneratedMediaPlanCandidate(
    candidatePlan,
    options.formDefaults,
    responseId
  );
  const outputValidation = validateGeneratedMediaPlan(normalizedCandidatePlan);
  if (!outputValidation.valid || !outputValidation.plan) {
    const paths = outputValidation.issues.map((issue) => issue.path);
    const topLevelKeys = getTopLevelKeys(candidatePlan);
    console.warn(`${options.logPrefix} output_validation_failed`, {
      responseId,
      status,
      model: parsed.model ?? options.fallbackModel,
      elapsedMs: options.elapsedMs,
      topLevelKeys,
      paths,
    });
    const missingContentPaths = paths.filter((path) =>
      PROMPT_CONTENT_REQUIRED_PATHS.some(
        (requiredPath) => path === requiredPath || path.startsWith(`${requiredPath}.`)
      )
    );
    if (missingContentPaths.length > 0) {
      throw new MediaPlanOutputError(
        `OpenAI media plan prompt output was incomplete. Missing required campaign/ad group content: ${missingContentPaths.join(", ")}.`,
        outputValidation.issues
      );
    }
    throw new MediaPlanOutputError(
      "OpenAI media plan output did not match the required Google Search schema.",
      outputValidation.issues
    );
  }

  console.info(`${options.logPrefix} openai_generation_success`, {
    responseId,
    status,
    elapsedMs: options.elapsedMs,
    adGroupCount: outputValidation.plan.adGroups.length,
  });

  return {
    status: "completed",
    plan: outputValidation.plan,
    openAi: {
      responseId,
      model: parsed.model ?? options.fallbackModel,
      startedAt: readStartedAt(parsed.metadata),
      status: "completed",
    },
  };
}

function resolveMediaPlanOpenAIConfig(): {
  apiKey: string;
  model: string;
  promptId: string;
} {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MEDIA_PLAN_MODEL?.trim();
  const promptId = process.env.OPENAI_MEDIA_PLAN_PROMPT_ID?.trim();

  if (!apiKey) {
    throw new MediaPlanConfigError("Missing required env var OPENAI_API_KEY.");
  }
  if (!model) {
    throw new MediaPlanConfigError("Missing required env var OPENAI_MEDIA_PLAN_MODEL.");
  }
  if (!promptId) {
    throw new MediaPlanConfigError("Missing required env var OPENAI_MEDIA_PLAN_PROMPT_ID.");
  }

  return { apiKey, model, promptId };
}

function resolveMediaPlanOpenAIReadConfig(): {
  apiKey: string;
  model: string | null;
} {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MEDIA_PLAN_MODEL?.trim() || null;

  if (!apiKey) {
    throw new MediaPlanConfigError("Missing required env var OPENAI_API_KEY.");
  }

  return { apiKey, model };
}

function buildPromptVariables(form: MediaPlanFormData): Record<string, string> {
  return {
    websiteUrl: form.websiteUrl.trim(),
    adBudget: form.adBudget.trim(),
    googleCid: form.googleCid.trim(),
    campaignType: SUPPORTED_CAMPAIGN_TYPE,
    specialRemarks: form.specialRemarks.trim(),
    targetLocation: form.targetLocation.trim() || DEFAULT_TARGET_LOCATION,
    language: form.language.trim(),
    defaultNetwork: DEFAULT_NETWORK,
    defaultCampaignStatus: DEFAULT_CAMPAIGN_STATUS,
    googleSearchOnlyRule: MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS.googleSearchOnlyRule,
    notionDatabaseContext: MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS.notionDatabaseContext,
    characterLimits: MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS.characterLimits,
    outputContract: MEDIA_PLAN_OUTPUT_CONTRACT,
  };
}

function buildResponseMetadata(form: MediaPlanFormData): Record<string, string> {
  return {
    media_plan_started_at: new Date().toISOString(),
    media_plan_website_url: form.websiteUrl.trim(),
    media_plan_ad_budget: form.adBudget.trim(),
    media_plan_google_cid: form.googleCid.trim(),
    media_plan_target_location: form.targetLocation.trim(),
    media_plan_language: form.language.trim(),
  };
}

function readStartedAt(metadata: Record<string, string> | undefined): string | null {
  const value = metadata?.media_plan_started_at;
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function buildRuntimeInstruction(form: MediaPlanFormData): string {
  return [
    "Generate a Google Search media plan for the dashboard.",
    "",
    "Important source inputs:",
    `Website URL: ${form.websiteUrl.trim()}`,
    `Ad Budget: ${form.adBudget.trim()}`,
    `Google CID: ${form.googleCid.trim()}`,
    `Target Location: ${form.targetLocation.trim() || DEFAULT_TARGET_LOCATION}`,
    `Language: ${form.language.trim() || "English"}`,
    form.specialRemarks.trim() ? `Special Remarks: ${form.specialRemarks.trim()}` : null,
    "",
    MEDIA_PLAN_OUTPUT_CONTRACT,
    "",
    "Return the final answer as only the JSON object. Include real campaign/ad group content; do not leave required ad fields blank.",
    "Avoid unverified claims. If licensing/certification wording is used because it appears central to the landing page, add it to planningNotes.warnings for human review.",
  ]
    .filter(Boolean)
    .join("\n");
}

function mediaPlanFormFromMetadata(metadata: Record<string, string> | undefined): Partial<MediaPlanFormData> | null {
  if (!metadata) {
    return null;
  }

  return {
    websiteUrl: metadata.media_plan_website_url || "",
    adBudget: metadata.media_plan_ad_budget || "",
    googleCid: metadata.media_plan_google_cid || "",
    campaignType: SUPPORTED_CAMPAIGN_TYPE,
    specialRemarks: "",
    targetLocation: metadata.media_plan_target_location || "",
    language: metadata.media_plan_language || "",
  };
}

function normalizeGeneratedMediaPlanCandidate(
  candidate: unknown,
  formDefaults: Partial<MediaPlanFormData> | null,
  responseId: string | null
): unknown {
  const source = unwrapMediaPlanCandidate(candidate);
  if (!isRecord(source)) {
    return source;
  }

  const campaignSource = readCandidateRecord(
    firstPresent(
      source.campaign,
      source.campaign_summary,
      source.campaignSummary,
      source.campaign_settings,
      source.campaignSettings,
      source.searchCampaign,
      source.search_campaign,
      source.settings
    )
  );
  const adGroupsSource = firstPresent(
    source.adGroups,
    source.ad_groups,
    source.adGroupPlan,
    source.ad_group_plan,
    source.groups,
    source.campaignAdGroups,
    campaignSource.adGroups,
    campaignSource.ad_groups
  );
  const planningNotesSource = readCandidateRecord(
    firstPresent(source.planningNotes, source.planning_notes, source.notes, source.planning, source.recommendations)
  );

  const plan: Record<string, unknown> = { ...source };
  plan.batchPreviewId = readCandidateString(plan.batchPreviewId) || buildFallbackBatchPreviewId(responseId);
  plan.campaign = normalizeCampaignCandidate({ ...source, ...campaignSource }, formDefaults);
  plan.adGroups = normalizeAdGroupsCandidate(readCandidateArray(adGroupsSource));
  plan.planningNotes = normalizePlanningNotesCandidate(planningNotesSource);
  appendCertificationReviewWarnings(plan);

  return plan;
}

function normalizeCampaignCandidate(
  campaign: Record<string, unknown>,
  formDefaults: Partial<MediaPlanFormData> | null
): Record<string, unknown> {
  const websiteUrl = readCandidateString(campaign.websiteUrl ?? campaign.website_url) || formDefaults?.websiteUrl || "";
  const targetLocation = splitInputList(formDefaults?.targetLocation || DEFAULT_TARGET_LOCATION);
  const language = splitInputList(formDefaults?.language || "English");
  const campaignObjective = firstPresent(
    campaign.campaignObjective,
    campaign.campaign_objective,
    campaign.objective,
    campaign.goal
  );
  const biddingStrategy = firstPresent(
    campaign.biddingStrategy,
    campaign.bidding_strategy,
    campaign.optimizationFocus,
    campaign.optimization_focus,
    campaign.campaignFocus,
    campaign.bidStrategy
  );

  return {
    ...campaign,
    campaignName: firstPresent(campaign.campaignName, campaign.campaign_name, campaign.name, campaign.title),
    brandOrClientName:
      firstPresent(
        campaign.brandOrClientName,
        campaign.brand_or_client_name,
        campaign.clientName,
        campaign.client_name,
        campaign.brandName,
        campaign.brand_name,
        campaign.brand
      ),
    businessName:
      firstPresent(
        campaign.businessName,
        campaign.business_name,
        campaign.companyName,
        campaign.company_name,
        campaign.company,
        campaign.advertiserName
      ),
    campaignObjective: normalizeCampaignObjective(campaignObjective),
    campaignType: "Search",
    biddingStrategy: normalizeBiddingStrategy(biddingStrategy),
    websiteUrl,
    finalUrl: readCandidateString(campaign.finalUrl ?? campaign.final_url) || websiteUrl,
    averageDailyBudget:
      readCandidateNumber(
        campaign.averageDailyBudget ??
          campaign.average_daily_budget ??
          campaign.dailyBudget ??
          campaign.daily_budget ??
          campaign.budget
      ) ??
      parseBudget(formDefaults?.adBudget || ""),
    network: ["Google Search Only"],
    networkNotes:
      readCandidateString(campaign.networkNotes ?? campaign.network_notes) ||
      "Google Search only. Search partners and Display Network are excluded.",
    targetLocation: readCandidateStringArray(campaign.targetLocation ?? campaign.target_location, targetLocation),
    language: readCandidateStringArray(campaign.language, language),
  };
}

function normalizeAdGroupsCandidate(value: unknown[]): unknown[] {
  return value.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    const rsa = readCandidateRecord(item.responsiveSearchAd ?? item.responsive_search_ad ?? item.rsa);
    const adCopy = readCandidateRecord(item.adCopy ?? item.ad_copy ?? item.copy);
    const extensions = readCandidateRecord(item.extensions);
    const displayPaths = readCandidateArray(item.displayPaths ?? item.display_paths);

    return {
      ...item,
      adGroupName: item.adGroupName ?? item.ad_group_name ?? item.adGroup ?? item.ad_group ?? item.name ?? item.theme,
      intentType: item.intentType ?? item.intent_type ?? item.intent ?? item.theme ?? item.audienceIntent,
      keywords: normalizeKeywords(
        firstPresent(
          getCandidateValue(item, "keywords", "keywordIdeas", "keyword_ideas", "keywordPlan", "keyword_plan"),
          extractNumberedValues(item, "Keyword")
        )
      ),
      displayPath1:
        getCandidateValue(item, "displayPath1", "display_path_1", "path1") ??
        getCandidateValue(rsa, "path1") ??
        displayPaths[0],
      displayPath2:
        getCandidateValue(item, "displayPath2", "display_path_2", "path2") ??
        getCandidateValue(rsa, "path2") ??
        displayPaths[1],
      headlines: normalizeTextArray(
        firstPresent(
          getCandidateValue(item, "headlines"),
          getCandidateValue(rsa, "headlines"),
          getCandidateValue(adCopy, "headlines"),
          extractNumberedValues(item, "Headline")
        ),
        30
      ),
      descriptions: normalizeTextArray(
        firstPresent(
          getCandidateValue(item, "descriptions"),
          getCandidateValue(rsa, "descriptions"),
          getCandidateValue(adCopy, "descriptions"),
          extractNumberedValues(item, "Description")
        ),
        90
      ),
      sitelinks: normalizeSitelinks(firstPresent(getCandidateValue(item, "sitelinks", "siteLinks"), extensions.sitelinks)),
    };
  });
}

function normalizePlanningNotesCandidate(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    strategy: value.strategy ?? "",
    assumptions: Array.isArray(value.assumptions) ? value.assumptions : [],
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
  };
}

function unwrapMediaPlanCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) {
    return candidate;
  }
  return (
    firstPresent(
      candidate.mediaPlan,
      candidate.media_plan,
      candidate.plan,
      candidate.result,
      candidate.output,
      candidate.googleSearchMediaPlan,
      candidate.google_search_media_plan
    ) ?? candidate
  );
}

function normalizeKeywords(value: unknown): unknown {
  const items = isRecord(value) ? Object.values(value) : value;
  if (!Array.isArray(items)) {
    return value;
  }

  return items
    .map((item) => {
      if (typeof item === "string") {
        const parsed = parseKeywordText(item);
        return parsed.text ? parsed : null;
      }
      if (!isRecord(item)) {
        return null;
      }
      const rawText = readCandidateString(getCandidateValue(item, "text", "keyword", "value", "term"));
      const parsed = parseKeywordText(rawText);
      const matchType = normalizeKeywordMatchType(
        getCandidateValue(item, "matchType", "match_type", "type") ?? parsed.matchType
      );
      return parsed.text ? { text: parsed.text, matchType } : null;
    })
    .filter(Boolean);
}

function parseKeywordText(value: string): { text: string; matchType: "BROAD" | "PHRASE" | "EXACT" } {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return { text: trimmed.slice(1, -1).trim(), matchType: "EXACT" };
  }
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return { text: trimmed.slice(1, -1).trim(), matchType: "PHRASE" };
  }
  return { text: trimmed, matchType: "BROAD" };
}

function normalizeKeywordMatchType(value: unknown): "BROAD" | "PHRASE" | "EXACT" {
  const normalized = readCandidateString(value).toUpperCase().replace(/\s+/g, "_");
  if (normalized.includes("EXACT")) {
    return "EXACT";
  }
  if (normalized.includes("PHRASE")) {
    return "PHRASE";
  }
  return "BROAD";
}

function normalizeCampaignObjective(value: unknown): string {
  const normalized = readCandidateString(value).toLowerCase();
  if (normalized.includes("sale") || normalized.includes("revenue")) {
    return "Sales";
  }
  if (normalized.includes("traffic") || normalized.includes("visit")) {
    return "Website Traffic";
  }
  if (normalized.includes("lead") || normalized.includes("conversion") || normalized.includes("enquiry")) {
    return "Leads";
  }
  return readCandidateString(value);
}

function normalizeBiddingStrategy(value: unknown): string {
  const normalized = readCandidateString(value).toLowerCase();
  if (normalized.includes("click") || normalized.includes("traffic")) {
    return "Clicks";
  }
  if (normalized.includes("conversion") || normalized.includes("lead") || normalized.includes("cpa")) {
    return "Conversions";
  }
  return readCandidateString(value);
}

function normalizeTextArray(value: unknown, maxLength: number): unknown {
  const items = isRecord(value) ? Object.values(value) : value;
  if (!Array.isArray(items)) {
    return value;
  }
  return items
    .map((item) =>
      isRecord(item)
        ? readCandidateString(getCandidateValue(item, "text", "value", "copy", "headline", "description"))
        : readCandidateString(item)
    )
    .map((item) => trimToLimit(item, maxLength))
    .filter(Boolean);
}

function normalizeSitelinks(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return Array.isArray(value) ? value : [];
  }
  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const title = readCandidateString(item.title ?? item.text ?? item.name);
      const url = readCandidateString(item.url ?? item.finalUrl ?? item.final_url ?? item.href);
      return title || url ? { title, url } : null;
    })
    .filter(Boolean);
}

function appendCertificationReviewWarnings(plan: Record<string, unknown>) {
  const adGroups = readCandidateArray(plan.adGroups);
  const flaggedValues: string[] = [];

  for (const adGroup of adGroups) {
    if (!isRecord(adGroup)) {
      continue;
    }
    collectCertificationClaims(flaggedValues, readCandidateArray(adGroup.keywords));
    collectCertificationClaims(flaggedValues, readCandidateArray(adGroup.headlines));
    collectCertificationClaims(flaggedValues, readCandidateArray(adGroup.descriptions));
    collectCertificationClaims(flaggedValues, readCandidateArray(adGroup.sitelinks));
  }

  if (flaggedValues.length === 0) {
    return;
  }

  const planningNotes = readCandidateRecord(plan.planningNotes);
  const existingWarnings = readCandidateStringArray(planningNotes.warnings, []);
  const uniqueClaims = Array.from(new Set(flaggedValues)).slice(0, 8);
  plan.planningNotes = {
    ...planningNotes,
    warnings: [
      ...existingWarnings,
      `Verify licensing/certification claim before approval: ${uniqueClaims.join("; ")}.`,
    ],
  };
}

function collectCertificationClaims(target: string[], values: unknown[]) {
  for (const value of values) {
    const text = isRecord(value)
      ? readCandidateString(firstPresent(value.text, value.title, value.value, value.copy, value.keyword))
      : readCandidateString(value);
    if (hasCertificationClaim(text)) {
      target.push(text);
    }
  }
}

function hasCertificationClaim(value: string): boolean {
  return /\b(?:certified|licensed|accredited|berlesen)\b/i.test(value);
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getCandidateValue(object: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "") {
      return object[key];
    }
  }

  const normalizedEntries = Object.entries(object).map(([key, value]) => [
    key.toLowerCase().replace(/[^a-z0-9]/g, ""),
    value,
  ] as const);
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = normalizedEntries.find(([candidateKey, value]) => candidateKey === normalizedKey && value !== "");
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function extractNumberedValues(object: Record<string, unknown>, label: "Keyword" | "Headline" | "Description"): unknown[] {
  const matcher = new RegExp(`^\\d+\\s+${label}\\s+\\d+$`, "i");
  return Object.entries(object)
    .filter(([key, value]) => matcher.test(key) && value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => Number(left.split(" ")[0]) - Number(right.split(" ")[0]))
    .map(([, value]) => value);
}

function trimToLimit(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const clipped = trimmed.slice(0, maxLength).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > 12 ? clipped.slice(0, lastSpace).trimEnd() : clipped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCandidateRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readCandidateArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readCandidateString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readCandidateNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readCandidateStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const items = value.map((item) => readCandidateString(item)).filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }
  const single = readCandidateString(value);
  if (single) {
    return splitInputList(single);
  }
  return fallback;
}

function splitInputList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBudget(value: string): number | undefined {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildFallbackBatchPreviewId(responseId: string | null): string {
  const suffix = responseId?.replace(/^resp_/, "").slice(0, 12) || Date.now().toString(36);
  return `preview-${suffix}`;
}

function getTopLevelKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveOpenAIRequestTimeoutMs());
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOpenAIStatus(response: OpenAIResponsePayload): string {
  if (response.status?.trim()) {
    return response.status.trim();
  }
  return extractOpenAIOutputText(response) ? "completed" : "unknown";
}

function resolveOpenAIRequestTimeoutMs(): number {
  const raw = process.env.OPENAI_MEDIA_PLAN_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_MEDIA_PLAN_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MEDIA_PLAN_TIMEOUT_MS;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function extractOpenAIOutputText(response: OpenAIResponsePayload): string | null {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content &&
        typeof content === "object" &&
        "type" in content &&
        content.type === "output_text" &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }

  return null;
}

function parseOpenAIErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as OpenAIResponsePayload;
    return parsed.error?.message?.trim() || null;
  } catch {
    return null;
  }
}
