import { Client } from "@notionhq/client";

import {
  GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID,
  GOOGLE_AD_GROUP_SETUP_PROPERTIES,
  GoogleAdGroupSetupPropertyName,
  MappedGoogleAdGroupSetupRow,
  NotionMapperValue,
  formatMediaPlanBatchId,
  mapMediaPlanToNotionRows,
  normalizeNotionDataSourceId,
} from "@/lib/media-plan/notionMapper";
import { MediaPlan, MediaPlanApproveSuccessResponse } from "@/lib/media-plan/schema";
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
}

interface NotionDataSourceConfig {
  notion: Client;
  dataSourceId: string;
  properties: Record<string, NotionPropertySchema>;
}

interface NotionPropertySchema {
  type?: string;
  select?: {
    options?: Array<{ name?: string }>;
  };
  multi_select?: {
    options?: Array<{ name?: string }>;
  };
  status?: {
    options?: Array<{ name?: string }>;
  };
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

  const config = await resolveGoogleAdGroupSetupConfig();
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
  const createdAt = new Date().toISOString();
  const rows = mapMediaPlanToNotionRows({
    mediaPlan: input.mediaPlan,
    googleCid: input.googleCid.trim(),
    batchId,
    source: input.source,
    createdAt,
    clientRequestId: input.clientRequestId?.trim() || undefined,
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
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!notionToken) {
    throw new GoogleAdGroupSetupConfigError("Missing required env var NOTION_TOKEN.");
  }

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

    const missingProperties = GOOGLE_AD_GROUP_SETUP_PROPERTIES.filter((property) => !properties[property]);
    if (missingProperties.length > 0) {
      throw new GoogleAdGroupSetupConfigError(
        `Google Ads Ad Group Setup Requests is missing required properties: ${missingProperties.join(", ")}.`
      );
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
    default:
      return null;
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
  const setupNotesType = properties["69 Setup Notes"]?.type;
  if (setupNotesType === "title" || setupNotesType === "rich_text") {
    return {
      property: "69 Setup Notes",
      [setupNotesType]: {
        contains: value,
      },
    };
  }
  return null;
}

function extractBatchIdFromProperties(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") {
    return null;
  }

  const notes = (properties as Record<string, unknown>)["69 Setup Notes"];
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
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  const text = textValue(value);
  return text ? [text] : [];
}
