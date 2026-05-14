import { Client } from "@notionhq/client";

import { getCredentials } from "@/lib/reporting/env";
import { extractNotionDatabaseId } from "@/lib/reporting/notion";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const NOTION_LOG_PROPERTY_ALIASES = {
  notionPageId: ["notion_page_id", "Notion Page ID"],
  clientName: ["client_name", "Client Name"],
  reportType: ["report_type", "Report Type", "platform", "Platform"],
  accountId: ["account_id", "Account ID"],
  reportMonth: ["report_month", "Report Month"],
  recipientEmail: ["recipient_email", "Recipient Email"],
  ccEmail: ["pic_email", "PIC Email", "cc_email", "CC Email"],
  sendStatus: ["send_status", "Send Status"],
  resendEmailId: ["resend_email_id", "Resend Email ID"],
  errorMessage: ["error_message", "Error Message"],
  createdAt: ["created_at", "Created At"],
  sentAt: ["sent_at", "Sent At"],
} as const;

interface LogConfig {
  notion: Client;
  dataSourceId: string;
  properties: Record<string, { type?: string } | undefined>;
}

interface MonthlyReportEmailLogInput {
  account: MonthlyReportAccount;
  reportType: string;
  reportMonthKey: string;
}

interface RecordMonthlyReportEmailSentInput extends MonthlyReportEmailLogInput {
  recipientEmail: string | null;
  ccEmail: string | null;
  resendEmailId: string | null;
}

export async function hasMonthlyReportEmailBeenSent(
  input: MonthlyReportEmailLogInput
): Promise<boolean> {
  const config = await resolveLogConfig();
  if (!config) {
    return false;
  }

  const accountId = resolvePrimaryAccountId(input.account);
  if (!accountId) {
    return false;
  }

  const accountProperty = findLogProperty(config.properties, NOTION_LOG_PROPERTY_ALIASES.accountId);
  const monthProperty = findLogProperty(config.properties, NOTION_LOG_PROPERTY_ALIASES.reportMonth);
  const statusProperty = findLogProperty(config.properties, NOTION_LOG_PROPERTY_ALIASES.sendStatus);
  const reportTypeProperty = findLogProperty(config.properties, NOTION_LOG_PROPERTY_ALIASES.reportType);

  if (!accountProperty || !monthProperty || !statusProperty || !reportTypeProperty) {
    console.warn("[monthly-report] duplicate-send check skipped: monthly report log schema is missing required properties");
    return false;
  }

  const filter = {
    and: [
      buildTextLikeFilter(accountProperty.name, accountProperty.type, accountId),
      buildTextLikeFilter(monthProperty.name, monthProperty.type, input.reportMonthKey),
      buildTextLikeFilter(reportTypeProperty.name, reportTypeProperty.type, input.reportType),
      buildTextLikeFilter(statusProperty.name, statusProperty.type, "sent"),
    ],
  } as Parameters<typeof config.notion.dataSources.query>[0]["filter"];

  const response = await config.notion.dataSources.query({
    data_source_id: config.dataSourceId,
    page_size: 1,
    filter,
  });

  return response.results.length > 0;
}

export async function recordMonthlyReportEmailSent(
  input: RecordMonthlyReportEmailSentInput
): Promise<void> {
  const config = await resolveLogConfig();
  if (!config) {
    return;
  }

  const now = new Date().toISOString();
  const accountId = resolvePrimaryAccountId(input.account);
  const values: Record<string, string | null> = {
    notionPageId: input.account.notionPageId,
    clientName: input.account.clientName,
    reportType: input.reportType,
    accountId,
    reportMonth: input.reportMonthKey,
    recipientEmail: input.recipientEmail,
    ccEmail: input.ccEmail,
    sendStatus: "sent",
    resendEmailId: input.resendEmailId,
    errorMessage: null,
    createdAt: now,
    sentAt: now,
  };

  const properties = Object.entries(values).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      const logProperty = findLogProperty(
        config.properties,
        NOTION_LOG_PROPERTY_ALIASES[key as keyof typeof NOTION_LOG_PROPERTY_ALIASES]
      );
      if (!logProperty) {
        return acc;
      }

      const propertyValue = buildPropertyValue(logProperty.type, value);
      if (propertyValue) {
        acc[logProperty.name] = propertyValue;
      }
      return acc;
    },
    {}
  );

  if (Object.keys(properties).length === 0) {
    console.warn("[monthly-report] sent log skipped: monthly report log schema did not match known properties");
    return;
  }

  await config.notion.pages.create({
    parent: {
      data_source_id: config.dataSourceId,
    },
    properties: properties as Parameters<typeof config.notion.pages.create>[0]["properties"],
  });
}

async function resolveLogConfig(): Promise<LogConfig | null> {
  const credentials = getCredentials();
  const notionToken = process.env.NOTION_TOKEN?.trim() || credentials.notionAccessToken || "";
  const rawDatabaseId =
    process.env.NOTION_MONTHLY_REPORT_LOGS_DATABASE_ID?.trim() ||
    process.env.NOTION_REPORT_LOGS_DATABASE_ID?.trim() ||
    "";
  const databaseId = rawDatabaseId ? extractNotionDatabaseId(rawDatabaseId) ?? rawDatabaseId : "";

  if (!notionToken || !databaseId) {
    console.warn("[monthly-report] duplicate-send check skipped: monthly report log database is not configured");
    return null;
  }

  try {
    const notion = new Client({ auth: notionToken });
    const database = await notion.databases.retrieve({ database_id: databaseId });
    const dataSourceId = "data_sources" in database ? database.data_sources?.[0]?.id : undefined;
    if (!dataSourceId) {
      console.warn("[monthly-report] duplicate-send check skipped: monthly report log database has no data source");
      return null;
    }

    const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const properties =
      "properties" in dataSource && dataSource.properties && typeof dataSource.properties === "object"
        ? (dataSource.properties as Record<string, { type?: string } | undefined>)
        : {};

    return {
      notion,
      dataSourceId,
      properties,
    };
  } catch (error) {
    console.error("[monthly-report] duplicate-send log lookup failed", error);
    return null;
  }
}

function findLogProperty(
  properties: Record<string, { type?: string } | undefined>,
  aliases: readonly string[]
): { name: string; type: string } | null {
  const normalizedAliases = new Set(aliases.map((alias) => normalizePropertyName(alias)));
  const match = Object.entries(properties).find(([name]) =>
    normalizedAliases.has(normalizePropertyName(name))
  );
  const type = match?.[1]?.type;
  return match && type ? { name: match[0], type } : null;
}

function buildTextLikeFilter(
  property: string,
  type: string,
  value: string
): Record<string, unknown> {
  if (type === "select" || type === "status") {
    return {
      property,
      [type]: {
        equals: value,
      },
    };
  }

  if (type === "title" || type === "rich_text" || type === "email") {
    return {
      property,
      [type]: {
        equals: value,
      },
    };
  }

  if (type === "number") {
    const numberValue = Number(value.replace(/[^\d.-]+/g, ""));
    return {
      property,
      number: {
        equals: Number.isFinite(numberValue) ? numberValue : 0,
      },
    };
  }

  return {
    property,
    rich_text: {
      equals: value,
    },
  };
}

function buildPropertyValue(type: string, value: string | null): Record<string, unknown> | null {
  switch (type) {
    case "title":
      return {
        title: value ? [{ text: { content: value } }] : [],
      };
    case "rich_text":
      return {
        rich_text: value ? [{ text: { content: value } }] : [],
      };
    case "email":
      return {
        email: value,
      };
    case "date":
      return value ? { date: { start: value } } : { date: null };
    case "status":
      return value ? { status: { name: value } } : null;
    case "select":
      return value ? { select: { name: value } } : null;
    case "url":
      return {
        url: value,
      };
    default:
      return null;
  }
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  return account.googleAdsAccountId ?? account.metaAdsAccountId;
}

function normalizePropertyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
