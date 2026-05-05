import { jsPDF } from "jspdf";

import { getOverallReport } from "@/lib/reporting/service";
import { summarizeAudienceItemsForChart } from "@/lib/reporting/audience-breakdown";
import type { CampaignGroup, OverallReportPayload, SummaryMetric } from "@/lib/reporting/types";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

type MonthlyReportType = "overall" | "google" | "meta";

export async function generateMonthlyReportPdfForAccount(account: MonthlyReportAccount): Promise<Buffer> {
  const previousMonth = resolvePreviousMonthRange(new Date());
  const reportPayload = await buildReportPayload(account, previousMonth.startDate, previousMonth.endDate);

  return generateMonthlyReportPdf({
    account,
    reportPayload,
    reportMonth: previousMonth.reportMonthLabel,
  });
}

function normalizeReportType(value: string | null): MonthlyReportType {
  const normalized = value?.trim().toLowerCase() ?? "";
  const mentionsGoogle = normalized.includes("google");
  const mentionsMeta = normalized.includes("meta");
  if (mentionsGoogle && mentionsMeta) {
    return "overall";
  }
  if (mentionsMeta) {
    return "meta";
  }
  if (mentionsGoogle) {
    return "google";
  }
  return "overall";
}

function resolveAccountReportType(account: MonthlyReportAccount): MonthlyReportType {
  return normalizeReportType(account.reportType ?? account.platform);
}

function formatAccountReportLabel(account: MonthlyReportAccount): string {
  return account.reportType ?? account.platform ?? resolveAccountReportType(account);
}

async function buildReportPayload(
  account: MonthlyReportAccount,
  startDate: string,
  endDate: string
): Promise<OverallReportPayload> {
  const reportType = resolveAccountReportType(account);

  return getOverallReport({
    accountId: null,
    googleAccountId: reportType === "meta" ? null : account.googleAdsAccountId,
    metaAccountId: reportType === "google" ? null : account.metaAdsAccountId,
    startDate,
    endDate,
  });
}

async function generateMonthlyReportPdf(input: {
  account: MonthlyReportAccount;
  reportPayload: OverallReportPayload;
  reportMonth: string;
}): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const marginBottom = 44;
  let cursorY = 54;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight <= pageHeight - marginBottom) {
      return;
    }
    pdf.addPage();
    cursorY = 54;
  };

  const writeLine = (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => {
    const fontSize = options?.size ?? 11;
    const indent = options?.indent ?? 0;
    pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const wrapped = pdf.splitTextToSize(text, pageWidth - marginX * 2 - indent);
    const height = wrapped.length * (fontSize + 3);
    ensureSpace(height + 4);
    pdf.text(wrapped, marginX + indent, cursorY);
    cursorY += height + 4;
  };

  writeLine(`${input.account.clientName} Monthly Report`, { bold: true, size: 18 });
  writeLine(`Report type: ${formatAccountReportLabel(input.account)}`, { size: 11 });
  writeLine(`Reporting period: ${input.reportPayload.dateRange.currentLabel}`, { size: 11 });
  writeLine("", { size: 6 });

  writeLine("Summary", { bold: true, size: 14 });
  input.reportPayload.summaries.forEach((section) => {
    writeLine(section.title, { bold: true, size: 12 });
    section.metrics.forEach((metric) => {
      writeLine(formatSummaryMetric(metric), { indent: 14 });
    });
  });

  writeLine("", { size: 6 });
  writeLine("Campaign Breakdown", { bold: true, size: 14 });
  input.reportPayload.campaignGroups.forEach((group) => {
    renderCampaignGroup(pdf, group, writeLine);
  });

  writeLine("", { size: 6 });
  writeLine("Audience Click Breakdown", { bold: true, size: 14 });
  renderAudienceBreakdown(writeLine, input.reportPayload);

  if (input.reportPayload.warnings.length > 0) {
    writeLine("", { size: 6 });
    writeLine("Warnings", { bold: true, size: 14 });
    input.reportPayload.warnings.forEach((warning) => {
      writeLine(`- ${warning}`, { indent: 14 });
    });
  }

  const pdfBuffer = pdf.output("arraybuffer");
  return Buffer.from(pdfBuffer);
}

function renderCampaignGroup(
  pdf: jsPDF,
  group: CampaignGroup,
  writeLine: (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => void
) {
  writeLine(`${group.campaignType} (${group.platform})`, { bold: true, size: 12 });
  writeLine(
    `Totals: Spend ${formatCurrency(group.totals.spend)} | Impr. ${formatInteger(group.totals.impressions)} | Clicks ${formatInteger(group.totals.clicks)} | Results ${formatInteger(group.totals.results)}`,
    { indent: 14 }
  );

  group.rows.slice(0, 8).forEach((row) => {
    writeLine(
      `${row.campaignName}: Spend ${formatCurrency(row.spend)} | Impr. ${formatInteger(row.impressions)} | Clicks ${formatInteger(row.clicks)} | Results ${formatInteger(row.results)}`,
      { indent: 14 }
    );
  });
}

function renderAudienceBreakdown(
  writeLine: (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => void,
  reportPayload: OverallReportPayload
) {
  const ageRows = summarizeAudienceItemsForChart(reportPayload.audienceClickBreakdown.age, "age");
  const genderRows = summarizeAudienceItemsForChart(reportPayload.audienceClickBreakdown.gender, "gender");
  const countryRows = summarizeAudienceItemsForChart(
    reportPayload.audienceClickBreakdown.location.country,
    "country"
  );
  const regionRows = summarizeAudienceItemsForChart(
    reportPayload.audienceClickBreakdown.location.region,
    "region"
  );
  const cityRows = summarizeAudienceItemsForChart(reportPayload.audienceClickBreakdown.location.city, "city");

  writeAudienceBreakdownRows(writeLine, "Age", ageRows);
  writeAudienceBreakdownRows(writeLine, "Gender", genderRows);
  writeAudienceBreakdownRows(writeLine, "Country", countryRows);
  writeAudienceBreakdownRows(writeLine, "State / Region", regionRows);
  writeAudienceBreakdownRows(writeLine, "City", cityRows);
}

function writeAudienceBreakdownRows(
  writeLine: (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => void,
  heading: string,
  rows: Array<{ label: string; clicks: number }>
) {
  writeLine(heading, { bold: true, size: 12 });
  if (rows.length === 0) {
    writeLine("No audience click data available for this breakdown.", { indent: 14 });
    return;
  }

  rows.forEach((row) => {
    writeLine(`${row.label}: ${formatInteger(row.clicks)} clicks`, { indent: 14 });
  });
}

function resolvePreviousMonthRange(referenceDate: Date): {
  startDate: string;
  endDate: string;
  reportMonthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    reportMonthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatSummaryMetric(metric: SummaryMetric): string {
  return `${metric.label}: ${formatMetricValue(metric)}${formatMetricDelta(metric)}`;
}

function formatMetricValue(metric: SummaryMetric): string {
  const value = metric.value ?? 0;
  if (metric.format === "currency") {
    return formatCurrency(value);
  }
  if (metric.format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  return formatNumber(value);
}

function formatMetricDelta(metric: SummaryMetric): string {
  if (metric.delta === null) {
    return "";
  }
  const sign = metric.delta > 0 ? "+" : "";
  if (metric.format === "currency") {
    return ` (${sign}${formatCurrency(metric.delta)})`;
  }
  if (metric.format === "percent") {
    return ` (${sign}${metric.delta.toFixed(2)} pts)`;
  }
  return ` (${sign}${formatNumber(metric.delta)})`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}
