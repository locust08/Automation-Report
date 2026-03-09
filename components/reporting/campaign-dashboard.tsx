"use client";

import { useMemo } from "react";

import { CampaignComparisonTable } from "@/components/reporting/campaign-table";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { MetricSection } from "@/components/reporting/metric-grid";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ScreenshotModeToggle } from "@/components/reporting/screenshot-mode-toggle";
import { ReportShell } from "@/components/reporting/report-shell";
import { ReportErrorState, ReportLoadingState, ReportWarnings } from "@/components/reporting/report-state";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { useCampaignComparison } from "@/components/reporting/use-report-data";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";
import { computeDelta } from "@/lib/reporting/metrics";
import { CampaignRow, Platform, SummarySection } from "@/lib/reporting/types";

export function CampaignDashboard({ campaignType }: { campaignType: string }) {
  const { filters, hasAccountId, setFilters } = useReportFilters();
  const { screenshotMode } = useScreenshotMode();

  const campaignName = useMemo(() => decodeURIComponent(campaignType), [campaignType]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.accountId) {
      params.set("accountId", filters.accountId);
    }
    if (filters.metaAccountId) {
      params.set("metaAccountId", filters.metaAccountId);
    }
    if (filters.googleAccountId) {
      params.set("googleAccountId", filters.googleAccountId);
    }
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    params.set("platform", filters.platform);
    return params.toString();
  }, [filters]);

  const { data, error, loading } = useCampaignComparison(
    queryString,
    campaignName,
    filters.platform,
    hasAccountId
  );

  const section = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildSectionFromComparison(data.platform, data.selectedTotals, data.previousTotals);
  }, [data]);
  const hasSelectedSpend = useMemo(
    () => (data?.selectedMonthRows.some((row) => row.spend > 0) ?? false),
    [data]
  );
  const hasPreviousSpend = useMemo(
    () => (data?.previousMonthRows.some((row) => row.spend > 0) ?? false),
    [data]
  );
  const hasComparisonSpend = hasSelectedSpend || hasPreviousSpend;

  const accountFallbackCompanyName = filters.accountId || filters.metaAccountId || filters.googleAccountId
    ? `Account ${filters.metaAccountId || filters.googleAccountId || filters.accountId}`
    : "Company Name";
  const companyNameForTitle = data?.companyName ?? (hasAccountId ? "Company Name" : accountFallbackCompanyName);
  const title = `${companyNameForTitle} ${platformLabel(filters.platform)} (${campaignName})`;
  const dateLabel = data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  return (
    <ReportShell
      title={title}
      dateLabel={dateLabel}
      headerDateControl={
        <ReportHeaderMonthPicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={(next) => setFilters({ startDate: next.startDate, endDate: next.endDate })}
        />
      }
      headerBottomControl={
        <div className="space-y-2">
          <ScreenshotModeToggle />
          <ReportFiltersBar
            filters={filters}
            includePlatform
            dateMode="month"
            showDateFilters={false}
            showResetButton={false}
            submitLabel="Reload"
            compact
            onApply={(next) => setFilters(next)}
            onReset={() =>
              setFilters({
                accountId: "",
                metaAccountId: "",
                googleAccountId: "",
              })
            }
          />
        </div>
      }
    >
      <div className="space-y-5">
        {!hasAccountId ? (
          <ReportErrorState message="Enter at least one account ID to request platform data for this campaign type." />
        ) : null}

        {loading ? <ReportLoadingState message="Loading campaign type comparison data..." /> : null}
        {error ? <ReportErrorState message={error} /> : null}

        {data && section ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            <MetricSection section={section} />
            {hasComparisonSpend ? (
              <section className="space-y-4 rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
                <CampaignComparisonTable
                  key={`selected-${filters.platform}-${filters.startDate}-${filters.endDate}-${campaignName}`}
                  heading={`${campaignName} (${data.dateRange.currentLabel})`}
                  rows={data.selectedMonthRows}
                  totals={data.selectedTotals}
                  showAllRows={screenshotMode}
                />
                <CampaignComparisonTable
                  key={`previous-${filters.platform}-${filters.startDate}-${filters.endDate}-${campaignName}`}
                  heading={`${campaignName} (${data.dateRange.previousLabel})`}
                  rows={data.previousMonthRows}
                  totals={data.previousTotals}
                  showAllRows={screenshotMode}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function buildSectionFromComparison(
  platform: Platform,
  selected: CampaignRow,
  previous: CampaignRow
): SummarySection {
  if (platform === "meta") {
    return {
      platform,
      title: "Meta",
      logoPath: "/MetaLogo.png",
      metrics: [
        metric("results", "Results", selected.results, previous.results, "number"),
        metric("costPerResults", "Cost/Results", selected.costPerResult, previous.costPerResult, "currency"),
        metric("clicks", "Clicks", selected.clicks, previous.clicks, "number"),
        metric("ctr", "CTR (%)", selected.ctr, previous.ctr, "percent"),
        metric("cpm", "CPM (RM)", selected.cpm, previous.cpm, "currency"),
        metric("impressions", "Impression", selected.impressions, previous.impressions, "number"),
        metric("spend", "Ads Spent", selected.spend, previous.spend, "currency"),
      ],
    };
  }

  if (platform === "googleYoutube") {
    return {
      platform,
      title: "Google Ads YouTube Overview",
      logoPath: "/GoogleLogo.png",
      metrics: [
        metric(
          "youtubeEarnedShares",
          "Youtube Earned Shares",
          selected.youtubeEarnedShares,
          previous.youtubeEarnedShares,
          "number"
        ),
        metric("costPerConv", "Cost/Conv. (RM)", selected.costPerResult, previous.costPerResult, "currency"),
        metric("clicks", "Clicks", selected.clicks, previous.clicks, "number"),
        metric("avgCpc", "Av. CPC (RM)", selected.avgCpc, previous.avgCpc, "currency"),
        metric(
          "youtubeEarnedLikes",
          "Youtube Earned Likes",
          selected.youtubeEarnedLikes,
          previous.youtubeEarnedLikes,
          "number"
        ),
        metric("impressions", "Impression", selected.impressions, previous.impressions, "number"),
        metric("spend", "Ads Spent (RM)", selected.spend, previous.spend, "currency"),
      ],
    };
  }

  return {
    platform,
    title: "Google Ads",
    logoPath: "/GoogleLogo.png",
    metrics: [
      metric("conversions", "Conversions", selected.conversions, previous.conversions, "number"),
      metric("costPerConv", "Cost/Conv. (RM)", selected.costPerResult, previous.costPerResult, "currency"),
      metric("clicks", "Clicks", selected.clicks, previous.clicks, "number"),
      metric("avgCpc", "Avg. CPC (RM)", selected.avgCpc, previous.avgCpc, "currency"),
      metric("ctr", "CTR", selected.ctr, previous.ctr, "percent"),
      metric("impressions", "Impression", selected.impressions, previous.impressions, "number"),
      metric("spend", "Ads Spent (RM)", selected.spend, previous.spend, "currency"),
    ],
  };
}

function metric(
  key: string,
  label: string,
  selected: number,
  previous: number,
  format: "number" | "currency" | "percent"
) {
  return {
    key,
    label,
    value: selected,
    delta: computeDelta(selected, previous),
    format,
  };
}

function platformLabel(platform: Platform): string {
  if (platform === "meta") {
    return "Meta Monthly Performance";
  }
  if (platform === "googleYoutube") {
    return "Google Monthly Performance (YouTube)";
  }
  return "Google Monthly Performance";
}
