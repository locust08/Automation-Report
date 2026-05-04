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
}

export interface MonthlyReportAccountReadResult {
  total: number;
  raw: unknown[];
  accounts: MonthlyReportAccount[];
  skippedAccounts: MonthlyReportAccount[];
  sampleProperties: Record<string, unknown> | null;
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
      "google ads account id",
      "google ads id",
      "google account id",
      "google ads customer id",
      "google ads account",
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
      "meta ads account id",
      "meta ads id",
      "meta account id",
      "facebook ads account id",
      "facebook account id",
      "meta ads account",
    ]),
    "meta"
  );
  const clientName =
    getPropertyValue(properties, ["Client Name", "Name", "Client", "Account Name", "client name"]) ??
    googleAdsAccountId ??
    metaAdsAccountId ??
    `Notion ${notionPageId.slice(0, 8)}`;
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
