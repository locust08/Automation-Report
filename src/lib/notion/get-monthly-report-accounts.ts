import { Client } from "@notionhq/client";

import { getCredentials, normalizeGoogleAccountId, normalizeMetaAccountId } from "@/lib/reporting/env";

export interface MonthlyReportAccount {
  notionPageId: string;
  clientName: string;
  googleAdsAccountId: string | null;
  metaAdsAccountId: string | null;
  clientEmail: string | null;
  picEmail: string | null;
  status: string | null;
  monthlyReportEnabled: boolean;
  platform: string | null;
  reportType: string | null;
  isValid: boolean;
  skipReason: string | null;
  clientRelationPageIds?: string[];
}

export interface MonthlyReportAccountReadResult {
  total: number;
  raw: unknown[];
  accounts: MonthlyReportAccount[];
  skippedAccounts: MonthlyReportAccount[];
  sampleProperties: Record<string, unknown> | null;
}

export interface MonthlyReportTargetLookupInput {
  clientName?: string | null;
  googleAccountId?: string | null;
  metaAccountId?: string | null;
  recipientEmail?: string | null;
  ccEmail?: string | null;
  reportType?: string | null;
  platform?: string | null;
}

export async function getMonthlyReportAccounts(): Promise<MonthlyReportAccountReadResult> {
  const credentials = getCredentials();
  const notionToken = process.env.NOTION_TOKEN?.trim() || credentials.notionAccessToken || undefined;
  const databaseId =
    process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() ||
    process.env.NOTION_DATABASE_ID?.trim() ||
    credentials.notionDatabaseId ||
    "";

  console.log("NOTION_TOKEN exists:", !!notionToken);
  console.log("DB ID:", databaseId);

  const notion = new Client({
    auth: notionToken,
  });

  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    const dataSourceId = "data_sources" in database ? database.data_sources?.[0]?.id : undefined;

    if (!dataSourceId) {
      console.error("Monthly report raw Notion query failed: no data source found for database");
      return emptyResult();
    }

    const fullResponse = await notion.dataSources.query({
      data_source_id: dataSourceId,
    });
    const fullDataset = buildResultFromRows(fullResponse.results);

    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        and: [
          {
            property: "Status",
            select: {
              equals: "Active",
            },
          },
          {
            property: "Monthly Report Enabled",
            checkbox: {
              equals: true,
            },
          },
        ],
      },
    });

    console.log("Filtered results:", response.results.length);

    if (response.results.length === 0) {
      console.warn("Filter returned 0 -> fallback to full dataset");
      return fullDataset;
    }

    return buildResultFromRows(response.results);
  } catch (error) {
    console.error("Monthly report raw Notion query failed", error);
    return emptyResult();
  }
}

export async function resolveMonthlyReportTargetsFromNotion(
  targets: MonthlyReportTargetLookupInput[]
): Promise<MonthlyReportAccount[]> {
  if (targets.length === 0) {
    return [];
  }

  const allAccounts = await getAllMonthlyReportAccounts();
  const accountsByGoogleId = new Map(
    allAccounts
      .filter((account) => Boolean(account.googleAdsAccountId))
      .map((account) => [account.googleAdsAccountId as string, account])
  );
  const accountsByMetaId = new Map(
    allAccounts
      .filter((account) => Boolean(account.metaAdsAccountId))
      .map((account) => [account.metaAdsAccountId as string, account])
  );
  const relatedClientNameCache = new Map<string, Promise<string | null>>();

  return Promise.all(targets.map(async (target, index) => {
    const googleAccountId = normalizeOptionalAccountId(
      getStringValue(target.googleAccountId),
      "google"
    );
    const metaAccountId = normalizeOptionalAccountId(getStringValue(target.metaAccountId), "meta");
    const matchedAccounts = [
      googleAccountId ? accountsByGoogleId.get(googleAccountId) : null,
      metaAccountId ? accountsByMetaId.get(metaAccountId) : null,
    ].filter((account): account is MonthlyReportAccount => Boolean(account));
    const matchedAccount = matchedAccounts[0] ?? null;
    const clientName =
      (await resolveClientNameFromRelations(matchedAccounts, relatedClientNameCache)) ??
      resolveClientNameFromMatches(matchedAccounts) ??
      target.clientName?.trim() ??
      googleAccountId ??
      metaAccountId ??
      `Monthly Report Target ${index + 1}`;

    return {
      notionPageId: matchedAccount?.notionPageId ?? `manual-monthly-report-target-${index + 1}`,
      clientName,
      googleAdsAccountId: googleAccountId ?? matchedAccount?.googleAdsAccountId ?? null,
      metaAdsAccountId: metaAccountId ?? matchedAccount?.metaAdsAccountId ?? null,
      clientEmail: target.recipientEmail?.trim() || matchedAccount?.clientEmail || null,
      picEmail: target.ccEmail?.trim() || matchedAccount?.picEmail || null,
      status: matchedAccount?.status ?? null,
      monthlyReportEnabled: matchedAccount?.monthlyReportEnabled ?? true,
      platform:
        target.platform?.trim() ||
        matchedAccount?.platform ||
        (metaAccountId && !googleAccountId ? "Meta" : googleAccountId && !metaAccountId ? "Google" : "Google + Meta"),
      reportType: target.reportType?.trim() || matchedAccount?.reportType || "Overall",
      isValid: Boolean(googleAccountId || metaAccountId || matchedAccount?.isValid),
      skipReason:
        googleAccountId || metaAccountId || matchedAccount?.isValid ? null : "Missing account ID.",
    };
  }));
}

async function getAllMonthlyReportAccounts(): Promise<MonthlyReportAccount[]> {
  const credentials = getCredentials();
  const notionToken = process.env.NOTION_TOKEN?.trim() || credentials.notionAccessToken || undefined;
  const databaseId =
    process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() ||
    process.env.NOTION_DATABASE_ID?.trim() ||
    credentials.notionDatabaseId ||
    "";

  if (!notionToken || !databaseId) {
    return [];
  }

  const notion = new Client({
    auth: notionToken,
  });

  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    const dataSourceId = "data_sources" in database ? database.data_sources?.[0]?.id : undefined;

    if (!dataSourceId) {
      return [];
    }

    const results: unknown[] = [];
    let startCursor: string | undefined;
    do {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: startCursor,
      });
      results.push(...response.results);
      startCursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (startCursor);

    return results
      .map((row) => mapMonthlyReportAccount(row))
      .filter((account): account is MonthlyReportAccount => Boolean(account))
      .filter((account) => account.isValid);
  } catch (error) {
    console.error("Monthly report Notion target enrichment failed", error);
    return [];
  }
}

function resolveClientNameFromMatches(accounts: MonthlyReportAccount[]): string | null {
  const names = Array.from(
    new Set(accounts.map((account) => account.clientName.trim()).filter(Boolean))
  );

  if (names.length === 0) {
    return null;
  }

  return names.join(" / ");
}

async function resolveClientNameFromRelations(
  accounts: MonthlyReportAccount[],
  cache: Map<string, Promise<string | null>>
): Promise<string | null> {
  const relationPageIds = Array.from(
    new Set(accounts.flatMap((account) => account.clientRelationPageIds ?? []))
  );

  if (relationPageIds.length === 0) {
    return null;
  }

  const names = (
    await Promise.all(
      relationPageIds.map((pageId) => {
        let pending = cache.get(pageId);
        if (!pending) {
          pending = fetchClientRelationPageName(pageId);
          cache.set(pageId, pending);
        }
        return pending;
      })
    )
  ).filter((name): name is string => Boolean(name));

  return names.length > 0 ? Array.from(new Set(names)).join(" / ") : null;
}

async function fetchClientRelationPageName(pageId: string): Promise<string | null> {
  const credentials = getCredentials();
  const notionToken = process.env.NOTION_TOKEN?.trim() || credentials.notionAccessToken || undefined;

  if (!notionToken) {
    return null;
  }

  const notion = new Client({
    auth: notionToken,
  });

  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const properties =
      "properties" in page && page.properties && typeof page.properties === "object"
        ? (page.properties as Record<string, NotionPropertyValue | undefined>)
        : null;

    if (!properties) {
      return null;
    }

    return getPropertyValue(properties, [
      "Client Name",
      "Name",
      "Client",
      "Account Name",
      "client name",
    ]);
  } catch (error) {
    console.error("Monthly report Notion client relation lookup failed", error);
    return null;
  }
}

function buildResultFromRows(results: unknown[]): MonthlyReportAccountReadResult {
  console.log("Raw results count:", results.length);

  const first = results[0];
  const firstProperties =
    first && typeof first === "object" && "properties" in first
      ? (first.properties as Record<string, NotionPropertyValue | undefined>)
      : null;

  if (firstProperties) {
    console.log("Properties keys:", Object.keys(firstProperties));

    Object.entries(firstProperties).forEach(([key, value]) => {
      console.log(key, value?.type);
    });
  }

  const mappedAccounts = results
    .map((row) => mapMonthlyReportAccount(row))
    .filter((account): account is MonthlyReportAccount => Boolean(account));
  const accounts = mappedAccounts.filter((account) => account.isValid);
  const skippedAccounts = mappedAccounts.filter((account) => !account.isValid);

  console.log(`Monthly accounts mapped valid=${accounts.length}`);
  console.log(`Monthly accounts mapped skipped=${skippedAccounts.length}`);

  return {
    total: results.length,
    raw: results.slice(0, 3),
    accounts,
    skippedAccounts,
    sampleProperties: firstProperties,
  };
}

function mapMonthlyReportAccount(row: unknown): MonthlyReportAccount | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const notionPageId = getStringValue("id" in row ? row.id : null);
  const properties =
    "properties" in row && row.properties && typeof row.properties === "object"
      ? (row.properties as Record<string, NotionPropertyValue | undefined>)
      : null;

  if (!notionPageId || !properties) {
    return null;
  }

  const status = getPropertyValue(properties, ["Status", "status"]);
  const monthlyReportEnabled = getBooleanPropertyValue(properties, [
    "Monthly Report Enabled",
    "monthly report enabled",
    "monthly report enable",
  ]);
  const googleAdsAccountId = normalizeOptionalAccountId(
    getPropertyValue(properties, [
      "Google Ads Account ID",
      "Google Ads ID",
      "Google Account ID",
      "Google Ads Customer ID",
      "Google Ads Account",
      "Account ID",
      "ID",
      "google ads account id",
      "google ads id",
      "google account id",
      "google ads customer id",
      "google ads account",
      "account id",
      "id",
    ]),
    "google"
  );
  const metaAdsAccountId = normalizeOptionalAccountId(
    getPropertyValue(properties, [
      "Meta Ads Account ID",
      "Meta Ads ID",
      "Meta Account ID",
      "Facebook Ads Account ID",
      "Facebook Account ID",
      "Meta Ads Account",
      "Account ID",
      "ID",
      "meta ads account id",
      "meta ads id",
      "meta account id",
      "facebook ads account id",
      "facebook account id",
      "meta ads account",
      "account id",
      "id",
    ]),
    "meta"
  );
  const clientName =
    getPropertyValue(properties, ["Client Name", "Name", "Client", "Account Name", "client name"]) ??
    googleAdsAccountId ??
    metaAdsAccountId ??
    `Notion ${notionPageId.slice(0, 8)}`;
  const clientRelationPageIds = getPropertyRelationIds(properties, ["Client", "client"]);
  const platform = getPropertyValue(properties, ["Platform", "platform"]);
  const reportType = getPropertyValue(properties, [
    "Platform Report Type",
    "Platform/Report Type",
    "Report Type",
    "platform report type",
    "platform/report type",
    "report type",
  ]);
  const isValid = Boolean(googleAdsAccountId || metaAdsAccountId);

  return {
    notionPageId,
    clientName,
    googleAdsAccountId,
    metaAdsAccountId,
    clientEmail: getPropertyValue(properties, ["Client Email", "Email", "client email", "email"]),
    picEmail: getPropertyValue(properties, [
      "Person in Charge Email",
      "Person-In-Charge Email",
      "PIC Email",
      "person in charge email",
      "person-in-charge email",
      "pic email",
    ]),
    status,
    monthlyReportEnabled,
    platform,
    reportType,
    isValid,
    skipReason: isValid ? null : "Missing both Google Ads ID and Meta Ads ID.",
    clientRelationPageIds,
  };
}

function getPropertyValue(
  properties: Record<string, NotionPropertyValue | undefined>,
  aliases: string[]
): string | null {
  for (const alias of aliases) {
    const property = findProperty(properties, alias);
    const value = getNotionPropertyText(property);
    if (value) {
      return value;
    }
  }

  return null;
}

function getBooleanPropertyValue(
  properties: Record<string, NotionPropertyValue | undefined>,
  aliases: string[]
): boolean {
  for (const alias of aliases) {
    const property = findProperty(properties, alias);
    const value = getNotionPropertyBoolean(property);
    if (value !== null) {
      return value;
    }
  }

  return false;
}

function getPropertyRelationIds(
  properties: Record<string, NotionPropertyValue | undefined>,
  aliases: string[]
): string[] {
  for (const alias of aliases) {
    const property = findProperty(properties, alias);
    const ids = getNotionPropertyRelationIds(property);
    if (ids.length > 0) {
      return ids;
    }
  }

  return [];
}

function findProperty(
  properties: Record<string, NotionPropertyValue | undefined>,
  alias: string
): NotionPropertyValue | undefined {
  const normalizedAlias = normalizePropertyKey(alias);

  return Object.entries(properties).find(([key]) => normalizePropertyKey(key) === normalizedAlias)?.[1];
}

function normalizePropertyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNotionPropertyText(property: NotionPropertyValue | undefined): string | null {
  if (!property || typeof property !== "object" || !("type" in property)) {
    return null;
  }

  const typedProperty = property as NotionPropertyValue;

  switch (typedProperty.type) {
    case "title":
      return joinRichText(asRichTextArray(typedProperty.title));
    case "rich_text":
      return joinRichText(asRichTextArray(typedProperty.rich_text));
    case "select":
      return getNestedName(typedProperty.select);
    case "status":
      return getNestedName(typedProperty.status);
    case "email":
      return getStringValue(typedProperty.email);
    case "url":
      return getStringValue(typedProperty.url);
    case "phone_number":
      return getStringValue(typedProperty.phone_number);
    case "number":
      return typedProperty.number === null || typedProperty.number === undefined
        ? null
        : String(typedProperty.number);
    case "formula":
      return getFormulaText(asFormulaValue(typedProperty.formula));
    case "unique_id":
      return getUniqueIdText(typedProperty.unique_id);
    default:
      return null;
  }
}

function getNotionPropertyBoolean(property: NotionPropertyValue | undefined): boolean | null {
  if (!property || typeof property !== "object" || !("type" in property)) {
    return null;
  }

  const typedProperty = property as NotionPropertyValue;

  if (typedProperty.type === "checkbox") {
    return typeof typedProperty.checkbox === "boolean" ? typedProperty.checkbox : false;
  }

  const formula = asFormulaValue(getObjectField(typedProperty, "formula"));
  if (typedProperty.type === "formula" && formula?.type === "boolean") {
    return typeof formula.boolean === "boolean" ? formula.boolean : false;
  }

  return null;
}

function getNotionPropertyRelationIds(property: NotionPropertyValue | undefined): string[] {
  if (!property || typeof property !== "object" || !("type" in property) || property.type !== "relation") {
    return [];
  }

  const relation = getObjectField(property, "relation");
  if (!Array.isArray(relation)) {
    return [];
  }

  return relation
    .map((item) =>
      item && typeof item === "object" && "id" in item ? getStringValue(item.id) : null
    )
    .filter((id): id is string => Boolean(id));
}

function asRichTextArray(value: unknown): Array<{ plain_text?: string | null }> | undefined {
  return Array.isArray(value) ? (value as Array<{ plain_text?: string | null }>) : undefined;
}

function getNestedName(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("name" in value)) {
    return null;
  }

  const name = value.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function asFormulaValue(
  value: unknown
):
  | {
      type?: string;
      string?: string | null;
      number?: number | null;
      boolean?: boolean | null;
    }
  | undefined {
  return value && typeof value === "object"
    ? (value as {
        type?: string;
        string?: string | null;
        number?: number | null;
        boolean?: boolean | null;
      })
    : undefined;
}

function getUniqueIdText(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("number" in value)) {
    return null;
  }

  const numberValue = value.number;
  return typeof numberValue === "number" ? String(numberValue) : null;
}

function getObjectField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || !(key in value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function joinRichText(items: Array<{ plain_text?: string | null }> | undefined): string | null {
  if (!items?.length) {
    return null;
  }

  const value = items.map((item) => item.plain_text ?? "").join("").trim();
  return value || null;
}

function getFormulaText(
  formula:
    | {
        type?: string;
        string?: string | null;
        number?: number | null;
        boolean?: boolean | null;
      }
    | undefined
): string | null {
  if (!formula?.type) {
    return null;
  }

  if (formula.type === "string") {
    return getStringValue(formula.string);
  }

  if (formula.type === "number") {
    return formula.number === null || formula.number === undefined ? null : String(formula.number);
  }

  if (formula.type === "boolean") {
    return formula.boolean === null || formula.boolean === undefined ? null : String(formula.boolean);
  }

  return null;
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalAccountId(
  value: string | null,
  platform: "google" | "meta"
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    platform === "google" ? normalizeGoogleAccountId(value) : normalizeMetaAccountId(value);

  return normalized || null;
}

function emptyResult(): MonthlyReportAccountReadResult {
  return {
    total: 0,
    raw: [],
    accounts: [],
    skippedAccounts: [],
    sampleProperties: null,
  };
}

type NotionPropertyValue =
  | {
      type?: "title";
      title?: Array<{ plain_text?: string | null }>;
    }
  | {
      type?: "rich_text";
      rich_text?: Array<{ plain_text?: string | null }>;
    }
  | {
      type?: "select";
      select?: { name?: string | null } | null;
    }
  | {
      type?: "status";
      status?: { name?: string | null } | null;
    }
  | {
      type?: "email";
      email?: string | null;
    }
  | {
      type?: "url";
      url?: string | null;
    }
  | {
      type?: "phone_number";
      phone_number?: string | null;
    }
  | {
      type?: "number";
      number?: number | null;
    }
  | {
      type?: "checkbox";
      checkbox?: boolean | null;
    }
  | {
      type?: "unique_id";
      unique_id?: { number?: number | null } | null;
    }
  | {
      type?: "relation";
      relation?: Array<{ id?: string | null }>;
    }
  | {
      type?: "formula";
      formula?: {
        type?: string;
        string?: string | null;
        number?: number | null;
        boolean?: boolean | null;
      } | null;
    }
  | {
      type?: string;
      [key: string]: unknown;
    };
