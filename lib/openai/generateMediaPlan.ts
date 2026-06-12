import {
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_NETWORK,
  DEFAULT_TARGET_LOCATION,
  MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS,
  MEDIA_PLAN_RESPONSE_JSON_SCHEMA,
  MediaPlan,
  MediaPlanFormData,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";
import {
  MediaPlanValidationIssue,
  validateGeneratedMediaPlan,
  validateMediaPlanForm,
} from "@/lib/media-plan/validation";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MEDIA_PLAN_TIMEOUT_MS = 45_000;

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
  plan: MediaPlan;
  openAi: {
    responseId: string | null;
    model: string | null;
  };
}

interface OpenAIResponsePayload {
  id?: string;
  model?: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  error?: {
    message?: string;
  } | null;
}

export async function generateMediaPlan(form: MediaPlanFormData): Promise<GenerateMediaPlanResult> {
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
  });
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
        prompt: {
          id: config.promptId,
          variables: buildPromptVariables(form),
        },
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
      message: error instanceof Error ? error.message : String(error),
    });
    throw new MediaPlanOutputError("OpenAI media plan generation request failed.");
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const message = parseOpenAIErrorMessage(bodyText) ?? (bodyText.slice(0, 240) || "OpenAI request failed.");
    console.error("[media-plan:generate] openai_response_failed", {
      status: response.status,
      message,
    });
    throw new MediaPlanOutputError(`OpenAI media plan generation failed with status ${response.status}: ${message}`);
  }

  let parsed: OpenAIResponsePayload;
  try {
    parsed = JSON.parse(bodyText) as OpenAIResponsePayload;
  } catch {
    throw new MediaPlanOutputError("OpenAI response was not valid JSON.");
  }

  const outputText = extractOpenAIOutputText(parsed);
  if (!outputText) {
    console.error("[media-plan:generate] openai_empty_output");
    throw new MediaPlanOutputError("OpenAI response did not include structured text output.");
  }

  let candidatePlan: unknown;
  try {
    candidatePlan = JSON.parse(outputText) as unknown;
  } catch {
    throw new MediaPlanOutputError("OpenAI media plan output was not valid JSON.");
  }

  const outputValidation = validateGeneratedMediaPlan(candidatePlan);
  if (!outputValidation.valid || !outputValidation.plan) {
    console.warn("[media-plan:generate] output_validation_failed", {
      paths: outputValidation.issues.map((issue) => issue.path),
    });
    throw new MediaPlanOutputError(
      "OpenAI media plan output did not match the required Google Search schema.",
      outputValidation.issues
    );
  }

  console.info("[media-plan:generate] openai_generation_success", {
    responseId: parsed.id ?? null,
    adGroupCount: outputValidation.plan.adGroups.length,
  });

  return {
    plan: outputValidation.plan,
    openAi: {
      responseId: parsed.id ?? null,
      model: parsed.model ?? config.model,
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
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_MEDIA_PLAN_TIMEOUT_MS);
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
