import { normalizeGoogleAccountId } from "@/lib/reporting/env";
import {
  formatGoogleAdsCustomerId,
  resolveGoogleAdsAccessPath,
} from "@/lib/reporting/google-access-path";

export interface NotionPageProperty {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string | null } | null;
  multi_select?: Array<{ name?: string | null }>;
  status?: { name?: string | null } | null;
  number?: number | null;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  checkbox?: boolean;
  formula?:
    | { type?: "string"; string?: string | null }
    | { type?: "number"; number?: number | null }
    | { type?: "boolean"; boolean?: boolean | null }
    | { type?: "date"; date?: { start?: string | null } | null }
    | null;
}

interface NotionQueryResponse {
  results?: Array<{
    id?: string;
    properties?: Record<string, NotionPageProperty | undefined>;
  }>;
  has_more?: boolean;
  next_cursor?: string | null;
  message?: string;
}

interface NotionDatabaseResponse {
  id?: string;
  data_sources?: Array<{
    id?: string;
    name?: string;
  }>;
  message?: string;
}

interface AdAccountRecord {
  accountId: string;
  accountName: string | null;
  accessPath: string | null;
  platform: string | null;
}

interface GoogleAdsRouteResolution {
  accountId: string;
  originalAccessPath: string | null;
  resolvedAccessPath: string;
  fallbackUsed: boolean;
  mode: "direct" | "manager";
  loginCustomerId: string | null;
}

export interface GoogleManagerResolution {
  loginCustomerIdByAccount: Record<string, string | null>;
  accessPathByAccount: Record<string, string | null>;
  messages: string[];
}

export interface GoogleAccountResolution extends GoogleManagerResolution {
  googleAccountIds: string[];
}

const NOTION_API_VERSION = "2026-03-11";
const NOTION_DATABASE_LABEL = "DB | Ad Accounts";
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

const notionDataSourceIdCache = new Map<
  string,
  { expiresAt: number; promise: Promise<string> }
>();
const notionAccountRecordsCache = new Map<
  string,
  { expiresAt: number; promise: Promise<AdAccountRecord[]> }
>();

export interface NotionErrorPayload {
  success: false;
  stage:
    | "notion_auth"
    | "notion_config"
    | "notion_smoke"
    | "notion_query"
    | "google_ads_routing";
  errorCode:
    | "NOTION_TOKEN_INVALID"
    | "NOTION_TOKEN_MISSING"
    | "NOTION_DATABASE_ID_MISSING"
    | "NOTION_DATABASE_ID_INVALID"
    | "NOTION_SMOKE_FAILED"
    | "NOTION_DATA_SOURCE_MISSING"
    | "GOOGLE_ADS_ROUTE_RESOLUTION_FAILED";
  message: string;
}

export class NotionIntegrationError extends Error {
  readonly payload: NotionErrorPayload;
  readonly httpStatus: number;

  constructor(payload: NotionErrorPayload, httpStatus = 500) {
    super(payload.message);
    this.name = "NotionIntegrationError";
    this.payload = payload;
    this.httpStatus = httpStatus;
  }
}

export function isNotionIntegrationError(error: unknown): error is NotionIntegrationError {
  return error instanceof NotionIntegrationError;
}

function createGoogleAdsRoutingError(message: string): NotionIntegrationError {
  return new NotionIntegrationError(
    {
      success: false,
      stage: "google_ads_routing",
      errorCode: "GOOGLE_ADS_ROUTE_RESOLUTION_FAILED",
      message,
    },
    500
  );
}

export async function resolveGoogleManagerIdsFromNotion(input: {
  googleAccountIds: string[];
  notionAccessToken: string | null;
  notionDatabaseId: string | null;
  fallbackLoginCustomerId?: string | null;
}): Promise<GoogleManagerResolution> {
  const resolution = await resolveGoogleAccountsFromNotion({
    googleAccountIds: input.googleAccountIds,
    googleLookupTerms: input.googleAccountIds,
    notionAccessToken: input.notionAccessToken,
    notionDatabaseId: input.notionDatabaseId,
    fallbackLoginCustomerId: input.fallbackLoginCustomerId,
  });

  return {
    loginCustomerIdByAccount: resolution.loginCustomerIdByAccount,
    accessPathByAccount: resolution.accessPathByAccount,
    messages: resolution.messages,
  };
}

export async function resolveGoogleAccountsFromNotion(input: {
  googleAccountIds: string[];
  googleLookupTerms: string[];
  notionAccessToken: string | null;
  notionDatabaseId: string | null;
  fallbackLoginCustomerId?: string | null;
}): Promise<GoogleAccountResolution> {
  const uniqueGoogleAccountIds = Array.from(new Set(input.googleAccountIds.filter(Boolean)));
  const uniqueGoogleLookupTerms = Array.from(
    new Set(input.googleLookupTerms.map((term) => term.trim()).filter(Boolean))
  );

  if (uniqueGoogleAccountIds.length === 0 && uniqueGoogleLookupTerms.length === 0) {
    return {
      googleAccountIds: [],
      loginCustomerIdByAccount: {},
      accessPathByAccount: {},
      messages: [],
    };
  }

  try {
    const notionConfig = resolveNotionConfig({
      notionAccessToken: input.notionAccessToken,
      notionDatabaseId: input.notionDatabaseId,
    });
    const records = await fetchGoogleAdAccountRecords(notionConfig);
    const recordsByAccountId = new Map(records.map((record) => [record.accountId, record]));
    const recordsByAccountName = new Map(
      records
        .filter((record) => Boolean(normalizeLookupTerm(record.accountName)))
        .map((record) => [normalizeLookupTerm(record.accountName) as string, record])
    );
    const messages: string[] = [];
    const resolvedGoogleAccountIds: string[] = [];
    const loginCustomerIdByAccount: Record<string, string | null> = {};
    const accessPathByAccount: Record<string, string | null> = {};
    const lookupTerms =
      uniqueGoogleLookupTerms.length > 0 ? uniqueGoogleLookupTerms : uniqueGoogleAccountIds;

    lookupTerms.forEach((lookupTerm) => {
      const matchedRecord = matchGoogleAdAccountRecord(
        lookupTerm,
        recordsByAccountId,
        recordsByAccountName
      );

      if (matchedRecord) {
        const route = resolveGoogleAdsRoute(matchedRecord, input.fallbackLoginCustomerId ?? null);
        pushUnique(resolvedGoogleAccountIds, route.accountId);
        loginCustomerIdByAccount[route.accountId] = route.loginCustomerId;
        accessPathByAccount[route.accountId] = route.originalAccessPath;

        const accountLabel = matchedRecord.accountName
          ? `${matchedRecord.accountName} (${formatGoogleCustomerId(matchedRecord.accountId)})`
          : formatGoogleCustomerId(matchedRecord.accountId);
        const lookupLabel =
          normalizeGoogleLookupId(lookupTerm) === matchedRecord.accountId
            ? accountLabel
            : `"${lookupTerm}" -> ${accountLabel}`;

        if (route.mode === "direct") {
          messages.push(`Notion resolved ${lookupLabel} with direct customer access.`);
          return;
        }

        if (route.fallbackUsed) {
          messages.push(
            `Notion resolved ${lookupLabel} with fallback manager ID ${formatGoogleCustomerId(route.loginCustomerId ?? "")}.`
          );
          return;
        }

        messages.push(
          `Notion resolved ${lookupLabel} with manager ID ${formatGoogleCustomerId(route.loginCustomerId ?? "")}.`
        );
        return;
      }

      const normalizedLookupId = normalizeGoogleLookupId(lookupTerm);
      if (normalizedLookupId) {
        throw createGoogleAdsRoutingError(
          `Google Ads routing could not be resolved for customer ${formatGoogleCustomerId(normalizedLookupId)} because no matching row was found in Notion ${NOTION_DATABASE_LABEL}.`
        );
      }

      throw createGoogleAdsRoutingError(
        `Google Ads routing could not be resolved for lookup "${lookupTerm}" because no matching row was found in Notion ${NOTION_DATABASE_LABEL}.`
      );
    });

    uniqueGoogleAccountIds.forEach((accountId) => {
      if (resolvedGoogleAccountIds.includes(accountId)) {
        return;
      }

      throw createGoogleAdsRoutingError(
        `Google Ads routing could not be resolved for customer ${formatGoogleCustomerId(accountId)} because its Access Path was not found in Notion ${NOTION_DATABASE_LABEL}.`
      );
    });

    return {
      googleAccountIds: resolvedGoogleAccountIds,
      loginCustomerIdByAccount,
      accessPathByAccount,
      messages,
    };
  } catch (error) {
    if (isNotionIntegrationError(error)) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to read DB | Ad Accounts from the Notion API.";
    throw createGoogleAdsRoutingError(`Google Ads routing failed: ${message}`);
  }
}

async function fetchGoogleAdAccountRecords(
  config: NotionConfig
): Promise<AdAccountRecord[]> {
  const cacheKey = `${config.databaseId}:${config.notionAccessToken}`;
  const cached = notionAccountRecordsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = (async () => {
    const records: AdAccountRecord[] = [];
    let nextCursor: string | null = null;
    const dataSourceId = await resolveNotionDataSourceId(config);

    do {
      const endpoint = `${NOTION_API_BASE_URL}/data_sources/${dataSourceId}/query`;
      console.info(
        `[notion] query database_id=${config.databaseId} data_source_id=${dataSourceId} endpoint=${endpoint}`
      );
      logNotionRequest("POST", endpoint, config.databaseId, config.hasToken);
      const response: Response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.notionAccessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION,
        },
        body: JSON.stringify({
          page_size: 100,
          start_cursor: nextCursor ?? undefined,
        }),
        cache: "no-store",
      });

      const bodyText: string = await response.text().catch(() => "");
      const json: NotionQueryResponse | null = parseNotionJson<NotionQueryResponse>(bodyText);

      if (!response.ok) {
        const body = json?.message ?? (bodyText.trim() || null);
        logNotionFailure(response.status, endpoint, body);
        if (response.status === 401) {
          throw new NotionIntegrationError(
            {
              success: false,
              stage: "notion_auth",
              errorCode: "NOTION_TOKEN_INVALID",
              message: "Notion rejected the configured bearer token.",
            },
            401
          );
        }

        throw new NotionIntegrationError(
          {
            success: false,
            stage: "notion_query",
            errorCode: "NOTION_SMOKE_FAILED",
            message:
              body ?? `Notion API request failed with status ${response.status} while querying ${NOTION_DATABASE_LABEL}.`,
          },
          response.status
        );
      }

      for (const page of json?.results ?? []) {
        const parsed = parseAdAccountRecord(page);
        if (parsed && isGoogleAdAccountRecord(parsed)) {
          records.push(parsed);
        }
      }

      nextCursor = json?.has_more ? json.next_cursor ?? null : null;
    } while (nextCursor);

    return records;
  })();

  notionAccountRecordsCache.set(cacheKey, {
    expiresAt: Date.now() + NOTION_LOOKUP_CACHE_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    notionAccountRecordsCache.delete(cacheKey);
    throw error;
  }
}

async function resolveNotionDataSourceId(
  config: NotionConfig,
  options?: { log?: boolean }
): Promise<string> {
  const cacheKey = `${config.databaseId}:${config.notionAccessToken}`;
  const cached = notionDataSourceIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = (async () => {
  const endpoint = `${NOTION_API_BASE_URL}/databases/${config.databaseId}`;
  if (options?.log !== false) {
    console.info(`[notion] resolving_data_source database_id=${config.databaseId} endpoint=${endpoint}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.notionAccessToken}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    cache: "no-store",
  });

  const bodyText = await response.text().catch(() => "");
  const json = parseNotionJson<NotionDatabaseResponse>(bodyText);
  const body = json?.message ?? (bodyText.trim() || null);

  if (!response.ok) {
    logNotionFailure(response.status, endpoint, body);
    if (response.status === 401) {
      throw new NotionIntegrationError(
        {
          success: false,
          stage: "notion_auth",
          errorCode: "NOTION_TOKEN_INVALID",
          message: "Notion rejected the configured bearer token.",
        },
        401
      );
    }

    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_query",
        errorCode: "NOTION_SMOKE_FAILED",
        message:
          body ?? `Notion API request failed with status ${response.status} while reading ${NOTION_DATABASE_LABEL}.`,
      },
      response.status
    );
  }

  const dataSources = json?.data_sources ?? [];
  if (dataSources.length === 0) {
    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_query",
        errorCode: "NOTION_DATA_SOURCE_MISSING",
        message:
          "The configured Notion database does not expose any data_sources. If this is a linked database, use the original source database/data source instead.",
      },
      500
    );
  }

  const dataSourceId = dataSources[0]?.id?.trim();
  if (!dataSourceId) {
    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_query",
        errorCode: "NOTION_DATA_SOURCE_MISSING",
        message:
          "The configured Notion database returned an empty data source ID. If this is a linked database, use the original source database/data source instead.",
      },
      500
    );
  }

  if (options?.log !== false) {
    console.info(
      `[notion] resolved_data_source database_id=${config.databaseId} data_source_id=${dataSourceId}`
    );
  }

  return dataSourceId;
  })();

  notionDataSourceIdCache.set(cacheKey, {
    expiresAt: Date.now() + NOTION_LOOKUP_CACHE_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    notionDataSourceIdCache.delete(cacheKey);
    throw error;
  }
}

interface NotionConfig {
  notionAccessToken: string;
  databaseId: string;
  hasToken: boolean;
  tokenLength: number;
  tokenFingerprint: string;
}

export interface NotionQueryPage {
  id?: string;
  properties?: Record<string, NotionPageProperty | undefined>;
}

export async function queryNotionDatabasePages(input: {
  notionAccessToken: string | null;
  notionDatabaseId: string | null;
  pageSize?: number;
  filter?: Record<string, unknown>;
}): Promise<NotionQueryPage[]> {
  const notionConfig = resolveNotionConfig(
    {
      notionAccessToken: input.notionAccessToken,
      notionDatabaseId: input.notionDatabaseId,
    },
    { log: false }
  );
  const dataSourceId = await resolveNotionDataSourceId(notionConfig, { log: false });
  const pages: NotionQueryPage[] = [];
  let nextCursor: string | null = null;

  do {
    const endpoint = `${NOTION_API_BASE_URL}/data_sources/${dataSourceId}/query`;
    const response: Response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionConfig.notionAccessToken}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
      },
      body: JSON.stringify({
        page_size: input.pageSize ?? 100,
        start_cursor: nextCursor ?? undefined,
        filter: input.filter,
      }),
      cache: "no-store",
    });

    const bodyText: string = await response.text().catch(() => "");
    const json: NotionQueryResponse | null = parseNotionJson<NotionQueryResponse>(bodyText);

    if (!response.ok) {
      const body = json?.message ?? (bodyText.trim() || null);
      if (response.status === 401) {
        throw new NotionIntegrationError(
          {
            success: false,
            stage: "notion_auth",
            errorCode: "NOTION_TOKEN_INVALID",
            message: "Notion rejected the configured bearer token.",
          },
          401
        );
      }

      throw new NotionIntegrationError(
        {
          success: false,
          stage: "notion_query",
          errorCode: "NOTION_SMOKE_FAILED",
          message:
            body ?? `Notion API request failed with status ${response.status} while querying ${NOTION_DATABASE_LABEL}.`,
        },
        response.status
      );
    }

    pages.push(...(json?.results ?? []));
    nextCursor = json?.has_more ? json.next_cursor ?? null : null;
  } while (nextCursor);

  return pages;
}

function resolveNotionConfig(
  input: {
    notionAccessToken: string | null;
    notionDatabaseId: string | null;
  },
  options?: { log?: boolean }
): NotionConfig {
  const notionAccessToken = trimNotionEnvValue(input.notionAccessToken);
  const rawDatabaseId = trimNotionEnvValue(input.notionDatabaseId) ?? "";
  const hasToken = Boolean(notionAccessToken);
  const databaseId = extractNotionDatabaseId(rawDatabaseId);
  const tokenLength = notionAccessToken?.length ?? 0;
  const tokenFingerprint = maskTokenFingerprint(notionAccessToken);

  if (options?.log !== false) {
    console.info(
      `[notion] config token_present=${hasToken} token_length=${tokenLength} token_fingerprint=${tokenFingerprint} database_id=${databaseId || "(missing)"}`
    );
  }

  if (!hasToken) {
    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_config",
        errorCode: "NOTION_TOKEN_MISSING",
        message: "Missing required env var NOTION_TOKEN.",
      },
      500
    );
  }

  if (!rawDatabaseId) {
    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_config",
        errorCode: "NOTION_DATABASE_ID_MISSING",
        message: "Missing required env var NOTION_DATABASE_ID.",
      },
      500
    );
  }

  if (!databaseId || !isValidNotionDatabaseId(databaseId)) {
    throw new NotionIntegrationError(
      {
        success: false,
        stage: "notion_config",
        errorCode: "NOTION_DATABASE_ID_INVALID",
        message: `Invalid NOTION_DATABASE_ID "${rawDatabaseId}". Expected a 32-char or 36-char Notion ID.`,
      },
      500
    );
  }

  return {
    notionAccessToken: notionAccessToken!,
    databaseId,
    hasToken,
    tokenLength,
    tokenFingerprint,
  };
}

export function extractNotionDatabaseId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(
    /([0-9a-f]{32})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );

  return match ? match[0] : null;
}

function isValidNotionDatabaseId(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value) || /^[0-9a-f-]{36}$/i.test(value);
}

function logNotionRequest(
  method: "GET" | "POST",
  endpoint: string,
  databaseId: string,
  hasToken: boolean
) {
  console.info(
    `[notion] ${method} endpoint=${endpoint} token_present=${hasToken} database_id=${databaseId}`
  );
}

function logNotionFailure(status: number, endpoint: string, body: string | null) {
  console.error(
    `[notion] request_failed status=${status} endpoint=${endpoint} response_body=${body ?? "(empty)"}`
  );
}

function trimNotionEnvValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function maskTokenFingerprint(token: string | null): string {
  if (!token) {
    return "(missing)";
  }

  if (token.length <= 8) {
    return `${token.slice(0, 2)}...${token.slice(-2)}`;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function parseNotionJson<T>(value: string): T | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function parseAdAccountRecord(page: {
  id?: string;
  properties?: Record<string, NotionPageProperty | undefined>;
}): AdAccountRecord | null {
  const properties = page.properties ?? {};
  const accountId = normalizeOptionalGoogleCustomerId(
    getNotionPropertyText(properties["ID"]) ?? getNotionPropertyText(properties["userDefined:ID"])
  );

  if (!page.id || !accountId) {
    return null;
  }

  return {
    accountId,
    accountName: getNotionPropertyText(properties["Account Name"]),
    accessPath: getNotionPropertyText(properties["Access Path"]),
    platform: getNotionPropertyText(properties["Platform"]),
  };
}

function isGoogleAdAccountRecord(record: AdAccountRecord): boolean {
  const platform = record.platform?.trim().toLowerCase();
  return !platform || platform === "google";
}

function resolveGoogleAdsRoute(
  record: AdAccountRecord,
  fallbackLoginCustomerId: string | null
): GoogleAdsRouteResolution {
  try {
    const route = resolveGoogleAdsAccessPath({
      accountId: record.accountId,
      originalAccessPath: record.accessPath,
      fallbackLoginCustomerId,
    });

    const resolution: GoogleAdsRouteResolution = {
      accountId: route.accountId,
      originalAccessPath: route.originalAccessPath,
      resolvedAccessPath: route.resolvedAccessPath,
      fallbackUsed: route.fallbackUsed,
      mode: route.resolutionMode,
      loginCustomerId: route.loginCustomerId,
    };
    logGoogleAdsRouteResolution(resolution);
    return resolution;
  } catch (error) {
    throw createGoogleAdsRoutingError(
      error instanceof Error
        ? error.message
        : "Google Ads routing failed because the target customer ID is missing or invalid."
    );
  }
}

function logGoogleAdsRouteResolution(route: GoogleAdsRouteResolution) {
  console.info(
    `[google-routing] target_customer_id=${route.accountId} original_access_path=${route.originalAccessPath ?? "(missing)"} resolved_access_path=${route.resolvedAccessPath} fallback_used=${route.fallbackUsed} mode=${route.mode} login_customer_id=${route.loginCustomerId ?? "(none)"}`
  );
}

function matchGoogleAdAccountRecord(
  lookupTerm: string,
  recordsByAccountId: Map<string, AdAccountRecord>,
  recordsByAccountName: Map<string, AdAccountRecord>
): AdAccountRecord | null {
  const normalizedLookupId = normalizeGoogleLookupId(lookupTerm);
  if (normalizedLookupId) {
    return recordsByAccountId.get(normalizedLookupId) ?? null;
  }

  const normalizedLookupTerm = normalizeLookupTerm(lookupTerm);
  if (!normalizedLookupTerm) {
    return null;
  }

  return recordsByAccountName.get(normalizedLookupTerm) ?? null;
}

export function getNotionPropertyText(property: NotionPageProperty | undefined): string | null {
  if (!property || !property.type) {
    return null;
  }

  switch (property.type) {
    case "title":
      return joinPlainText(property.title);
    case "rich_text":
      return joinPlainText(property.rich_text);
    case "select":
      return property.select?.name?.trim() || null;
    case "multi_select":
      return property.multi_select?.map((item) => item.name?.trim()).filter(Boolean).join(", ") || null;
    case "status":
      return property.status?.name?.trim() || null;
    case "number":
      return property.number === null || property.number === undefined ? null : String(property.number);
    case "url":
      return property.url?.trim() || null;
    case "email":
      return property.email?.trim() || null;
    case "phone_number":
      return property.phone_number?.trim() || null;
    case "checkbox":
      return property.checkbox ? "true" : "false";
    case "formula":
      return getFormulaText(property.formula);
    default:
      return null;
  }
}

export function getNotionPropertyBoolean(property: NotionPageProperty | undefined): boolean | null {
  if (!property || !property.type) {
    return null;
  }

  if (property.type === "checkbox") {
    return property.checkbox ?? false;
  }

  if (property.type === "formula" && property.formula?.type === "boolean") {
    return property.formula.boolean ?? false;
  }

  const text = getNotionPropertyText(property)?.trim().toLowerCase();
  if (text === "true" || text === "yes") {
    return true;
  }
  if (text === "false" || text === "no") {
    return false;
  }

  return null;
}

function getFormulaText(property: NotionPageProperty["formula"]): string | null {
  if (!property || !property.type) {
    return null;
  }

  if (property.type === "string") {
    return property.string?.trim() || null;
  }

  if (property.type === "number") {
    return property.number === null || property.number === undefined ? null : String(property.number);
  }

  if (property.type === "boolean") {
    return property.boolean ? "true" : "false";
  }

  if (property.type === "date") {
    return property.date?.start?.trim() || null;
  }

  return null;
}

function joinPlainText(items: Array<{ plain_text?: string }> | undefined): string | null {
  const value =
    items
      ?.map((item) => item.plain_text ?? "")
      .join("")
      .trim() ?? "";

  return value || null;
}

function normalizeOptionalGoogleCustomerId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeGoogleAccountId(value);
  return normalized || null;
}

function normalizeGoogleLookupId(value: string): string | null {
  const normalized = normalizeGoogleAccountId(value);
  return normalized.length === 10 ? normalized : null;
}

function normalizeLookupTerm(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function formatGoogleCustomerId(value: string): string {
  return formatGoogleAdsCustomerId(value);
}
