import { createEmptyAudienceClickBreakdownResponse } from "@/lib/reporting/audience-breakdown";
import { buildDateRange } from "@/lib/reporting/date";
import { buildGroups, computeDelta, emptyCampaignRow, mergeCampaignRows } from "@/lib/reporting/metrics";
import type {
  CampaignComparisonPayload,
  CampaignRow,
  OverallReportPayload,
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewPerformanceSummary,
  PreviewReportPayload,
  SummaryMetric,
} from "@/lib/reporting/types";
import type {
  OverallAudienceBreakdownStagePayload,
  OverallCampaignPerformanceStagePayload,
  OverallInput,
  OverallSummaryStagePayload,
} from "@/lib/reporting/service";
import { queryMetaImportedRows } from "@/lib/meta-import/repository";
import type { MetaImportedRow } from "@/lib/meta-import/types";

export async function getImportedOverallReport(input: OverallInput): Promise<OverallReportPayload> {
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const accountIds = resolveMetaAccountIds(input);
  const [currentImported, previousImported] = await Promise.all([
    queryMetaImportedRows({ accountIds, startDate: dateRange.startDate, endDate: dateRange.endDate }),
    queryMetaImportedRows({ accountIds, startDate: dateRange.previousStartDate, endDate: dateRange.previousEndDate }),
  ]);
  const currentRows = importedRowsToCampaignRows(currentImported);
  const previousRows = importedRowsToCampaignRows(previousImported);
  const warnings = buildImportedWarnings(currentImported, previousImported, accountIds);
  return {
    companyName: currentImported.find((row) => row.accountName)?.accountName ?? `Account ${accountIds[0] ?? ""}`,
    dateRange,
    accountIds: {
      metaAccountId: accountIds[0] ?? null,
      googleAccountId: null,
      metaAccountIds: accountIds,
      googleAccountIds: [],
    },
    summaries: [
      {
        platform: "meta",
        title: "Meta",
        logoPath: "/MetaLogo.png",
        metrics: buildMetaSummary(currentRows, previousRows),
      },
    ],
    campaignGroups: buildGroups(currentRows),
    audienceClickBreakdown: createEmptyAudienceClickBreakdownResponse(),
    warnings,
    dataSource: "meta_csv",
  };
}

export async function getImportedOverallSummaryStage(input: OverallInput): Promise<OverallSummaryStagePayload> {
  const report = await getImportedOverallReport(input);
  return pickSummary(report);
}

export async function getImportedOverallCampaignStage(input: OverallInput): Promise<OverallCampaignPerformanceStagePayload> {
  const report = await getImportedOverallReport(input);
  return {
    companyName: report.companyName,
    dateRange: report.dateRange,
    accountIds: report.accountIds,
    campaignGroups: report.campaignGroups,
    warnings: report.warnings,
  };
}

export async function getImportedOverallAudienceStage(input: OverallInput): Promise<OverallAudienceBreakdownStagePayload> {
  const report = await getImportedOverallReport(input);
  return {
    companyName: report.companyName,
    dateRange: report.dateRange,
    accountIds: report.accountIds,
    audienceClickBreakdown: report.audienceClickBreakdown,
    warnings: [
      ...report.warnings,
      "Audience breakdowns are unavailable unless the CSV contains a supported audience-breakdown export.",
    ],
  };
}

export async function getImportedCampaignComparison(input: OverallInput & {
  campaignType: string;
  platform: "meta" | "google" | "googleYoutube";
}): Promise<CampaignComparisonPayload> {
  const report = await getImportedOverallReport(input);
  const accountIds = resolveMetaAccountIds(input);
  const previousImported = await queryMetaImportedRows({
    accountIds,
    startDate: report.dateRange.previousStartDate,
    endDate: report.dateRange.previousEndDate,
  });
  const selectedMonthRows = report.campaignGroups
    .flatMap((group) => group.rows)
    .filter((row) => row.campaignType.toLocaleLowerCase("en") === input.campaignType.toLocaleLowerCase("en"));
  const previousMonthRows = importedRowsToCampaignRows(previousImported).filter(
    (row) => row.campaignType.toLocaleLowerCase("en") === input.campaignType.toLocaleLowerCase("en")
  );
  return {
    companyName: report.companyName,
    platform: "meta",
    campaignType: input.campaignType,
    dateRange: report.dateRange,
    selectedMonthRows,
    previousMonthRows,
    selectedTotals: aggregateCampaignRows(selectedMonthRows, "selected", input.campaignType),
    previousTotals: aggregateCampaignRows(previousMonthRows, "previous", input.campaignType),
    warnings: report.warnings,
  };
}

export async function getImportedPreviewReport(input: OverallInput): Promise<PreviewReportPayload> {
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const accountIds = resolveMetaAccountIds(input);
  const imported = await queryMetaImportedRows({ accountIds, startDate: dateRange.startDate, endDate: dateRange.endDate });
  const campaigns = buildPreviewHierarchy(imported);
  return {
    companyName: imported.find((row) => row.accountName)?.accountName ?? `Account ${accountIds[0] ?? ""}`,
    dateRange,
    accountIds: {
      metaAccountId: accountIds[0] ?? null,
      googleAccountId: null,
      metaAccountIds: accountIds,
      googleAccountIds: [],
    },
    sections: [
      {
        platform: "meta",
        title: "Meta Ads Imported CSV Preview",
        logoPath: "/MetaLogo.png",
        accountId: accountIds[0] ?? null,
        accountName: imported.find((row) => row.accountName)?.accountName ?? null,
        fetchedAt: new Date().toISOString(),
        childLabel: "Ad Set",
        campaigns,
      },
    ],
    warnings: imported.length === 0 ? ["No imported Meta CSV rows cover the selected date range."] : [],
    dataSource: "meta_csv",
  };
}

export function importedRowsToCampaignRows(rows: MetaImportedRow[]): CampaignRow[] {
  const byCampaign = new Map<string, MetaImportedRow[]>();
  for (const row of rows) {
    const key = row.campaignId ?? row.campaignName ?? row.uniqueKey;
    const items = byCampaign.get(key) ?? [];
    items.push(row);
    byCampaign.set(key, items);
  }
  return Array.from(byCampaign.entries()).map(([campaignKey, items]) => {
    const levelRank = Math.max(...items.map((item) => rankLevel(item.reportingLevel)));
    const selected = items.filter((item) => rankLevel(item.reportingLevel) === levelRank);
    const first = selected[0];
    const row = emptyCampaignRow(
      first.campaignId ?? campaignKey,
      "meta",
      normalizeCampaignType(first.objective),
      first.campaignName ?? `Campaign ${first.campaignId ?? campaignKey}`
    );
    for (const item of selected) {
      row.impressions += item.impressions;
      row.clicks += item.clicks;
      row.spend += item.amountSpent;
      row.results += item.results;
      row.conversions += item.results;
    }
    row.ctr = row.impressions > 0 ? (row.clicks * 100) / row.impressions : 0;
    row.cpm = row.impressions > 0 ? (row.spend * 1000) / row.impressions : 0;
    row.avgCpc = row.clicks > 0 ? row.spend / row.clicks : 0;
    row.costPerResult = row.results > 0 ? row.spend / row.results : 0;
    return row;
  });
}

function buildPreviewHierarchy(rows: MetaImportedRow[]): PreviewCampaignNode[] {
  const campaigns = new Map<string, MetaImportedRow[]>();
  for (const row of rows) {
    const key = row.campaignId ?? row.campaignName ?? row.uniqueKey;
    const items = campaigns.get(key) ?? [];
    items.push(row);
    campaigns.set(key, items);
  }
  return Array.from(campaigns.entries()).map(([campaignKey, campaignRows]) => {
    const first = campaignRows[0];
    const adSetGroups = new Map<string, MetaImportedRow[]>();
    for (const row of campaignRows) {
      const key = row.adSetId ?? row.adSetName ?? `${campaignKey}:campaign-level`;
      const items = adSetGroups.get(key) ?? [];
      items.push(row);
      adSetGroups.set(key, items);
    }
    const children: PreviewAdGroupNode[] = Array.from(adSetGroups.entries()).map(([adSetKey, adSetRows]) => ({
      id: adSetRows[0].adSetId ?? adSetKey,
      name: adSetRows[0].adSetName ?? "Campaign-level imported data",
      status: adSetRows[0].delivery ?? adSetRows[0].status ?? "Imported",
      details: compactDetails([
        ["Ad Set ID", adSetRows[0].adSetId],
        ["Budget", adSetRows[0].budget?.toString() ?? null],
        ["Budget type", adSetRows[0].budgetType],
      ]),
      performance: performance(adSetRows),
      ads: buildPreviewAds(adSetRows, adSetKey),
    }));
    return {
      id: first.campaignId ?? campaignKey,
      name: first.campaignName ?? `Campaign ${campaignKey}`,
      status: first.delivery ?? first.status ?? "Imported",
      type: normalizeCampaignType(first.objective),
      objective: first.objective,
      details: compactDetails([
        ["Campaign ID", first.campaignId],
        ["Buying type", first.buyingType],
        ["Source", "Meta CSV import"],
      ]),
      performance: performance(campaignRows),
      children,
    };
  });
}

function buildPreviewAds(rows: MetaImportedRow[], adSetKey: string): PreviewAdNode[] {
  const groups = new Map<string, MetaImportedRow[]>();
  for (const row of rows) {
    const key = row.adId ?? row.adName ?? `${adSetKey}:aggregate`;
    const items = groups.get(key) ?? [];
    items.push(row);
    groups.set(key, items);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    id: items[0].adId ?? key,
    name: items[0].adName ?? "Imported aggregate",
    status: items[0].delivery ?? items[0].status ?? "Imported",
    details: compactDetails([
      ["Ad ID", items[0].adId],
      ["Result type", items[0].resultType],
      ["Reporting period", `${items[0].reportingStart} to ${items[0].reportingEnd}`],
    ]),
    performance: performance(items),
  }));
}

function performance(rows: MetaImportedRow[]): PreviewPerformanceSummary {
  const totals = rows.reduce(
    (acc, row) => ({
      results: acc.results + row.results,
      spend: acc.spend + row.amountSpent,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      landingPageViews: acc.landingPageViews + row.landingPageViews,
      linkClicks: acc.linkClicks + row.linkClicks,
    }),
    { results: 0, spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, linkClicks: 0 }
  );
  return {
    resultLabel: rows.find((row) => row.resultType)?.resultType ?? "Results",
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks * 100) / totals.impressions : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpm: totals.impressions > 0 ? (totals.spend * 1000) / totals.impressions : null,
    costPerResult: totals.results > 0 ? totals.spend / totals.results : null,
  };
}

function buildMetaSummary(currentRows: CampaignRow[], previousRows: CampaignRow[]): SummaryMetric[] {
  const current = aggregateCampaignRows(currentRows, "current", "Summary");
  const previous = aggregateCampaignRows(previousRows, "previous", "Summary");
  return [
    metric("results", "Results", current.results, previous.results, "number"),
    metric("costPerResult", "Cost/Results", current.costPerResult, previous.costPerResult, "currency"),
    metric("clicks", "Clicks", current.clicks, previous.clicks, "number"),
    metric("ctr", "CTR (%)", current.ctr, previous.ctr, "percent"),
    metric("cpm", "CPM", current.cpm, previous.cpm, "currency"),
    metric("impressions", "Impression", current.impressions, previous.impressions, "number"),
    metric("spend", "Ads Spent", current.spend, previous.spend, "currency"),
  ];
}

function aggregateCampaignRows(rows: CampaignRow[], id: string, campaignType: string): CampaignRow {
  return rows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow(id, "meta", campaignType, "Grand Total")
  );
}

function metric(
  key: string,
  label: string,
  current: number,
  previous: number,
  format: SummaryMetric["format"]
): SummaryMetric {
  return { key, label, value: current, previousValue: previous, delta: computeDelta(current, previous), format };
}

function pickSummary(report: OverallReportPayload): OverallSummaryStagePayload {
  return {
    companyName: report.companyName,
    dateRange: report.dateRange,
    accountIds: report.accountIds,
    summaries: report.summaries,
    warnings: report.warnings,
  };
}

function buildImportedWarnings(current: MetaImportedRow[], previous: MetaImportedRow[], accountIds: string[]): string[] {
  const warnings = ["This report uses imported Meta CSV data rather than the Meta Marketing API."];
  if (accountIds.length === 0) warnings.push("No Meta account ID was selected.");
  if (current.length === 0) warnings.push("No imported Meta CSV rows cover the selected date range.");
  if (previous.length === 0) warnings.push("No imported CSV rows cover the comparison period, so deltas may be unavailable.");
  return warnings;
}

function resolveMetaAccountIds(input: OverallInput): string[] {
  return (input.metaAccountId || input.accountId || "")
    .split(/[\s,;|]+/)
    .map((value) => value.replace(/^act_/i, "").replace(/\D/g, ""))
    .filter(Boolean);
}

function normalizeCampaignType(objective: string | null): string {
  const value = objective?.replace(/^OUTCOME_/, "").replace(/^OBJECTIVE_/, "") || "Imported campaigns";
  return value
    .toLocaleLowerCase("en")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en"));
}

function rankLevel(level: MetaImportedRow["reportingLevel"]): number {
  return level === "ad" ? 3 : level === "adset" ? 2 : 1;
}

function compactDetails(values: Array<[string, string | null]>): Array<{ label: string; value: string }> {
  return values.filter((value): value is [string, string] => Boolean(value[1])).map(([label, value]) => ({ label, value }));
}
