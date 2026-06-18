import { getCredentials, normalizeGoogleAccountId } from "@/lib/reporting/env";
import {
  GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID,
  normalizeNotionDataSourceId,
} from "@/lib/media-plan/notionMapper";
import {
  type MediaPlanCampaignObjective,
  type MediaPlanCreateCampaignFailureResponse,
  type MediaPlanCreateCampaignSuccessResponse,
  normalizeMediaPlanCampaignObjective,
} from "@/lib/media-plan/schema";

export interface CreateSearchCampaignFromMediaPlanInput {
  batchId: string;
  googleCid: string;
  source?: "media-plan";
  dryRun?: boolean;
  validateOnly?: boolean;
  onProgress?: (stepId: string, message?: string) => void | Promise<void>;
}

export interface MediaPlanCampaignDryRunResult {
  success: true;
  source: "media-plan";
  batchId: string;
  customerId: string;
  dryRun: true;
  plannedPayload: PlannedMediaPlanCampaign;
}

export interface MediaPlanCampaignValidateOnlyResult {
  success: true;
  source: "media-plan";
  batchId: string;
  customerId: string;
  validateOnly: true;
  plannedPayload: PlannedMediaPlanCampaign;
}

export type CreateSearchCampaignFromMediaPlanResult =
  | MediaPlanCreateCampaignSuccessResponse
  | MediaPlanCreateCampaignFailureResponse
  | MediaPlanCampaignDryRunResult
  | MediaPlanCampaignValidateOnlyResult;

interface NotionPropertySchema {
  type?: string;
}

interface NotionPage {
  id: string;
  url?: string;
  properties?: Record<string, unknown>;
}

interface MediaPlanNotionRow {
  pageId: string;
  pageUrl: string;
  adAccountPageId: string;
  adGroupName: string;
  campaignName: string;
  campaignType: string;
  websiteUrl: string;
  finalUrl: string;
  startDate: string;
  averageDailyBudget: number | null;
  targetCPA: number | null;
  campaignObjective: string;
  biddingStrategy: string;
  network: string[];
  targetLocation: string[];
  language: string[];
  status: string;
  missingInfo: boolean;
  missingInfoNotes: string;
  setupNotes: string;
  reviewNotes: string;
  displayPath1: string;
  displayPath2: string;
  keywords: GoogleKeyword[];
  headlines: string[];
  descriptions: string[];
}

interface GoogleKeyword {
  text: string;
  matchType: "BROAD" | "PHRASE" | "EXACT";
}

interface MediaPlanRowGroup {
  adAccountPageId: string;
  campaignName: string;
  campaignType: "Search";
  websiteUrl: string;
  finalUrl: string;
  startDate: string;
  averageDailyBudget: number;
  targetCPA: number | null;
  campaignObjective: MediaPlanCampaignObjective;
  biddingStrategy: "Conversions" | "Clicks";
  network: ["Google Search Only"];
  targetLocation: string[];
  language: string[];
  rows: MediaPlanNotionRow[];
}

interface PlannedMediaPlanCampaign {
  campaign: {
    name: string;
    status: "PAUSED";
    advertisingChannelType: "SEARCH";
    averageDailyBudget: number;
    finalUrl: string;
    startDate: string;
    network: ["Google Search Only"];
    targetLocation: string[];
    language: string[];
    biddingStrategy: "MAXIMIZE_CONVERSIONS" | "TARGET_SPEND";
    targetCPA: number | null;
  };
  adGroups: Array<{
    name: string;
    keywords: GoogleKeyword[];
    responsiveSearchAd: {
      finalUrl: string;
      displayPath1: string;
      displayPath2: string;
      headlines: string[];
      descriptions: string[];
    };
  }>;
  operations?: unknown[];
}

interface GoogleAdsConfig {
  customerId: string;
  loginCustomerId: string | null;
  developerToken: string;
  accessToken: string;
  apiVersion: string;
  canRefreshAccessToken: boolean;
}

interface LinkedGoogleAdAccount {
  pageId: string;
  accountName: string;
  customerId: string;
  loginCustomerId: string | null;
  accessPath: string;
}

interface ResolvedTargeting {
  geoTargets: Array<{ resourceName: string; name?: string }>;
  languages: Array<{ resourceName: string; name?: string; fallback?: boolean }>;
}

interface PolicyViolationExemption {
  operationIndex: number;
  key: {
    policyName: string;
    violatingText: string;
  };
}

class GoogleAdsApiRequestError extends Error {
  readonly failedStep: string;
  readonly status: number;
  readonly payload: unknown;

  constructor(failedStep: string, status: number, message: string, payload: unknown) {
    super(message);
    this.name = "GoogleAdsApiRequestError";
    this.failedStep = failedStep;
    this.status = status;
    this.payload = payload;
  }
}

const NOTION_API_VERSION = "2026-03-11";
const NOTION_API_BASE = "https://api.notion.com/v1";
const GOOGLE_ADS_API_DEFAULT_VERSION = "v24";
const GOOGLE_ADS_REQUEST_TIMEOUT_MS = 180_000;
const NOTION_REQUEST_TIMEOUT_MS = 60_000;
const MEDIA_PLAN_SOURCE = "media-plan";
const CAMPAIGN_RESULT_NOTE_PREFIX = "GoogleAdsCampaignID:";
const CAMPAIGN_RESOURCE_NOTE_PREFIX = "GoogleAdsCampaignResourceName:";
const LANGUAGE_FALLBACKS = new Map([
  ["English", "languageConstants/1000"],
  ["Malay", "languageConstants/1019"],
  ["Chinese", "languageConstants/1017"],
]);

export async function createSearchCampaignFromMediaPlan(
  input: CreateSearchCampaignFromMediaPlanInput
): Promise<CreateSearchCampaignFromMediaPlanResult> {
  const normalized = normalizeInput(input);
  let notionRows: MediaPlanNotionRow[] = [];

  try {
    const notionConfig = resolveNotionConfig();
    const notionDataSource = await retrieveNotionDataSource(notionConfig);
    const pages = await queryMediaPlanBatchPages(notionConfig, notionDataSource.properties, normalized.batchId);
    notionRows = pages.map(pageToMediaPlanRow);
    const group = validateAndGroupRows(notionRows, normalized);
    const linkedAccount = await resolveLinkedGoogleAdAccount(notionConfig, group.adAccountPageId, normalized.googleCid);
    const plannedPayload = buildPlannedPayload(group);

    if (normalized.dryRun) {
      console.info("[media-plan:create-campaign] google_ads_dry_run_started", {
        batchId: normalized.batchId,
        customerId: linkedAccount.customerId,
        loginCustomerId: linkedAccount.loginCustomerId,
        rowCount: group.rows.length,
      });
      return {
        success: true,
        source: MEDIA_PLAN_SOURCE,
        batchId: normalized.batchId,
        customerId: linkedAccount.customerId,
        dryRun: true,
        plannedPayload,
      };
    }

    console.info("[media-plan:create-campaign] google_ads_creation_started", {
      batchId: normalized.batchId,
      customerId: linkedAccount.customerId,
      loginCustomerId: linkedAccount.loginCustomerId,
      rowCount: group.rows.length,
    });
    await input.onProgress?.("connecting_google_ads", "Connecting to Google Ads.");
    const googleAdsConfig = await resolveGoogleAdsConfig(linkedAccount);
    await assertNoExistingCampaign(googleAdsConfig, group.campaignName);
    const targeting = await resolveTargeting(googleAdsConfig, group);
    let mutateOperations = buildGoogleAdsMutateOperations(googleAdsConfig.customerId, group, targeting);
    console.log("TODO: Sitelink creation not implemented for media-plan source.");
    mutateOperations = await googleAdsValidateMutateWithPolicyExemptions(googleAdsConfig, mutateOperations);
    console.info("[media-plan:create-campaign] google_ads_validate_only_passed", {
      batchId: normalized.batchId,
      customerId: googleAdsConfig.customerId,
      operationCount: mutateOperations.length,
    });

    if (normalized.validateOnly) {
      return {
        success: true,
        source: MEDIA_PLAN_SOURCE,
        batchId: normalized.batchId,
        customerId: googleAdsConfig.customerId,
        validateOnly: true,
        plannedPayload,
      };
    }

    await updateRowsForSetup(notionConfig, notionDataSource.properties, notionRows);
    console.info("[media-plan:create-campaign] notion_status_updated", {
      batchId: normalized.batchId,
      status: "In Setup",
      rowCount: notionRows.length,
    });
    await input.onProgress?.("creating_paused_campaign", "Creating paused campaign in Google Ads.");
    const mutateResponse = await googleAdsMutate(googleAdsConfig, mutateOperations);
    const campaignResourceName = extractCampaignResourceName(mutateResponse) || "";
    const campaignId = campaignResourceName.split("/").pop() || "";
    if (!campaignResourceName || !campaignId) {
      throw stepError("google_ads_api", "Google Ads mutate response did not include a campaign resource name.");
    }
    const googleAdsReviewLink = buildGoogleAdsReviewLink(googleAdsConfig.customerId, campaignId);

    await input.onProgress?.("returning_review_link", "Returning Google Ads review link.");
    await updateRowsForSuccess(notionConfig, notionDataSource.properties, notionRows, {
      batchId: normalized.batchId,
      campaignId,
      campaignResourceName,
      googleAdsReviewLink,
    });
    console.info("[media-plan:create-campaign] notion_status_updated", {
      batchId: normalized.batchId,
      status: "Pending Review",
      rowCount: notionRows.length,
    });
    console.info("[media-plan:create-campaign] google_ads_campaign_created", {
      batchId: normalized.batchId,
      customerId: googleAdsConfig.customerId,
      campaignId,
      campaignStatus: "PAUSED",
    });

    return {
      success: true,
      source: MEDIA_PLAN_SOURCE,
      batchId: normalized.batchId,
      customerId: googleAdsConfig.customerId,
      campaignId,
      campaignResourceName,
      campaignStatus: "PAUSED",
      createdAdGroups: group.rows.length,
      createdAds: group.rows.length,
      googleAdsReviewLink,
    };
  } catch (error) {
    const failure = normalizeFailure(error, normalized.batchId, notionRows);
    console.error("[media-plan:create-campaign] google_ads_creation_failed", {
      batchId: normalized.batchId,
      failedStep: failure.failedStep,
      error: failure.error,
    });
    if (failure.duplicate) {
      return failure;
    }
    if (!normalized.dryRun && !normalized.validateOnly && notionRows.length > 0) {
      try {
        const notionConfig = resolveNotionConfig();
        const notionDataSource = await retrieveNotionDataSource(notionConfig);
        const retryableOperationalFailure = isRetryableOperationalFailure(failure.failedStep);
        await updateRowsForFailure(notionConfig, notionDataSource.properties, notionRows, failure.error, {
          retryable: retryableOperationalFailure,
        });
        console.info("[media-plan:create-campaign] notion_status_updated", {
          batchId: normalized.batchId,
          status: retryableOperationalFailure ? "Ready for Setup" : "Missing Info",
          rowCount: notionRows.length,
        });
      } catch (updateError) {
        const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
        failure.error = `${failure.error} Notion failure status update also failed: ${updateMessage}`;
      }
    }
    return failure;
  }
}

export function buildMediaPlanCliUsage(): string {
  return `
Usage:
  node scripts/create_campaign_from_notion.mjs --batchId <MP-YYYYMMDD-HHMMSS> --googleCid <cid> --source=media-plan [--dryRun] [--validateOnly]

Media plan options:
  --batchId <id>          Approved media-plan batch ID.
  --googleCid <cid>       Google Ads customer ID.
  --source=media-plan     Required for the Phase 4 media-plan flow.
  --dryRun                Query Notion and print the planned payload without Google Ads or Notion updates.
  --validateOnly          Validate the planned Google Ads mutate request without creating anything.
`.trim();
}

export function parseMediaPlanCliArgs(argv: string[]): CreateSearchCampaignFromMediaPlanInput | null {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--source=")) {
      args.source = arg.slice("--source=".length);
    } else if (arg === "--source") {
      args.source = argv[++index] || "";
    } else if (arg === "--batchId") {
      args.batchId = argv[++index] || "";
    } else if (arg.startsWith("--batchId=")) {
      args.batchId = arg.slice("--batchId=".length);
    } else if (arg === "--googleCid") {
      args.googleCid = argv[++index] || "";
    } else if (arg.startsWith("--googleCid=")) {
      args.googleCid = arg.slice("--googleCid=".length);
    } else if (arg === "--dryRun") {
      args.dryRun = true;
    } else if (arg === "--validateOnly" || arg === "--validate-only") {
      args.validateOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  if (args.help) {
    return {
      batchId: "",
      googleCid: "",
      source: "media-plan",
      dryRun: Boolean(args.dryRun),
      validateOnly: Boolean(args.validateOnly),
    };
  }

  if (args.source !== MEDIA_PLAN_SOURCE && !args.batchId && !args.googleCid) {
    return null;
  }

  return {
    batchId: String(args.batchId || ""),
    googleCid: String(args.googleCid || ""),
    source: args.source === MEDIA_PLAN_SOURCE ? MEDIA_PLAN_SOURCE : undefined,
    dryRun: Boolean(args.dryRun),
    validateOnly: Boolean(args.validateOnly),
  };
}

type NormalizedCreateSearchCampaignInput = Omit<CreateSearchCampaignFromMediaPlanInput, "source"> & {
  batchId: string;
  googleCid: string;
  source: "media-plan";
  dryRun: boolean;
  validateOnly: boolean;
};

function normalizeInput(input: CreateSearchCampaignFromMediaPlanInput): NormalizedCreateSearchCampaignInput {
  const batchId = input.batchId?.trim();
  const googleCid = normalizeGoogleAccountId(input.googleCid || "");
  if (!batchId) {
    throw stepError("validation", "batchId is required.");
  }
  if (!/^MP-\d{8}-\d{6}$/.test(batchId)) {
    throw stepError("validation", "batchId must use MP-YYYYMMDD-HHMMSS format.");
  }
  if (!googleCid) {
    throw stepError("validation", "googleCid is required.");
  }
  if (!/^\d{10}$/.test(googleCid)) {
    throw stepError("validation", "googleCid must contain exactly 10 digits.");
  }
  if (input.source && input.source !== MEDIA_PLAN_SOURCE) {
    throw stepError("validation", "Only source=media-plan is supported by this flow.");
  }
  return {
    batchId,
    googleCid,
    source: MEDIA_PLAN_SOURCE,
    dryRun: Boolean(input.dryRun),
    validateOnly: Boolean(input.validateOnly),
  };
}

function resolveNotionConfig() {
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!notionToken) {
    throw stepError("configuration", "Missing required env var NOTION_TOKEN.");
  }
  return {
    token: notionToken,
    dataSourceId: normalizeNotionDataSourceId(
      process.env.NOTION_GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID?.trim() ||
        GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID
    ),
  };
}

async function retrieveNotionDataSource(config: ReturnType<typeof resolveNotionConfig>) {
  const data = await notionRequest(config, `/data_sources/${config.dataSourceId}`, { method: "GET" });
  return {
    properties:
      data && typeof data === "object" && "properties" in data && typeof data.properties === "object"
        ? (data.properties as Record<string, NotionPropertySchema>)
        : {},
  };
}

async function queryMediaPlanBatchPages(
  config: ReturnType<typeof resolveNotionConfig>,
  schemas: Record<string, NotionPropertySchema>,
  batchId: string
): Promise<NotionPage[]> {
  const filters = ["69 Setup Notes", "70 Review Notes"]
    .map((property) => buildTextContainsFilter(property, schemas[property]?.type, batchId))
    .filter((filter): filter is Record<string, unknown> => Boolean(filter));
  if (filters.length === 0) {
    throw stepError("notion_query", "Notion setup/review note properties are not text-searchable.");
  }

  const pages: NotionPage[] = [];
  let startCursor: string | undefined;
  do {
    const data = await notionRequest(config, `/data_sources/${config.dataSourceId}/query`, {
      method: "POST",
      body: {
        page_size: 100,
        start_cursor: startCursor,
        filter: filters.length === 1 ? filters[0] : { or: filters },
      },
    });
    pages.push(...(((data as { results?: NotionPage[] }).results || []) as NotionPage[]));
    startCursor = (data as { has_more?: boolean; next_cursor?: string }).has_more
      ? (data as { next_cursor?: string }).next_cursor
      : undefined;
  } while (startCursor);

  return pages;
}

function pageToMediaPlanRow(page: NotionPage): MediaPlanNotionRow {
  const props = page.properties || {};
  return {
    pageId: page.id,
    pageUrl: page.url || "",
    adAccountPageId: readFirstRelationId(props, "02 Client / Ad Account") || readFirstRelationId(props, "09 Client / Ad Account"),
    adGroupName: readTitle(props, "01 Ad Group Name"),
    campaignName: readText(props, "05 Campaign Name"),
    campaignType: readOption(props, "07 Campaign Type"),
    websiteUrl: readUrlOrText(props, "09 Website URL"),
    finalUrl: readUrlOrText(props, "10 Final URL"),
    startDate: readDate(props, "11 Start Date"),
    averageDailyBudget: readNumber(props, "12 Average Daily Budget"),
    targetCPA: readNumber(props, "13 Target CPA"),
    campaignObjective: readOption(props, "06 Campaign Objective") || "Leads",
    biddingStrategy: readOption(props, "08 Bidding Strategy") || readOption(props, "08 Optimization Focus") || "Conversions",
    network: readOptions(props, "14 Network"),
    targetLocation: readOptions(props, "16 Target Location"),
    language: readOptions(props, "17 Language"),
    status: readOption(props, "65 Status"),
    missingInfo: readCheckbox(props, "67 Missing Info"),
    missingInfoNotes: readText(props, "68 Missing Info Notes"),
    setupNotes: readText(props, "69 Setup Notes"),
    reviewNotes: readText(props, "70 Review Notes"),
    displayPath1: readText(props, "28 Display Path 1"),
    displayPath2: readText(props, "29 Display Path 2"),
    keywords: readNumberedTexts(props, 18, 27, "Keyword").map(parseKeyword).filter(isKeyword),
    headlines: readNumberedTexts(props, 30, 44, "Headline"),
    descriptions: readNumberedTexts(props, 45, 48, "Description"),
  };
}

function validateAndGroupRows(
  rows: MediaPlanNotionRow[],
  input: NormalizedCreateSearchCampaignInput
): MediaPlanRowGroup {
  if (rows.length === 0) {
    throw stepError("validation", `No Notion rows matched batch ID ${input.batchId}.`);
  }
  const issues: string[] = [];
  const first = rows[0];
  const adAccountPageIds = Array.from(new Set(rows.map((row) => row.adAccountPageId).filter(Boolean)));
  if (adAccountPageIds.length === 0) {
    issues.push("All rows must include the 02 Client / Ad Account relation.");
  } else if (adAccountPageIds.length > 1) {
    issues.push("All rows in one media-plan batch must use the same 02 Client / Ad Account relation.");
  }

  const sharedFields: Array<[keyof MediaPlanNotionRow, string]> = [
    ["campaignName", "05 Campaign Name"],
    ["campaignType", "07 Campaign Type"],
    ["websiteUrl", "09 Website URL"],
    ["finalUrl", "10 Final URL"],
    ["averageDailyBudget", "12 Average Daily Budget"],
  ];

  for (const row of rows) {
    for (const [key, label] of sharedFields) {
      if (JSON.stringify(row[key]) !== JSON.stringify(first[key])) {
        issues.push(`All rows must have the same ${label}.`);
      }
    }
    if (JSON.stringify(row.targetLocation) !== JSON.stringify(first.targetLocation)) {
      issues.push("All rows must have the same 16 Target Location.");
    }
    if (JSON.stringify(row.language) !== JSON.stringify(first.language)) {
      issues.push("All rows must have the same 17 Language.");
    }
    if (row.campaignType !== "Search") {
      issues.push(`Row ${row.pageId} campaign type must be Search.`);
    }
    if (!["Ready for Setup", "In Setup"].includes(row.status) && !isRetryableMissingInfoRow(row)) {
      issues.push(`Row ${row.pageId} status must be Ready for Setup, In Setup, or retryable Missing Info from a previous Google Ads setup failure.`);
    }
    if (hasCampaignResultForBatch(row.reviewNotes, input.batchId)) {
      throw duplicateError(input.batchId, rows);
    }
    if (!row.setupNotes.includes(input.batchId) && !row.reviewNotes.includes(input.batchId)) {
      issues.push(`Row ${row.pageId} must include batch ID ${input.batchId} in 69 Setup Notes or 70 Review Notes.`);
    }
    if (!row.adGroupName.trim()) issues.push(`Row ${row.pageId} needs a valid ad group name.`);
    if (row.keywords.length < 1) issues.push(`Row ${row.pageId} needs at least one valid keyword.`);
    if (row.headlines.length < 3) issues.push(`Row ${row.pageId} needs at least 3 valid headlines.`);
    if (row.descriptions.length < 2) issues.push(`Row ${row.pageId} needs at least 2 valid descriptions.`);
    pushLengthIssues(issues, row.headlines, 30, `Headline on ${row.adGroupName || row.pageId}`);
    pushLengthIssues(issues, row.descriptions, 90, `Description on ${row.adGroupName || row.pageId}`);
    pushLengthIssues(issues, [row.displayPath1, row.displayPath2].filter(Boolean), 15, `Display path on ${row.adGroupName || row.pageId}`);
    if (!isValidUrl(row.finalUrl)) issues.push(`Row ${row.pageId} final URL must be valid.`);
  }

  if (!isValidUrl(first.websiteUrl)) issues.push("Website URL must be valid.");
  if (!isValidUrl(first.finalUrl)) issues.push("Final URL must be valid.");
  if (!first.averageDailyBudget || first.averageDailyBudget <= 0) {
    issues.push("Average daily budget must be numeric and greater than 0.");
  }
  if (!first.network.includes("Google Search Only")) {
    issues.push("Network must be Google Search Only.");
  }
  const normalizedObjective = normalizeCampaignObjective(first.campaignObjective);
  if (!normalizedObjective) {
    issues.push("Campaign objective must match a supported Google Ads objective.");
  }
  if (!["Conversions", "Clicks"].includes(first.biddingStrategy)) {
    issues.push("Bidding strategy must be Conversions or Clicks.");
  }
  if (first.language.some((language) => !["English", "Malay", "Chinese"].includes(language))) {
    issues.push("Language must be English, Malay, or Chinese.");
  }
  if (!first.targetLocation.length) {
    issues.push("Target location is required.");
  }
  if (!first.language.length) {
    issues.push("Language is required.");
  }

  if (issues.length > 0) {
    throw stepError("validation", Array.from(new Set(issues)).join(" "));
  }

  return {
    adAccountPageId: adAccountPageIds[0] || "",
    campaignName: first.campaignName,
    campaignType: "Search",
    websiteUrl: first.websiteUrl,
    finalUrl: first.finalUrl,
    startDate: first.startDate,
    averageDailyBudget: first.averageDailyBudget || 0,
    targetCPA: first.targetCPA,
    campaignObjective: normalizedObjective || "Leads",
    biddingStrategy: first.biddingStrategy as MediaPlanRowGroup["biddingStrategy"],
    network: ["Google Search Only"],
    targetLocation: first.targetLocation,
    language: first.language,
    rows,
  };
}

function buildPlannedPayload(group: MediaPlanRowGroup): PlannedMediaPlanCampaign {
  return {
    campaign: {
      name: group.campaignName,
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      averageDailyBudget: group.averageDailyBudget,
      finalUrl: group.finalUrl,
      startDate: group.startDate,
      network: ["Google Search Only"],
      targetLocation: group.targetLocation,
      language: group.language,
      biddingStrategy: group.biddingStrategy === "Clicks" || group.campaignObjective === "Website traffic"
        ? "TARGET_SPEND"
        : "MAXIMIZE_CONVERSIONS",
      targetCPA: group.targetCPA,
    },
    adGroups: group.rows.map((row) => ({
      name: row.adGroupName,
      keywords: row.keywords.slice(0, 10),
      responsiveSearchAd: {
        finalUrl: row.finalUrl,
        displayPath1: row.displayPath1,
        displayPath2: row.displayPath2,
        headlines: row.headlines.slice(0, 15),
        descriptions: row.descriptions.slice(0, 4),
      },
    })),
  };
}

async function resolveLinkedGoogleAdAccount(
  config: ReturnType<typeof resolveNotionConfig>,
  adAccountPageId: string,
  requestedGoogleCid: string
): Promise<LinkedGoogleAdAccount> {
  if (!adAccountPageId) {
    throw stepError("validation", "Notion rows are missing the 02 Client / Ad Account relation.");
  }
  const page = (await notionRequest(config, `/pages/${adAccountPageId.replace(/-/g, "")}`, {
    method: "GET",
  })) as NotionPage;
  const account = pageToLinkedGoogleAdAccount(page);
  if (requestedGoogleCid && account.customerId !== requestedGoogleCid) {
    throw stepError(
      "validation",
      `Dashboard Google CID ${requestedGoogleCid} does not match linked Notion Ad Account ID ${account.customerId}.`
    );
  }
  return account;
}

function pageToLinkedGoogleAdAccount(page: NotionPage): LinkedGoogleAdAccount {
  const props = page.properties || {};
  const accountName = readTitle(props, "Account Name") || readText(props, "Account Name");
  const platform = readOption(props, "Platform") || readText(props, "Platform");
  const rawCustomerId =
    readText(props, "ID") || readTitle(props, "ID") || readText(props, "Google Ads Account ID");
  const accessPath = readText(props, "Access Path") || readOption(props, "Access Path");
  const customerId = normalizeGoogleAccountId(rawCustomerId);
  if (!customerId) {
    throw stepError("notion_query", `Linked Ad Account page ${page.id} is missing a valid Google Ads ID.`);
  }
  if (platform && platform.toLowerCase() !== "google") {
    throw stepError(
      "notion_query",
      `Linked Ad Account ${accountName || page.id} is not Google platform: ${platform}.`
    );
  }
  return {
    pageId: page.id,
    accountName,
    customerId,
    loginCustomerId: normalizeLoginCustomerId(accessPath),
    accessPath,
  };
}

function normalizeLoginCustomerId(accessPath: string): string | null {
  const trimmed = accessPath.trim();
  if (!trimmed || trimmed.toLowerCase() === "personal") {
    return null;
  }
  const normalized = normalizeGoogleAccountId(trimmed);
  return normalized || null;
}

async function resolveGoogleAdsConfig(account: LinkedGoogleAdAccount): Promise<GoogleAdsConfig> {
  const credentials = getCredentials();
  const developerToken = credentials.googleDeveloperToken;
  if (!developerToken) {
    throw stepError("configuration", "Missing required env var GOOGLE_ADS_DEVELOPER_TOKEN.");
  }
  const canRefreshAccessToken = Boolean(
    credentials.googleRefreshToken && credentials.googleClientId && credentials.googleClientSecret
  );
  const accessToken = canRefreshAccessToken
    ? await refreshGoogleAccessToken()
    : credentials.googleAccessToken;
  if (!accessToken) {
    throw stepError(
      "configuration",
      "Missing Google OAuth credentials. Provide GOOGLE_ADS_REFRESH_TOKEN with client credentials, or GOOGLE_ADS_ACCESS_TOKEN."
    );
  }
  return {
    customerId: account.customerId,
    loginCustomerId: account.loginCustomerId,
    developerToken,
    accessToken,
    apiVersion: credentials.googleAdsApiVersion || GOOGLE_ADS_API_DEFAULT_VERSION,
    canRefreshAccessToken,
  };
}

async function refreshGoogleAccessToken(): Promise<string> {
  const credentials = getCredentials();
  if (!credentials.googleRefreshToken || !credentials.googleClientId || !credentials.googleClientSecret) {
    throw stepError(
      "configuration",
      "Missing Google OAuth credentials. Provide GOOGLE_ADS_ACCESS_TOKEN or refresh token/client credentials."
    );
  }
  let response: Response;
  try {
    response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.googleClientId,
        client_secret: credentials.googleClientSecret,
        refresh_token: credentials.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    throw stepError(
      "google_oauth",
      `OAuth token request failed or timed out: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw stepError("google_oauth", `OAuth token request failed (${response.status}): ${text}`);
  }
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) {
    throw stepError("google_oauth", "OAuth token response did not include access_token.");
  }
  return data.access_token;
}

async function assertNoExistingCampaign(config: GoogleAdsConfig, campaignName: string) {
  const rows = await googleAdsSearch(config, `
SELECT campaign.id, campaign.name, campaign.status
FROM campaign
WHERE campaign.name = '${escapeGaql(campaignName)}'
  AND campaign.status != 'REMOVED'
LIMIT 1
`);
  if (rows.length > 0) {
    const campaign = (rows[0] as { campaign?: { id?: string; name?: string; status?: string } }).campaign || {};
    throw stepError(
      "duplicate_prevention",
      `Campaign already exists: ${campaign.name || campaignName} (${campaign.id || "unknown"}, ${campaign.status || "unknown"}).`
    );
  }
}

async function resolveTargeting(config: GoogleAdsConfig, group: MediaPlanRowGroup): Promise<ResolvedTargeting> {
  const geoTargets = [];
  for (const location of group.targetLocation) {
    geoTargets.push(await resolveGeoTarget(config, location));
  }
  const languages: ResolvedTargeting["languages"] = [];
  for (const language of group.language) {
    languages.push(await resolveLanguage(config, language));
  }
  return { geoTargets, languages };
}

async function resolveGeoTarget(config: GoogleAdsConfig, name: string) {
  const queryName = name === "Malaysia Nationwide" ? "Malaysia" : name;
  const rows = await googleAdsSearch(config, `
SELECT geo_target_constant.id,
  geo_target_constant.resource_name,
  geo_target_constant.name,
  geo_target_constant.canonical_name,
  geo_target_constant.country_code,
  geo_target_constant.target_type,
  geo_target_constant.status
FROM geo_target_constant
WHERE geo_target_constant.status = 'ENABLED'
  AND geo_target_constant.country_code = 'MY'
  AND geo_target_constant.name LIKE '%${escapeGaql(queryName)}%'
LIMIT 50
`);
  const candidates = rows
    .map((row) => (row as { geoTargetConstant?: { resourceName?: string; name?: string; targetType?: string } }).geoTargetConstant)
    .filter((item): item is { resourceName: string; name?: string; targetType?: string } => Boolean(item?.resourceName));
  const exact = candidates.find((item) => item.name?.toLowerCase() === queryName.toLowerCase());
  const country = candidates.find((item) => item.targetType === "Country");
  const selected = exact || country || candidates[0];
  if (!selected) {
    throw stepError("google_targeting", `Could not resolve target location: ${name}.`);
  }
  return selected;
}

async function resolveLanguage(
  config: GoogleAdsConfig,
  name: string
): Promise<{ resourceName: string; name?: string; fallback?: boolean }> {
  const rows = await googleAdsSearch(config, `
SELECT language_constant.id, language_constant.resource_name, language_constant.name, language_constant.code
FROM language_constant
WHERE language_constant.name = '${escapeGaql(name)}'
LIMIT 5
`);
  const selected = rows
    .map((row) => (row as { languageConstant?: { resourceName?: string; name?: string } }).languageConstant)
    .find((item) => item?.resourceName);
  if (selected?.resourceName) {
    return { resourceName: selected.resourceName, name: selected.name };
  }
  const fallback = LANGUAGE_FALLBACKS.get(name);
  if (fallback) {
    return { resourceName: fallback, name, fallback: true };
  }
  throw stepError("google_targeting", `Could not resolve language: ${name}.`);
}

function buildGoogleAdsMutateOperations(
  customerId: string,
  group: MediaPlanRowGroup,
  targeting: ResolvedTargeting
): unknown[] {
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const operations: unknown[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResourceName,
          name: `${group.campaignName} | Budget`,
          amountMicros: toMicros(group.averageDailyBudget),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResourceName,
          name: group.campaignName,
          status: "PAUSED",
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetResourceName,
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          geoTargetTypeSetting: {
            positiveGeoTargetType: "PRESENCE",
            negativeGeoTargetType: "PRESENCE",
          },
          startDate: group.startDate,
          ...buildBidding(group),
        },
      },
    },
  ];

  for (const geoTarget of targeting.geoTargets) {
    operations.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResourceName,
          location: { geoTargetConstant: geoTarget.resourceName },
        },
      },
    });
  }
  for (const language of targeting.languages) {
    operations.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResourceName,
          language: { languageConstant: language.resourceName },
        },
      },
    });
  }

  let nextAdGroupId = -10;
  for (const row of group.rows) {
    const adGroupResourceName = `customers/${customerId}/adGroups/${nextAdGroupId--}`;
    operations.push({
      adGroupOperation: {
        create: {
          resourceName: adGroupResourceName,
          name: row.adGroupName,
          campaign: campaignResourceName,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    });
    operations.push({
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResourceName,
          status: "ENABLED",
          ad: {
            finalUrls: [row.finalUrl],
            responsiveSearchAd: {
              headlines: row.headlines.slice(0, 15).map((text) => ({ text })),
              descriptions: row.descriptions.slice(0, 4).map((text) => ({ text })),
              path1: row.displayPath1 || undefined,
              path2: row.displayPath2 || undefined,
            },
          },
        },
      },
    });
    for (const keyword of row.keywords.slice(0, 10)) {
      operations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            keyword,
          },
        },
      });
    }
  }

  return operations;
}

function buildBidding(group: MediaPlanRowGroup): Record<string, unknown> {
  if (group.biddingStrategy === "Clicks" || group.campaignObjective === "Website traffic") {
    return { biddingStrategyType: "TARGET_SPEND", targetSpend: {} };
  }
  if (group.targetCPA && group.targetCPA > 0) {
    return {
      biddingStrategyType: "MAXIMIZE_CONVERSIONS",
      maximizeConversions: { targetCpaMicros: toMicros(group.targetCPA) },
    };
  }
  return { biddingStrategyType: "MAXIMIZE_CONVERSIONS", maximizeConversions: {} };
}

async function googleAdsValidateMutate(config: GoogleAdsConfig, mutateOperations: unknown[]) {
  try {
    return await googleAdsMutate(config, mutateOperations, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedStep =
      error instanceof GoogleAdsApiRequestError && error.failedStep === "google_ads_quota"
        ? error.failedStep
        : "google_ads_validate";
    const wrapped = stepError(failedStep, message) as Error & {
      failedStep?: string;
      payload?: unknown;
      status?: number;
    };
    if (error instanceof GoogleAdsApiRequestError) {
      wrapped.payload = error.payload;
      wrapped.status = error.status;
    }
    throw wrapped;
  }
}

async function googleAdsValidateMutateWithPolicyExemptions(
  config: GoogleAdsConfig,
  mutateOperations: unknown[]
): Promise<unknown[]> {
  try {
    await googleAdsValidateMutate(config, mutateOperations);
    return mutateOperations;
  } catch (error) {
    const exemptions = collectExemptiblePolicyViolations(error);
    if (exemptions.length === 0) {
      throw error;
    }
    const retryOperations = applyPolicyExemptions(mutateOperations, exemptions);
    console.warn("[media-plan:create-campaign] google_ads_policy_exemptions_retry", {
      customerId: config.customerId,
      exemptionCount: exemptions.length,
      violatingTexts: exemptions.map((item) => item.key.violatingText),
    });
    await googleAdsValidateMutate(config, retryOperations);
    return retryOperations;
  }
}

async function googleAdsMutate(config: GoogleAdsConfig, mutateOperations: unknown[], validateOnly = false) {
  return googleAdsRequest(config, "/googleAds:mutate", {
    partialFailure: false,
    validateOnly,
    mutateOperations,
  });
}

async function googleAdsSearch(config: GoogleAdsConfig, query: string): Promise<unknown[]> {
  const data = await googleAdsRequest(config, "/googleAds:search", { query });
  return (data as { results?: unknown[] }).results || [];
}

async function googleAdsRequest(config: GoogleAdsConfig, pathSuffix: string, body: unknown): Promise<unknown> {
  const firstAttempt = await sendGoogleAdsRequest(config, pathSuffix, body);
  if (!firstAttempt.ok && firstAttempt.status === 401 && config.canRefreshAccessToken) {
    console.warn("[media-plan:create-campaign] google_ads_access_token_rejected_refreshing", {
      customerId: config.customerId,
      pathSuffix,
    });
    config.accessToken = await refreshGoogleAccessToken();
    const retryAttempt = await sendGoogleAdsRequest(config, pathSuffix, body);
    if (retryAttempt.ok) {
      return retryAttempt.text ? JSON.parse(retryAttempt.text) : {};
    }
    throw googleAdsHttpError(retryAttempt.status, retryAttempt.text);
  }

  if (!firstAttempt.ok) {
    throw googleAdsHttpError(firstAttempt.status, firstAttempt.text);
  }
  return firstAttempt.text ? JSON.parse(firstAttempt.text) : {};
}

async function sendGoogleAdsRequest(
  config: GoogleAdsConfig,
  pathSuffix: string,
  body: unknown
): Promise<{ ok: boolean; status: number; text: string }> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://googleads.googleapis.com/${normalizeApiVersion(config.apiVersion)}/customers/${config.customerId}${pathSuffix}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "developer-token": config.developerToken,
          "Content-Type": "application/json",
          ...(config.loginCustomerId ? { "login-customer-id": config.loginCustomerId } : {}),
        },
        body: JSON.stringify(body),
      },
      GOOGLE_ADS_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw stepError(
      "google_ads_api",
      `Google Ads API request failed or timed out: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
  };
}

function googleAdsHttpError(status: number, text: string) {
  const payload = parseJsonOrNull(text);
  const quotaDetails = extractQuotaErrorDetails(payload);
  const failedStep =
    quotaDetails || status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)
      ? "google_ads_quota"
      : status === 401 || /UNAUTHENTICATED|invalid authentication credentials/i.test(text)
        ? "google_ads_auth"
        : "google_ads_api";
  return new GoogleAdsApiRequestError(
    failedStep,
    status,
    quotaDetails ? formatGoogleAdsQuotaMessage(quotaDetails) : `Google Ads API failed (${status}): ${text}`,
    payload
  );
}

interface GoogleAdsQuotaErrorDetails {
  retryDelaySeconds: number | null;
  requestId: string;
  rateName: string;
  rateScope: string;
  message: string;
}

function extractQuotaErrorDetails(payload: unknown): GoogleAdsQuotaErrorDetails | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return null;
  }
  const status = typeof (error as { status?: unknown }).status === "string" ? (error as { status: string }).status : "";
  const details = (error as { details?: unknown }).details;
  const topLevelMessage =
    typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "";

  if (!Array.isArray(details) && status !== "RESOURCE_EXHAUSTED") {
    return null;
  }

  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || typeof detail !== "object") {
      continue;
    }
    const requestId =
      typeof (detail as { requestId?: unknown }).requestId === "string" ? (detail as { requestId: string }).requestId : "";
    const errors = (detail as { errors?: unknown }).errors;
    for (const item of Array.isArray(errors) ? errors : []) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const errorCode = (item as { errorCode?: { quotaError?: string } }).errorCode;
      const quotaError = errorCode?.quotaError;
      const quotaErrorDetails = (item as {
        details?: { quotaErrorDetails?: { retryDelay?: string; rateName?: string; rateScope?: string } };
      }).details?.quotaErrorDetails;
      if (!quotaError && !quotaErrorDetails) {
        continue;
      }
      const itemMessage =
        typeof (item as { message?: unknown }).message === "string" ? (item as { message: string }).message : "";
      return {
        retryDelaySeconds: parseGoogleRetryDelaySeconds(quotaErrorDetails?.retryDelay),
        requestId,
        rateName: quotaErrorDetails?.rateName || "",
        rateScope: quotaErrorDetails?.rateScope || "",
        message: itemMessage || topLevelMessage,
      };
    }
  }

  return status === "RESOURCE_EXHAUSTED"
    ? {
        retryDelaySeconds: null,
        requestId: "",
        rateName: "",
        rateScope: "",
        message: topLevelMessage || "Google Ads quota is temporarily exhausted.",
      }
    : null;
}

function formatGoogleAdsQuotaMessage(details: GoogleAdsQuotaErrorDetails): string {
  const retryText =
    details.retryDelaySeconds && details.retryDelaySeconds > 0
      ? ` Retry after ${formatRetryDelay(details.retryDelaySeconds)}.`
      : " Retry later.";
  const rateText = details.rateName
    ? ` Limit: ${details.rateName}${details.rateScope ? ` (${details.rateScope.toLowerCase()} scope)` : ""}.`
    : "";
  const requestText = details.requestId ? ` Google Ads request ID: ${details.requestId}.` : "";
  const apiMessage = details.message ? ` ${details.message}` : "";
  return `Google Ads quota is temporarily exhausted.${retryText}${rateText}${requestText}${apiMessage} The Notion rows were kept Ready for Setup so you can retry campaign creation later.`;
}

function parseGoogleRetryDelaySeconds(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+)s$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function formatRetryDelay(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds} seconds`;
  }
  return `${minutes} min ${String(remainingSeconds).padStart(2, "0")} sec`;
}

function collectExemptiblePolicyViolations(error: unknown): PolicyViolationExemption[] {
  const payload = (error as { payload?: unknown }).payload;
  const googleAdsErrors = extractGoogleAdsErrors(payload);
  if (googleAdsErrors.length === 0) {
    return [];
  }
  const exemptions: PolicyViolationExemption[] = [];
  for (const item of googleAdsErrors) {
    const details = item.details?.policyViolationDetails;
    const operationIndex = item.location?.fieldPathElements?.find(
      (element) => element.fieldName === "mutate_operations"
    )?.index;
    const policyName = details?.key?.policyName;
    const violatingText = details?.key?.violatingText;
    if (!details?.isExemptible || typeof operationIndex !== "number" || !policyName || !violatingText) {
      return [];
    }
    exemptions.push({
      operationIndex,
      key: {
        policyName,
        violatingText,
      },
    });
  }
  return exemptions;
}

function applyPolicyExemptions(
  mutateOperations: unknown[],
  exemptions: PolicyViolationExemption[]
): unknown[] {
  const cloned = JSON.parse(JSON.stringify(mutateOperations)) as Array<Record<string, unknown>>;
  const byOperation = new Map<number, PolicyViolationExemption["key"][]>();
  for (const exemption of exemptions) {
    byOperation.set(exemption.operationIndex, [
      ...(byOperation.get(exemption.operationIndex) || []),
      exemption.key,
    ]);
  }

  for (const [operationIndex, keys] of byOperation) {
    const operation = cloned[operationIndex];
    const adGroupCriterionOperation = operation?.adGroupCriterionOperation;
    if (!adGroupCriterionOperation || typeof adGroupCriterionOperation !== "object") {
      continue;
    }
    (adGroupCriterionOperation as Record<string, unknown>).exemptPolicyViolationKeys = keys;
  }

  return cloned;
}

function extractGoogleAdsErrors(payload: unknown): Array<{
  details?: {
    policyViolationDetails?: {
      isExemptible?: boolean;
      key?: {
        policyName?: string;
        violatingText?: string;
      };
    };
  };
  location?: {
    fieldPathElements?: Array<{
      fieldName?: string;
      index?: number;
    }>;
  };
}> {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const details = (payload as { error?: { details?: unknown[] } }).error?.details;
  if (!Array.isArray(details)) {
    return [];
  }
  return details.flatMap((detail) => {
    if (!detail || typeof detail !== "object") {
      return [];
    }
    const errors = (detail as { errors?: unknown[] }).errors;
    return Array.isArray(errors) ? errors : [];
  }) as ReturnType<typeof extractGoogleAdsErrors>;
}

function parseJsonOrNull(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function updateRowsForSetup(
  config: ReturnType<typeof resolveNotionConfig>,
  schemas: Record<string, NotionPropertySchema>,
  rows: MediaPlanNotionRow[]
) {
  await Promise.all(
    rows.map((row) =>
      updateNotionPage(config, schemas, row.pageId, {
        "65 Status": "In Setup",
      })
    )
  );
}

async function updateRowsForSuccess(
  config: ReturnType<typeof resolveNotionConfig>,
  schemas: Record<string, NotionPropertySchema>,
  rows: MediaPlanNotionRow[],
  result: {
    batchId: string;
    campaignId: string;
    campaignResourceName: string;
    googleAdsReviewLink: string;
  }
) {
  const appended = [
    "",
    `GoogleAdsCampaignID: ${result.campaignId}`,
    `GoogleAdsCampaignResourceName: ${result.campaignResourceName}`,
    `GoogleAdsReviewLink: ${result.googleAdsReviewLink}`,
    "CampaignStatus: PAUSED",
  ].join("\n");
  await Promise.all(
    rows.map((row) =>
      updateNotionPage(config, schemas, row.pageId, {
        "65 Status": "Pending Review",
        "67 Missing Info": false,
        "70 Review Notes": `${row.reviewNotes}${appended}`,
      })
    )
  );
}

async function updateRowsForFailure(
  config: ReturnType<typeof resolveNotionConfig>,
  schemas: Record<string, NotionPropertySchema>,
  rows: MediaPlanNotionRow[],
  errorMessage: string,
  options: { retryable?: boolean } = {}
) {
  if (options.retryable) {
    const appended = [
      "",
      `SetupRetryRequired: ${new Date().toISOString()}`,
      `SetupError: ${errorMessage.slice(0, 1500)}`,
    ].join("\n");
    await Promise.all(
      rows.map((row) =>
        updateNotionPage(config, schemas, row.pageId, {
          "65 Status": "Ready for Setup",
          "67 Missing Info": false,
          "70 Review Notes": `${row.reviewNotes}${appended}`,
        })
      )
    );
    return;
  }

  await Promise.all(
    rows.map((row) =>
      updateNotionPage(config, schemas, row.pageId, {
        "65 Status": "Missing Info",
        "67 Missing Info": true,
        "68 Missing Info Notes": errorMessage.slice(0, 1900),
      })
    )
  );
}

async function updateNotionPage(
  config: ReturnType<typeof resolveNotionConfig>,
  schemas: Record<string, NotionPropertySchema>,
  pageId: string,
  values: Record<string, string | boolean>
) {
  const properties: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(values)) {
    const propertyValue = buildNotionPropertyValue(schemas[property], value);
    if (propertyValue) {
      properties[property] = propertyValue;
    }
  }
  if (Object.keys(properties).length === 0) {
    return;
  }
  await notionRequest(config, `/pages/${pageId.replace(/-/g, "")}`, {
    method: "PATCH",
    body: { properties },
  });
}

function buildNotionPropertyValue(schema: NotionPropertySchema | undefined, value: string | boolean) {
  const type = schema?.type;
  if (!type) return null;
  switch (type) {
    case "status":
      return typeof value === "string" ? { status: { name: value } } : null;
    case "select":
      return typeof value === "string" ? { select: { name: value } } : null;
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "rich_text":
      return typeof value === "string" ? { rich_text: [{ text: { content: value } }] } : null;
    case "title":
      return typeof value === "string" ? { title: [{ text: { content: value } }] } : null;
    default:
      return null;
  }
}

async function notionRequest(
  config: ReturnType<typeof resolveNotionConfig>,
  pathname: string,
  options: { method: "GET" | "POST" | "PATCH"; body?: unknown }
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${NOTION_API_BASE}${pathname}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }, NOTION_REQUEST_TIMEOUT_MS);
  } catch (error) {
    throw stepError(
      "notion_api",
      `Notion API request failed or timed out: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw stepError("notion_api", `Notion API failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function buildTextContainsFilter(
  property: string,
  type: string | undefined,
  value: string
): Record<string, unknown> | null {
  if (type === "rich_text" || type === "title") {
    return {
      property,
      [type]: {
        contains: value,
      },
    };
  }
  return null;
}

function readTitle(props: Record<string, unknown>, name: string): string {
  return richTextPlain((props[name] as { title?: unknown[] } | undefined)?.title);
}

function readText(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as { rich_text?: unknown[]; title?: unknown[] } | undefined;
  return richTextPlain(prop?.rich_text || prop?.title);
}

function readUrlOrText(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as { url?: string | null; rich_text?: unknown[] } | undefined;
  return prop?.url || richTextPlain(prop?.rich_text);
}

function readOption(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as { select?: { name?: string }; status?: { name?: string }; rich_text?: unknown[] } | undefined;
  return prop?.select?.name || prop?.status?.name || richTextPlain(prop?.rich_text);
}

function readOptions(props: Record<string, unknown>, name: string): string[] {
  const prop = props[name] as {
    multi_select?: Array<{ name?: string }>;
    select?: { name?: string };
    status?: { name?: string };
    rich_text?: unknown[];
  } | undefined;
  if (Array.isArray(prop?.multi_select)) {
    return prop.multi_select.map((item) => item.name).filter((item): item is string => Boolean(item));
  }
  const single = prop?.select?.name || prop?.status?.name || richTextPlain(prop?.rich_text);
  return single ? [single] : [];
}

function readFirstRelationId(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as { relation?: Array<{ id?: string }> } | undefined;
  return Array.isArray(prop?.relation) ? prop.relation.find((item) => item.id)?.id || "" : "";
}

function readNumber(props: Record<string, unknown>, name: string): number | null {
  const prop = props[name] as { number?: number | null; rich_text?: unknown[] } | undefined;
  if (typeof prop?.number === "number") return prop.number;
  const parsed = Number(richTextPlain(prop?.rich_text).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function readDate(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as { date?: { start?: string }; rich_text?: unknown[] } | undefined;
  return prop?.date?.start?.slice(0, 10) || richTextPlain(prop?.rich_text);
}

function readCheckbox(props: Record<string, unknown>, name: string): boolean {
  const prop = props[name] as { checkbox?: boolean } | undefined;
  return Boolean(prop?.checkbox);
}

function readNumberedTexts(
  props: Record<string, unknown>,
  from: number,
  to: number,
  label: string
): string[] {
  const values: string[] = [];
  for (let propertyNumber = from; propertyNumber <= to; propertyNumber += 1) {
    const index = propertyNumber - from + 1;
    const value = readText(props, `${propertyNumber} ${label} ${index}`);
    if (value) values.push(value);
  }
  return values;
}

function richTextPlain(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { plain_text?: string; text?: { content?: string } };
      return record.plain_text || record.text?.content || "";
    })
    .join("")
    .trim();
}

function parseKeyword(raw: string): GoogleKeyword | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const text = value.slice(1, -1).trim();
    return text ? { text, matchType: "EXACT" } : null;
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    const text = value.slice(1, -1).trim();
    return text ? { text, matchType: "PHRASE" } : null;
  }
  return { text: value, matchType: "BROAD" };
}

function isKeyword(value: GoogleKeyword | null): value is GoogleKeyword {
  return Boolean(value);
}

function pushLengthIssues(issues: string[], values: string[], max: number, label: string) {
  for (const value of values) {
    if (value.length > max) {
      issues.push(`${label} exceeds ${max} characters: ${value}`);
    }
  }
}

function hasCampaignResultForBatch(reviewNotes: string, batchId: string): boolean {
  if (!reviewNotes.includes(batchId)) {
    return false;
  }
  return (
    reviewNotes.includes(CAMPAIGN_RESULT_NOTE_PREFIX) ||
    reviewNotes.includes(CAMPAIGN_RESOURCE_NOTE_PREFIX) ||
    /customers\/\d+\/campaigns\/\d+/.test(reviewNotes)
  );
}

function isRetryableMissingInfoRow(row: MediaPlanNotionRow): boolean {
  if (row.status !== "Missing Info") {
    return false;
  }
  const notes = `${row.missingInfoNotes}\n${row.reviewNotes}\n${row.setupNotes}`;
  return /Google Ads API failed|Google Ads quota is temporarily exhausted|RESOURCE_EXHAUSTED|UNAUTHENTICATED|invalid authentication credentials|SetupError|google_ads_auth|google_ads_quota|aborted|timed out|timeout/i.test(notes);
}

function duplicateError(batchId: string, rows: MediaPlanNotionRow[]) {
  const error = stepError(
    "duplicate_prevention",
    `Duplicate prevention: batch ${batchId} already has a Google Ads campaign result in 70 Review Notes.`
  ) as Error & { duplicate?: boolean; notionPageUrls?: string[] };
  error.duplicate = true;
  error.notionPageUrls = rows.map((row) => row.pageUrl).filter(Boolean);
  return error;
}

function normalizeFailure(
  error: unknown,
  batchId: string,
  rows: MediaPlanNotionRow[]
): MediaPlanCreateCampaignFailureResponse {
  const record = error as { failedStep?: string; duplicate?: boolean; notionPageUrls?: string[] };
  const inferredFailedStep = record.failedStep || (isAbortLike(error) ? "timeout" : "unknown");
  return {
    success: false,
    source: MEDIA_PLAN_SOURCE,
    batchId,
    error: error instanceof Error ? error.message : String(error),
    failedStep: inferredFailedStep,
    notionPageUrls: record.notionPageUrls || rows.map((row) => row.pageUrl).filter(Boolean),
    duplicate: Boolean(record.duplicate),
  };
}

function isRetryableOperationalFailure(failedStep: string | undefined): boolean {
  return ["google_ads_auth", "google_ads_quota", "google_oauth", "configuration", "google_ads_api", "google_ads_validate", "notion_api", "timeout"].includes(failedStep || "");
}

function isAbortLike(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (error instanceof Error && error.name === "AbortError") || /aborted|abort|timed out|timeout/i.test(message);
}

function stepError(failedStep: string, message: string) {
  const error = new Error(message) as Error & { failedStep?: string };
  error.failedStep = failedStep;
  return error;
}

function extractCampaignResourceName(response: unknown): string | null {
  const responses =
    (response as { mutateOperationResponses?: unknown[] }).mutateOperationResponses ||
    (response as { results?: unknown[] }).results ||
    [];
  for (const item of responses) {
    const record = item as {
      campaignResult?: { resourceName?: string };
      resourceName?: string;
    };
    if (record.campaignResult?.resourceName) return record.campaignResult.resourceName;
    if (typeof record.resourceName === "string" && record.resourceName.includes("/campaigns/")) {
      return record.resourceName;
    }
  }
  return null;
}

function buildGoogleAdsReviewLink(customerId: string, campaignId: string): string {
  const params = new URLSearchParams({
    ocid: customerId,
    campaignId,
  });
  return `https://ads.google.com/aw/campaigns?${params.toString()}`;
}

function toMicros(value: number): string {
  return String(Math.round(value * 1_000_000));
}

function escapeGaql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeApiVersion(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed || GOOGLE_ADS_API_DEFAULT_VERSION.slice(1)}`;
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeCampaignObjective(value: string): MediaPlanCampaignObjective | null {
  return normalizeMediaPlanCampaignObjective(value);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
