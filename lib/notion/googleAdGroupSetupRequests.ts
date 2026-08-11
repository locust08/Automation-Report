import { Client } from "@notionhq/client";

import { normalizeGoogleAccountId } from "@/lib/reporting/env";
import {
  GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID,
  GOOGLE_AD_GROUP_SETUP_PROPERTIES,
  GoogleAdGroupSetupPropertyName,
  MappedGoogleAdGroupSetupRow,
  NotionFileUploadValue,
  NotionMapperValue,
  formatMediaPlanBatchId,
  mapMediaPlanToNotionRows,
  normalizeNotionDataSourceId,
} from "@/lib/media-plan/notionMapper";
import {
  MediaPlan,
  MediaPlanApproveSuccessResponse,
  normalizeMediaPlanCampaignObjective,
} from "@/lib/media-plan/schema";
import { getMediaPlanAssets, mediaPlanHasAssets } from "@/lib/media-plan/assets";
import { MediaPlanValidationIssue, validateGeneratedMediaPlan } from "@/lib/media-plan/validation";

export class GoogleAdGroupSetupConfigError extends Error {
  readonly httpStatus = 500;

  constructor(message: string) {
    super(message);
    this.name = "GoogleAdGroupSetupConfigError";
  }
}

export class GoogleAdGroupSetupValidationError extends Error {
  readonly httpStatus = 400;
  readonly issues: MediaPlanValidationIssue[];

  constructor(message: string, issues: MediaPlanValidationIssue[]) {
    super(message);
    this.name = "GoogleAdGroupSetupValidationError";
    this.issues = issues;
  }
}

export class GoogleAdGroupSetupWriteError extends Error {
  readonly httpStatus = 502;

  constructor(message: string) {
    super(message);
    this.name = "GoogleAdGroupSetupWriteError";
  }
}

export interface ApproveMediaPlanToNotionInput {
  mediaPlan: MediaPlan;
  googleCid: string;
  source: "media-plan";
  clientRequestId?: string;
  batchId?: string;
  adAccountPageId?: string;
  assetFiles?: Map<string, File>;
  onProgress?: (stepId: string, message?: string) => void | Promise<void>;
}

interface NotionDataSourceConfig {
  notion: Client;
  dataSourceId: string;
  properties: Record<string, NotionPropertySchema>;
}

interface NotionPropertySchema {
  type?: string;
  relation?: unknown;
  select?: {
    options?: Array<{ name?: string }>;
  };
  multi_select?: {
    options?: Array<{ name?: string }>;
  };
  status?: {
    options?: Array<{ name?: string }>;
  };
  files?: unknown;
}

interface ExistingBatchResult {
  batchId: string;
  pageUrls: string[];
  rowCount: number;
}

interface CreatedNotionPage {
  id: string;
  url: string;
}

const BATCH_PATTERN = /MediaPlanBatch:\s*(MP-\d{8}-\d{6})/;
const NOTION_AD_ACCOUNT_PROPERTY_CANDIDATES = ["ID", "Google Ads Account ID", "Google CID"] as const;
const OPTIONAL_GOOGLE_AD_GROUP_SETUP_PROPERTIES = new Set<GoogleAdGroupSetupPropertyName>([
  "15 Network Notes",
  "50 Logo",
  "51 Product / Service Image",
  "69 Setup Notes",
]);
const NOTION_API_VERSION = "2026-03-11";
const NOTION_API_BASE = "https://api.notion.com/v1";

export async function approveMediaPlanToNotion(
  input: ApproveMediaPlanToNotionInput
): Promise<MediaPlanApproveSuccessResponse> {
  const validationIssues = validateApprovalInput(input);
  if (validationIssues.length > 0) {
    throw new GoogleAdGroupSetupValidationError(
      "Please fix the media plan before saving to Notion.",
      validationIssues
    );
  }
  await input.onProgress?.("validating_media_plan", "Media plan validation passed.");

  const config = await resolveGoogleAdGroupSetupConfig();
  const notionToken = readNotionToken();
  const adAccountPageId =
    input.adAccountPageId?.trim() || (await resolveGoogleAdAccountPageId(config.notion, input.googleCid));
  if (!adAccountPageId) {
    throw new GoogleAdGroupSetupValidationError(
      "Google CID must match a Google Ad Account page in Notion before setup rows can be created.",
      [
        {
          path: "googleCid",
          message:
            "No matching Notion Ad Account page was found. Add this Google CID to DB | Ad Accounts, then approve again.",
        },
      ]
    );
  }
  const notionOptionIssues = validateNotionOptionValues(input.mediaPlan, config.properties);
  if (notionOptionIssues.length > 0) {
    throw new GoogleAdGroupSetupValidationError(
      "Please fix the media plan before saving to Notion.",
      notionOptionIssues
    );
  }

  const requestedBatchId = normalizeBatchId(input.batchId);
  console.info("[media-plan:approve] notion_approval_started", {
    requestedBatchId: requestedBatchId ?? null,
    clientRequestId: input.clientRequestId ?? null,
    adGroupCount: input.mediaPlan.adGroups.length,
  });
  const duplicate = await findExistingBatch(config, {
    batchId: requestedBatchId,
    clientRequestId: input.clientRequestId,
  });
  if (duplicate) {
    if (duplicate.rowCount !== input.mediaPlan.adGroups.length) {
      console.error("[media-plan:approve] partial_duplicate_detected", {
        batchId: duplicate.batchId,
        existingRows: duplicate.rowCount,
        expectedRows: input.mediaPlan.adGroups.length,
      });
      throw new GoogleAdGroupSetupWriteError(
        `Existing idempotency result is partial for batch ${duplicate.batchId}: found ${duplicate.rowCount} rows, expected ${input.mediaPlan.adGroups.length}.`
      );
    }
    console.info("[media-plan:approve] duplicate_reused", {
      batchId: duplicate.batchId,
      rowCount: duplicate.rowCount,
    });
    return {
      success: true,
      batchId: duplicate.batchId,
      notionPageUrls: duplicate.pageUrls,
      createdRowCount: duplicate.rowCount,
      status: "ready_for_setup",
      duplicate: true,
    };
  }

  const batchId = requestedBatchId || formatMediaPlanBatchId();
  console.info("[media-plan:approve] batch_created", { batchId });
  let mediaPlan = input.mediaPlan;
  if (mediaPlanHasAssets(input.mediaPlan)) {
    await input.onProgress?.("uploading_assets", "Uploading selected assets to Notion.");
    mediaPlan = await uploadMediaPlanAssetsForApproval({
      mediaPlan: input.mediaPlan,
      assetFiles: input.assetFiles ?? new Map(),
      properties: config.properties,
      notionToken,
    });
  }
  const createdAt = new Date().toISOString();
  await input.onProgress?.("creating_notion_rows", "Creating Notion setup rows.");
  const rows = mapMediaPlanToNotionRows({
    mediaPlan,
    googleCid: input.googleCid.trim(),
    batchId,
    source: input.source,
    createdAt,
    clientRequestId: input.clientRequestId?.trim() || undefined,
    adAccountPageId,
  });

  const createdPages: CreatedNotionPage[] = [];
  try {
    for (const row of rows) {
      const properties = mapRowPropertiesToNotion(config.properties, row);
      const page = await config.notion.pages.create({
        parent: {
          data_source_id: config.dataSourceId,
        },
        properties,
      });
      const id = "id" in page && typeof page.id === "string" ? page.id : "";
      if ("url" in page && typeof page.url === "string") {
        createdPages.push({ id, url: page.url });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Notion API error.";
    console.error("[media-plan:approve] notion_creation_failed", {
      batchId,
      createdRows: createdPages.length,
      error: message,
    });
    await markCreatedPagesMissingInfo(config, createdPages, `Partial approval failed: ${message}`);
    throw new GoogleAdGroupSetupWriteError(`Unable to create all Notion rows for batch ${batchId}: ${message}`);
  }

  console.info("[media-plan:approve] notion_rows_created", {
    batchId,
    rowCount: createdPages.length,
  });

  return {
    success: true,
    batchId,
    notionPageUrls: createdPages.map((page) => page.url),
    createdRowCount: rows.length,
    status: "ready_for_setup",
    duplicate: false,
  };
}

async function resolveGoogleAdGroupSetupConfig(): Promise<NotionDataSourceConfig> {
  const notionToken = readNotionToken();

  const notion = new Client({ auth: notionToken });
  const dataSourceId = normalizeNotionDataSourceId(
    process.env.NOTION_GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID?.trim() ||
      GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID
  );

  try {
    const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const properties =
      "properties" in dataSource && dataSource.properties && typeof dataSource.properties === "object"
        ? (dataSource.properties as Record<string, NotionPropertySchema>)
        : {};

    const missingProperties = GOOGLE_AD_GROUP_SETUP_PROPERTIES.filter(
      (property) => !properties[property] && !OPTIONAL_GOOGLE_AD_GROUP_SETUP_PROPERTIES.has(property)
    );
    if (missingProperties.length > 0) {
      throw new GoogleAdGroupSetupConfigError(
        `Google Ads Ad Group Setup Requests is missing required properties: ${missingProperties.join(", ")}.`
      );
    }
    const skippedProperties = GOOGLE_AD_GROUP_SETUP_PROPERTIES.filter(
      (property) => !properties[property] && OPTIONAL_GOOGLE_AD_GROUP_SETUP_PROPERTIES.has(property)
    );
    if (skippedProperties.length > 0) {
      console.warn("[media-plan:approve] optional_notion_properties_missing", {
        skippedProperties,
      });
    }

    return {
      notion,
      dataSourceId,
      properties,
    };
  } catch (error) {
    if (error instanceof GoogleAdGroupSetupConfigError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown Notion API error.";
    throw new GoogleAdGroupSetupConfigError(
      `Unable to read Google Ads Ad Group Setup Requests data source: ${message}`
    );
  }
}

function readNotionToken(): string {
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!notionToken) {
    throw new GoogleAdGroupSetupConfigError("Missing required env var NOTION_TOKEN.");
  }
  return notionToken;
}

function validateApprovalInput(input: ApproveMediaPlanToNotionInput): MediaPlanValidationIssue[] {
  const issues = validateGeneratedMediaPlan(input.mediaPlan).issues;

  if (!input.googleCid.trim()) {
    issues.push({ path: "googleCid", message: "Google CID is required." });
  } else if (!/^\d{10}$/.test(input.googleCid.replace(/\D/g, ""))) {
    issues.push({ path: "googleCid", message: "Google CID must contain exactly 10 digits." });
  }
  if (input.source !== "media-plan") {
    issues.push({ path: "source", message: "Source must be media-plan." });
  }

  return issues;
}

async function markCreatedPagesMissingInfo(
  config: NotionDataSourceConfig,
  pages: CreatedNotionPage[],
  message: string
) {
  const properties: Record<string, unknown> = {};
  const statusValue = buildNotionPropertyValue(config.properties["65 Status"], "Missing Info");
  const missingInfoValue = buildNotionPropertyValue(config.properties["67 Missing Info"], true);
  const notesValue = buildNotionPropertyValue(config.properties["68 Missing Info Notes"], message.slice(0, 1900));

  if (statusValue) {
    properties["65 Status"] = statusValue;
  }
  if (missingInfoValue) {
    properties["67 Missing Info"] = missingInfoValue;
  }
  if (notesValue) {
    properties["68 Missing Info Notes"] = notesValue;
  }

  if (Object.keys(properties).length === 0) {
    return;
  }

  await Promise.allSettled(
    pages
      .filter((page) => page.id)
      .map((page) =>
        config.notion.pages.update({
          page_id: page.id,
          properties: properties as Parameters<typeof config.notion.pages.update>[0]["properties"],
        })
      )
  );
}

function validateNotionOptionValues(
  mediaPlan: MediaPlan,
  properties: Record<string, NotionPropertySchema>
): MediaPlanValidationIssue[] {
  const issues: MediaPlanValidationIssue[] = [];
  validateOptionValue(
    issues,
    properties["06 Campaign Objective"],
    normalizeMediaPlanCampaignObjective(mediaPlan.campaign.campaignObjective) || mediaPlan.campaign.campaignObjective,
    "campaign.campaignObjective",
    "Campaign objective must match an existing Notion option."
  );
  validateOptionList(
    issues,
    properties["16 Target Location"],
    mediaPlan.campaign.targetLocation,
    "campaign.targetLocation",
    "Target location must match an existing Notion option."
  );
  validateOptionList(
    issues,
    properties["17 Language"],
    mediaPlan.campaign.language,
    "campaign.language",
    "Language must match an existing Notion option."
  );
  return issues;
}

function validateOptionValue(
  issues: MediaPlanValidationIssue[],
  property: NotionPropertySchema | undefined,
  value: string,
  path: string,
  message: string
) {
  const options = getPropertyOptions(property);
  if (!options || options.has(value)) {
    return;
  }
  issues.push({ path, message: `${message} Invalid value: ${value}.` });
}

function validateOptionList(
  issues: MediaPlanValidationIssue[],
  property: NotionPropertySchema | undefined,
  values: string[],
  path: string,
  message: string
) {
  const options = getPropertyOptions(property);
  if (!options) {
    return;
  }

  values.forEach((value, index) => {
    if (!options.has(value)) {
      issues.push({ path: `${path}.${index}`, message: `${message} Invalid value: ${value}.` });
    }
  });
}

function mapRowPropertiesToNotion(
  schemas: Record<string, NotionPropertySchema>,
  row: MappedGoogleAdGroupSetupRow
): Record<string, never> {
  const properties: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(row.properties) as Array<
    [GoogleAdGroupSetupPropertyName, NotionMapperValue]
  >) {
    const propertyValue = buildNotionPropertyValue(schemas[name], value);
    if (propertyValue) {
      properties[name] = propertyValue;
    }
  }

  return properties as Record<string, never>;
}

function buildNotionPropertyValue(
  schema: NotionPropertySchema | undefined,
  value: NotionMapperValue
): Record<string, unknown> | null {
  const type = schema?.type;
  if (!type) {
    return null;
  }

  switch (type) {
    case "title":
      return { title: textValue(value) ? [{ text: { content: textValue(value) } }] : [] };
    case "rich_text":
      return { rich_text: textValue(value) ? [{ text: { content: textValue(value) } }] : [] };
    case "url":
      return textValue(value) ? { url: textValue(value) } : { url: null };
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? { number: value } : { number: null };
    case "date":
      return textValue(value) ? { date: { start: textValue(value) } } : { date: null };
    case "checkbox":
      return { checkbox: typeof value === "boolean" ? value : textValue(value).toUpperCase() === "YES" };
    case "select": {
      const name = firstOptionValue(value);
      return name ? { select: { name } } : null;
    }
    case "status": {
      const name = firstOptionValue(value);
      return name ? { status: { name } } : null;
    }
    case "multi_select": {
      const names = arrayValue(value);
      return names.length > 0 ? { multi_select: names.map((name) => ({ name })) } : { multi_select: [] };
    }
    case "relation": {
      return isRelationValue(value) && value.pageId ? { relation: [{ id: value.pageId }] } : { relation: [] };
    }
    case "files": {
      return isFileUploadValue(value)
        ? {
            files: value.files.map((file) => ({
              name: file.name,
              type: "file_upload",
              file_upload: { id: file.id },
            })),
          }
        : { files: [] };
    }
    default:
      return null;
  }
}

async function uploadMediaPlanAssetsForApproval({
  mediaPlan,
  assetFiles,
  properties,
  notionToken,
}: {
  mediaPlan: MediaPlan;
  assetFiles: Map<string, File>;
  properties: Record<string, NotionPropertySchema>;
  notionToken: string;
}): Promise<MediaPlan> {
  const propertyIssues = validateAssetFileProperties(mediaPlan, properties);
  if (propertyIssues.length > 0) {
    throw new GoogleAdGroupSetupValidationError("Please fix the media plan assets before saving to Notion.", propertyIssues);
  }

  const assets = getMediaPlanAssets(mediaPlan);
  const uploadedByAssetId = new Map<string, string>();
  for (const asset of assets) {
    const file = assetFiles.get(asset.id);
    if (!file) {
      throw new GoogleAdGroupSetupValidationError("Please upload all selected assets again before approval.", [
        {
          path: `assets.${asset.kind}`,
          message: `Selected asset ${asset.name} is no longer available in the browser session.`,
        },
      ]);
    }
    const uploadId = await uploadNotionFile(notionToken, file, asset.name);
    uploadedByAssetId.set(asset.id, uploadId);
  }

  return {
    ...mediaPlan,
    assets: {
      logo: (mediaPlan.assets?.logo ?? []).map((asset) => ({
        ...asset,
        fileUploadId: uploadedByAssetId.get(asset.id) ?? asset.fileUploadId,
      })),
      productServiceImages: (mediaPlan.assets?.productServiceImages ?? []).map((asset) => ({
        ...asset,
        fileUploadId: uploadedByAssetId.get(asset.id) ?? asset.fileUploadId,
      })),
    },
  };
}

function validateAssetFileProperties(
  mediaPlan: MediaPlan,
  properties: Record<string, NotionPropertySchema>
): MediaPlanValidationIssue[] {
  const issues: MediaPlanValidationIssue[] = [];
  const assets = mediaPlan.assets;
  if ((assets?.logo ?? []).length > 0 && properties["50 Logo"]?.type !== "files") {
    issues.push({
      path: "assets.logo",
      message: "Notion property 50 Logo must exist and use the Files type before logo assets can be attached.",
    });
  }
  if ((assets?.productServiceImages ?? []).length > 0 && properties["51 Product / Service Image"]?.type !== "files") {
    issues.push({
      path: "assets.productServiceImages",
      message:
        "Notion property 51 Product / Service Image must exist and use the Files type before product/service assets can be attached.",
    });
  }
  return issues;
}

async function uploadNotionFile(notionToken: string, file: File, filename: string): Promise<string> {
  const createResponse = await fetch(`${NOTION_API_BASE}/file_uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: JSON.stringify({
      mode: "single_part",
      filename,
      content_type: file.type,
    }),
  });
  const created = await readNotionJson(createResponse);
  const uploadId = readFileUploadId(created);
  if (!uploadId) {
    throw new GoogleAdGroupSetupWriteError(`Notion did not return a file upload ID for ${filename}.`);
  }

  const formData = new FormData();
  formData.append("file", file, filename);
  const sendResponse = await fetch(`${NOTION_API_BASE}/file_uploads/${encodeURIComponent(uploadId)}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": NOTION_API_VERSION,
    },
    body: formData,
  });
  const uploaded = await readNotionJson(sendResponse);
  const status = isRecord(uploaded) && typeof uploaded.status === "string" ? uploaded.status : "";
  if (status !== "uploaded") {
    throw new GoogleAdGroupSetupWriteError(`Notion upload for ${filename} did not complete.`);
  }
  return uploadId;
}

async function readNotionJson(response: Response): Promise<unknown> {
  const body = await response.text();
  const parsed = body ? safeJsonParse(body) : null;
  if (!response.ok) {
    const message =
      isRecord(parsed) && typeof parsed.message === "string"
        ? parsed.message
        : body || `Notion API request failed with status ${response.status}.`;
    throw new GoogleAdGroupSetupWriteError(message);
  }
  return parsed;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readFileUploadId(value: unknown): string {
  return isRecord(value) && typeof value.id === "string" ? value.id : "";
}

async function resolveGoogleAdAccountPageId(notion: Client, googleCid: string): Promise<string | null> {
  const normalizedGoogleCid = normalizeGoogleAccountId(googleCid);
  if (!normalizedGoogleCid) {
    return null;
  }

  const dataSourceId = await resolveAdAccountsDataSourceId(notion);
  let startCursor: string | undefined;
  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      start_cursor: startCursor,
    });
    for (const result of response.results) {
      if (!("id" in result) || !("properties" in result)) {
        continue;
      }
      const properties = result.properties as Record<string, unknown>;
      const platform = readNotionOptionOrText(properties, "Platform");
      if (platform && platform.toLowerCase() !== "google") {
        continue;
      }
      const candidateId = NOTION_AD_ACCOUNT_PROPERTY_CANDIDATES.map((property) =>
        readNotionPlainText(properties, property)
      ).find(Boolean);
      if (normalizeGoogleAccountId(candidateId || "") === normalizedGoogleCid) {
        return result.id;
      }
    }
    startCursor = response.has_more ? response.next_cursor || undefined : undefined;
  } while (startCursor);

  return null;
}

async function resolveAdAccountsDataSourceId(notion: Client): Promise<string> {
  const configuredId =
    process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || process.env.NOTION_DATABASE_ID?.trim();
  if (!configuredId) {
    throw new GoogleAdGroupSetupConfigError(
      "Missing required env var NOTION_AD_ACCOUNTS_DATABASE_ID or NOTION_DATABASE_ID."
    );
  }

  const normalizedId = normalizeNotionDataSourceId(configuredId);
  try {
    await notion.dataSources.retrieve({ data_source_id: normalizedId });
    return normalizedId;
  } catch {
    const database = await notion.databases.retrieve({ database_id: configuredId });
    const dataSourceId =
      "data_sources" in database && Array.isArray(database.data_sources)
        ? database.data_sources[0]?.id
        : undefined;
    if (!dataSourceId) {
      throw new GoogleAdGroupSetupConfigError(
        "Unable to find a Notion data source for the Ad Accounts database."
      );
    }
    return normalizeNotionDataSourceId(dataSourceId);
  }
}

async function findExistingBatch(
  config: NotionDataSourceConfig,
  input: { batchId?: string; clientRequestId?: string }
): Promise<ExistingBatchResult | null> {
  const filters = [
    input.batchId ? buildNotesContainsFilter(config.properties, `MediaPlanBatch: ${input.batchId}`) : null,
    input.clientRequestId
      ? buildNotesContainsFilter(config.properties, `ClientRequestID: ${input.clientRequestId.trim()}`)
      : null,
  ].filter(Boolean);

  if (filters.length === 0) {
    return null;
  }

  const filter =
    filters.length === 1
      ? filters[0]
      : ({
          or: filters,
        } as Record<string, unknown>);

  const response = await config.notion.dataSources.query({
    data_source_id: config.dataSourceId,
    page_size: 100,
    filter: filter as Parameters<typeof config.notion.dataSources.query>[0]["filter"],
  });

  const pageUrls = response.results
    .map((result) => ("url" in result && typeof result.url === "string" ? result.url : null))
    .filter((url): url is string => Boolean(url));
  if (pageUrls.length === 0) {
    return null;
  }

  const batchId =
    input.batchId ||
    response.results
      .map((result) => ("properties" in result ? extractBatchIdFromProperties(result.properties) : null))
      .find((value): value is string => Boolean(value)) ||
    "MP-UNKNOWN";

  return {
    batchId,
    pageUrls,
    rowCount: pageUrls.length,
  };
}

function buildNotesContainsFilter(
  properties: Record<string, NotionPropertySchema>,
  value: string
): Record<string, unknown> | null {
  const filters: Record<string, unknown>[] = [];
  for (const property of ["69 Setup Notes", "70 Review Notes"]) {
    const type = properties[property]?.type;
    if (type !== "title" && type !== "rich_text") {
      continue;
    }
    filters.push({
      property,
      [type]: {
        contains: value,
      },
    });
  }

  if (filters.length === 1) {
    return filters[0];
  }
  if (filters.length > 1) {
    return { or: filters };
  }
  return null;
}

function extractBatchIdFromProperties(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") {
    return null;
  }

  const notes =
    (properties as Record<string, unknown>)["69 Setup Notes"] ||
    (properties as Record<string, unknown>)["70 Review Notes"];
  if (!notes || typeof notes !== "object") {
    return null;
  }

  const richText = "rich_text" in notes ? notes.rich_text : "title" in notes ? notes.title : null;
  if (!Array.isArray(richText)) {
    return null;
  }

  const plainText = richText
    .map((item) =>
      item && typeof item === "object" && "plain_text" in item && typeof item.plain_text === "string"
        ? item.plain_text
        : ""
    )
    .join("");

  return BATCH_PATTERN.exec(plainText)?.[1] ?? null;
}

function normalizeBatchId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^MP-\d{8}-\d{6}$/.test(trimmed) ? trimmed : undefined;
}

function getPropertyOptions(property: NotionPropertySchema | undefined): Set<string> | null {
  if (!property?.type) {
    return null;
  }
  const options =
    property.type === "select"
      ? property.select?.options
      : property.type === "multi_select"
        ? property.multi_select?.options
        : property.type === "status"
          ? property.status?.options
          : null;
  if (!options) {
    return null;
  }
  return new Set(options.map((option) => option.name).filter((name): name is string => Boolean(name)));
}

function textValue(value: NotionMapperValue): string {
  if (isRelationValue(value) || isFileUploadValue(value)) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "YES" : "NO";
  }
  return value?.trim() ?? "";
}

function firstOptionValue(value: NotionMapperValue): string {
  if (isRelationValue(value) || isFileUploadValue(value)) {
    return "";
  }
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "boolean") {
    return first ? "YES" : "NO";
  }
  if (typeof first === "number") {
    return String(first);
  }
  return first?.trim() ?? "";
}

function arrayValue(value: NotionMapperValue): string[] {
  if (isRelationValue(value) || isFileUploadValue(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  const text = textValue(value);
  return text ? [text] : [];
}

function isRelationValue(value: NotionMapperValue): value is { type: "relation"; pageId: string } {
  return value !== null && typeof value === "object" && !Array.isArray(value) && value.type === "relation";
}

function isFileUploadValue(value: NotionMapperValue): value is NotionFileUploadValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && value.type === "file_uploads";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNotionOptionOrText(properties: Record<string, unknown>, name: string): string {
  const prop = properties[name] as
    | {
        select?: { name?: string };
        status?: { name?: string };
        rich_text?: unknown[];
        title?: unknown[];
      }
    | undefined;
  return prop?.select?.name || prop?.status?.name || richTextPlain(prop?.rich_text || prop?.title);
}

function readNotionPlainText(properties: Record<string, unknown>, name: string): string {
  const prop = properties[name] as { rich_text?: unknown[]; title?: unknown[]; url?: string | null } | undefined;
  return richTextPlain(prop?.rich_text || prop?.title) || prop?.url || "";
}

function richTextPlain(items: unknown): string {
  if (!Array.isArray(items)) {
    return "";
  }
  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as { plain_text?: string; text?: { content?: string } };
      return record.plain_text || record.text?.content || "";
    })
    .join("")
    .trim();
}
