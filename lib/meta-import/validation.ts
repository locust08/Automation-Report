import { createHash } from "node:crypto";

import { META_IMPORT_REQUIRED_FIELDS } from "@/lib/meta-import/columns";
import type {
  MetaImportColumnMapping,
  MetaImportedRow,
  MetaImportIssue,
  MetaImportPreviewRow,
  MetaImportReportingLevel,
  MetaImportSummary,
} from "@/lib/meta-import/types";

const NUMERIC_FIELDS = [
  "budget",
  "amountSpent",
  "impressions",
  "reach",
  "frequency",
  "linkClicks",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "results",
  "costPerResult",
  "landingPageViews",
  "addToCart",
  "initiateCheckout",
  "purchases",
  "purchaseConversionValue",
  "roas",
  "leads",
  "messagingConversationsStarted",
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

export function validateMetaImportRows(input: {
  rows: Record<string, string>[];
  mapping: MetaImportColumnMapping;
  expectedAccountId: string;
  allowAccountMismatch: boolean;
  duplicateActions?: Map<string, "create" | "update" | "skip">;
}): { rows: MetaImportPreviewRow[]; reportingLevel: MetaImportReportingLevel; summary: MetaImportSummary } {
  const mappedHeaders = new Set(Object.values(input.mapping).filter(Boolean));
  const seen = new Set<string>();
  const previewRows: MetaImportPreviewRow[] = input.rows.map((rawRow, index): MetaImportPreviewRow => {
    const issues: MetaImportIssue[] = [];
    const value = (field: keyof MetaImportColumnMapping): string => {
      const header = input.mapping[field];
      return header ? rawRow[header]?.trim() ?? "" : "";
    };
    const accountId = normalizeId(value("accountId") || input.expectedAccountId);
    const campaignId = nullableId(value("campaignId"));
    const campaignName = nullable(value("campaignName"));
    const adSetId = nullableId(value("adSetId"));
    const adSetName = nullable(value("adSetName"));
    const adId = nullableId(value("adId"));
    const adName = nullable(value("adName"));
    const reportingLevel = detectRowLevel({ campaignId, campaignName, adSetId, adSetName, adId, adName });

    if (reportingLevel === "unknown") {
      issues.push(error("missing_identifier", "A campaign, ad set, or ad ID or name is required."));
    }
    if (!accountId) {
      issues.push(error("missing_account_id", "An account ID is required."));
    } else if (accountId !== normalizeId(input.expectedAccountId)) {
      issues.push(
        input.allowAccountMismatch
          ? warning("account_mismatch_confirmed", `Row account ${accountId} differs from ${input.expectedAccountId}.`)
          : error("account_mismatch", `Row account ${accountId} does not match ${input.expectedAccountId}.`)
      );
    }

    const rawStart = value("day") || value("reportingStart");
    const rawEnd = value("day") || value("reportingEnd") || rawStart;
    const reportingStart = parseMetaDate(rawStart);
    const reportingEnd = parseMetaDate(rawEnd);
    if (!reportingStart || !reportingEnd) {
      issues.push(error("invalid_date", "Valid reporting start and end dates are required."));
    } else if (reportingStart > reportingEnd) {
      issues.push(error("invalid_date_range", "Reporting start cannot be after reporting end."));
    }

    for (const requiredField of META_IMPORT_REQUIRED_FIELDS) {
      if (!input.mapping[requiredField]) {
        issues.push(error("missing_required_column", `Map the required ${requiredField} column.`));
      }
    }

    const numbers = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => {
        const parsed = parseMetaNumber(value(field), field === "ctr");
        if (parsed.invalid) {
          issues.push(
            field === "amountSpent" || field === "impressions" || field === "clicks"
              ? error("invalid_number", `${field} contains an invalid number.`, input.mapping[field])
              : warning("invalid_optional_number", `${field} could not be parsed and was left blank.`)
          );
        }
        return [field, parsed.value];
      })
    ) as Record<NumericField, number | null>;

    const uniqueKey = buildMetaImportUniqueKey({
      accountId,
      campaignId,
      campaignName,
      adSetId,
      adSetName,
      adId,
      adName,
      fallbackFingerprint:
        campaignId || adSetId || adId
          ? undefined
          : Object.entries(rawRow)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([header, rawValue]) => `${header.trim().toLocaleLowerCase("en")}=${rawValue.trim()}`)
              .join("|"),
      reportingStart: reportingStart ?? "invalid",
      reportingEnd: reportingEnd ?? "invalid",
      reportingLevel,
    });
    let duplicateAction = input.duplicateActions?.get(uniqueKey) ?? "create";
    if (seen.has(uniqueKey)) {
      duplicateAction = "skip";
      issues.push(warning("duplicate_in_file", "This row duplicates an earlier row in the uploaded file."));
    }
    seen.add(uniqueKey);

    const invalid = issues.some((issue) => issue.severity === "error");
    const rawMetadata = Object.fromEntries(
      Object.entries(rawRow).filter(([header]) => !mappedHeaders.has(header))
    );
    const normalized: MetaImportedRow = {
      uniqueKey,
      source: "meta_csv",
      accountId,
      accountName: nullable(value("accountName")),
      reportingLevel: reportingLevel === "unknown" ? "campaign" : reportingLevel,
      campaignId,
      campaignName,
      adSetId,
      adSetName,
      adId,
      adName,
      delivery: nullable(value("delivery")),
      status: nullable(value("status")),
      objective: nullable(value("objective")),
      buyingType: nullable(value("buyingType")),
      budget: numbers.budget,
      budgetType: nullable(value("budgetType")),
      reportingStart: reportingStart ?? "",
      reportingEnd: reportingEnd ?? "",
      amountSpent: numbers.amountSpent ?? 0,
      impressions: numbers.impressions ?? 0,
      reach: numbers.reach ?? 0,
      frequency: numbers.frequency,
      linkClicks: numbers.linkClicks ?? 0,
      clicks: numbers.clicks ?? numbers.linkClicks ?? 0,
      ctr: numbers.ctr,
      cpc: numbers.cpc,
      cpm: numbers.cpm,
      results: numbers.results ?? 0,
      resultType: nullable(value("resultType")),
      costPerResult: numbers.costPerResult,
      landingPageViews: numbers.landingPageViews ?? 0,
      addToCart: numbers.addToCart ?? 0,
      initiateCheckout: numbers.initiateCheckout ?? 0,
      purchases: numbers.purchases ?? 0,
      purchaseConversionValue: numbers.purchaseConversionValue ?? 0,
      roas: numbers.roas,
      leads: numbers.leads ?? 0,
      messagingConversationsStarted: numbers.messagingConversationsStarted ?? 0,
      rawMetadata,
    };

    return {
      ...normalized,
      rowNumber: index + 2,
      duplicateAction,
      issues,
      validationStatus: invalid
        ? "invalid"
        : duplicateAction === "skip"
          ? "duplicate"
          : issues.length > 0 || duplicateAction === "update"
            ? "warning"
            : "valid",
    };
  });

  return {
    rows: previewRows,
    reportingLevel: detectFileLevel(previewRows),
    summary: summarizeRows(previewRows),
  };
}

export function parseMetaNumber(rawValue: string, percentage = false): { value: number | null; invalid: boolean } {
  const raw = rawValue.trim();
  if (!raw || raw === "—" || raw === "-" || /^(?:using (?:ad set|campaign) budget|ongoing|n\/a)$/i.test(raw)) {
    return { value: null, invalid: false };
  }
  const negative = /^\(.*\)$/.test(raw);
  let cleaned = raw
    .replace(/[()%]/g, "")
    .replace(/\b(?:RM|MYR|USD|SGD|AUD|EUR|GBP)\b/gi, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();
  if (!cleaned) {
    return { value: null, invalid: true };
  }

  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    cleaned = comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = cleaned.length - comma - 1;
    cleaned = decimals > 0 && decimals <= 2 ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { value: null, invalid: true };
  }
  const value = negative ? -Math.abs(parsed) : parsed;
  return { value: percentage ? value : value, invalid: false };
}

export function parseMetaDate(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }
  const iso = value.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)(?:\s.*)?$/);
  if (iso) {
    return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const local = value.match(/^([0-3]?\d)[-/]([0-3]?\d)[-/](\d{2}|\d{4})(?:\s.*)?$/);
  if (local) {
    const first = Number(local[1]);
    const second = Number(local[2]);
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return validIsoDate(year, month, day);
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function buildMetaImportUniqueKey(input: {
  accountId: string;
  campaignId: string | null;
  campaignName?: string | null;
  adSetId: string | null;
  adSetName?: string | null;
  adId: string | null;
  adName?: string | null;
  fallbackFingerprint?: string;
  reportingStart: string;
  reportingEnd: string;
  reportingLevel: MetaImportReportingLevel;
}): string {
  return createHash("sha256")
    .update(
      [
        normalizeId(input.accountId),
        input.reportingLevel,
        input.campaignId ?? "",
        normalizeIdentifierName(input.campaignName),
        input.adSetId ?? "",
        normalizeIdentifierName(input.adSetName),
        input.adId ?? "",
        normalizeIdentifierName(input.adName),
        input.fallbackFingerprint ?? "",
        input.reportingStart,
        input.reportingEnd,
      ].join("|")
    )
    .digest("hex");
}

function detectRowLevel(input: {
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  adId: string | null;
  adName: string | null;
}): "campaign" | "adset" | "ad" | "unknown" {
  if (input.adId || input.adName) return "ad";
  if (input.adSetId || input.adSetName) return "adset";
  if (input.campaignId || input.campaignName) return "campaign";
  return "unknown";
}

function detectFileLevel(rows: MetaImportPreviewRow[]): MetaImportReportingLevel {
  const levels = new Set(rows.filter((row) => row.reportingStart).map((row) => row.reportingLevel));
  if (levels.size === 0) return "unknown";
  if (levels.size > 1) return "mixed";
  return Array.from(levels)[0];
}

function summarizeRows(rows: MetaImportPreviewRow[]): MetaImportSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.validationStatus === "valid").length,
    warningRows: rows.filter((row) => row.validationStatus === "warning").length,
    invalidRows: rows.filter((row) => row.validationStatus === "invalid").length,
    duplicateRows: rows.filter((row) => row.validationStatus === "duplicate").length,
    createRows: rows.filter((row) => row.duplicateAction === "create" && row.validationStatus !== "invalid").length,
    updateRows: rows.filter((row) => row.duplicateAction === "update" && row.validationStatus !== "invalid").length,
    skipRows: rows.filter((row) => row.duplicateAction === "skip").length,
  };
}

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function normalizeId(value: string): string {
  return value.replace(/^act_/i, "").replace(/\D/g, "");
}

function nullableId(value: string): string | null {
  const normalized = normalizeId(value);
  return normalized || null;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function normalizeIdentifierName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en").replace(/\s+/g, " ") ?? "";
}

function error(code: string, message: string, column?: string): MetaImportIssue {
  return { severity: "error", code, message, column };
}

function warning(code: string, message: string): MetaImportIssue {
  return { severity: "warning", code, message };
}
