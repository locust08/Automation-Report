import { Client } from "@notionhq/client";

import { getCredentials } from "@/lib/reporting/env";
import type { ScheduledMonthlyReportType } from "@/src/lib/cron/monthly-report-confirmation";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

export type MonthlyReportAccountSendStatus = "Sent" | "Failed" | "Skipped";

interface UpdateMonthlyReportAccountStatusInput {
  account: MonthlyReportAccount;
  reportType: ScheduledMonthlyReportType;
  status: MonthlyReportAccountSendStatus;
  sentDate?: string | null;
  errorMessage?: string | null;
}

type NotionPropertySchema = { type?: string };

const missingStatusSchemaWarnings = new Set<string>();

export async function updateMonthlyReportAccountSendStatus(
  input: UpdateMonthlyReportAccountStatusInput
): Promise<void> {
  const notionPageId = input.account.notionPageId?.trim();
  if (!notionPageId || notionPageId.startsWith("manual-monthly-report-target-")) {
    return;
  }

  const credentials = getCredentials();
  const notionToken = process.env.NOTION_TOKEN?.trim() || credentials.notionAccessToken || "";
  if (!notionToken) {
    console.warn("[monthly-report] account send status update skipped: NOTION_TOKEN is not configured");
    return;
  }

  const notion = new Client({ auth: notionToken });

  try {
    const page = await notion.pages.retrieve({ page_id: notionPageId });
    const pageProperties =
      "properties" in page && page.properties && typeof page.properties === "object"
        ? (page.properties as Record<string, NotionPropertySchema | undefined>)
        : {};
    const properties: Record<string, unknown> = {};
    const statusProperty = findProperty(pageProperties, getStatusAliases(input.reportType));
    const sentDateProperty = findProperty(pageProperties, getLastSentDateAliases(input.reportType));
    const errorProperty = findProperty(pageProperties, getErrorAliases(input.reportType));

    if (statusProperty) {
      const value = buildPropertyValue(statusProperty.type, input.status);
      if (value) {
        properties[statusProperty.name] = value;
      }
    }

    if (sentDateProperty && input.status === "Sent" && input.sentDate) {
      const value = buildPropertyValue(sentDateProperty.type, input.sentDate);
      if (value) {
        properties[sentDateProperty.name] = value;
      }
    }

    if (errorProperty) {
      const value = buildPropertyValue(
        errorProperty.type,
        input.status === "Failed" ? input.errorMessage ?? "Unknown report send failure." : null
      );
      if (value) {
        properties[errorProperty.name] = value;
      }
    }

    if (Object.keys(properties).length === 0) {
      warnMissingStatusSchemaOnce(input.reportType, pageProperties);
      return;
    }

    await notion.pages.update({
      page_id: notionPageId,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
    });
  } catch (error) {
    console.error(
      `[monthly-report] account send status update failed page_id=${notionPageId} error=${toErrorMessage(error)}`
    );
  }
}

function warnMissingStatusSchemaOnce(
  reportType: ScheduledMonthlyReportType,
  properties: Record<string, NotionPropertySchema | undefined>
): void {
  const propertyNames = Object.keys(properties).sort();
  const schemaKey = `${reportType}:${propertyNames.join("|")}`;

  if (missingStatusSchemaWarnings.has(schemaKey)) {
    return;
  }

  missingStatusSchemaWarnings.add(schemaKey);
  console.info(
    `[monthly-report] account send status update skipped: no compatible optional Notion status properties found for report_type=${reportType}. Add one of: ${getStatusAliases(reportType).join(", ")}.`
  );
}

function getStatusAliases(reportType: ScheduledMonthlyReportType): string[] {
  const reportSpecific =
    reportType === "monthlyAdvanced"
      ? ["Advanced Report Send Status", "Advanced Send Status"]
      : reportType === "biweeklyOverall"
        ? ["Bi-weekly Report Send Status", "Bi-Weekly Report Send Status", "Biweekly Send Status"]
        : ["Monthly Report Send Status", "Monthly Send Status"];

  return [...reportSpecific, "Send Status", "Report Send Status", "send_status"];
}

function getLastSentDateAliases(reportType: ScheduledMonthlyReportType): string[] {
  const reportSpecific =
    reportType === "monthlyAdvanced"
      ? ["Advanced Report Last Sent Date", "Advanced Last Sent Date"]
      : reportType === "biweeklyOverall"
        ? ["Bi-weekly Report Last Sent Date", "Bi-Weekly Report Last Sent Date", "Biweekly Last Sent Date"]
        : ["Monthly Report Last Sent Date", "Monthly Last Sent Date"];

  return [...reportSpecific, "Last Sent Date", "Report Last Sent Date", "sent_at", "Sent At"];
}

function getErrorAliases(reportType: ScheduledMonthlyReportType): string[] {
  const reportSpecific =
    reportType === "monthlyAdvanced"
      ? ["Advanced Report Error Message", "Advanced Send Error"]
      : reportType === "biweeklyOverall"
        ? ["Bi-weekly Report Error Message", "Bi-Weekly Report Error Message", "Biweekly Send Error"]
        : ["Monthly Report Error Message", "Monthly Send Error"];

  return [...reportSpecific, "Error Message", "Send Error Message", "error_message"];
}

function findProperty(
  properties: Record<string, NotionPropertySchema | undefined>,
  aliases: string[]
): { name: string; type: string } | null {
  const normalizedAliases = new Set(aliases.map((alias) => normalizePropertyName(alias)));
  const match = Object.entries(properties).find(([name]) => normalizedAliases.has(normalizePropertyName(name)));
  const type = match?.[1]?.type;
  return match && type ? { name: match[0], type } : null;
}

function buildPropertyValue(type: string | undefined, value: string | null): Record<string, unknown> | null {
  switch (type) {
    case "status":
      return value ? { status: { name: value } } : null;
    case "select":
      return value ? { select: { name: value } } : null;
    case "title":
      return { title: value ? [{ text: { content: value } }] : [] };
    case "rich_text":
      return { rich_text: value ? [{ text: { content: value } }] : [] };
    case "date":
      return value ? { date: { start: value } } : { date: null };
    case "url":
      return { url: value };
    case "email":
      return { email: value };
    default:
      return null;
  }
}

function normalizePropertyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Notion update failure.";
}
