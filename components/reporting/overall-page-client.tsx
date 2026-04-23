"use client";

import { useMemo } from "react";

import { OverallCampaignGroupsTable } from "@/components/reporting/campaign-table";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { MetricSection } from "@/components/reporting/metric-grid";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  ReportErrorState,
  ReportLoadingState,
  ReportWarnings,
} from "@/components/reporting/report-state";
import {
  ReportFilters,
  useReportFilters,
} from "@/components/reporting/use-report-filters";
import { useOverallReport } from "@/components/reporting/use-report-data";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";

export function OverallPageClient({
  initialFilters,
}: {
  initialFilters?: Partial<ReportFilters>;
}) {
  const { filters, hasAccountId, setFilters } =
    useReportFilters(initialFilters);
  const { screenshotMode } = useScreenshotMode();

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
    return params.toString();
  }, [
    filters.accountId,
    filters.endDate,
    filters.googleAccountId,
    filters.metaAccountId,
    filters.startDate,
  ]);

  const { data, error, loading } = useOverallReport(queryString, hasAccountId);

  const forwardQuery = useMemo(() => {
    const params = new URLSearchParams(queryString);
    if (screenshotMode) {
      params.set("screenshot", "1");
    }
    return params.toString() ? `&${params.toString()}` : "";
  }, [queryString, screenshotMode]);

  const title = `${data?.companyName ?? "Company Name"} Monthly Performance`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  if (hasAccountId && loading) {
    return (
      <ReportLoadingState
        message="Loading overview data from Meta and Google APIs..."
        fullPage
      />
    );
  }

  return (
    <ReportShell
      title={title}
      dateLabel={dateLabel}
      activeQuery={queryString}
      headerDateControl={
        <ReportHeaderMonthPicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={(next) =>
            setFilters({ startDate: next.startDate, endDate: next.endDate })
          }
        />
      }
      headerBottomControl={
        <ReportFiltersBar
          filters={filters}
          dateMode="month"
          showDateFilters={false}
          showResetButton={false}
          submitLabel="Reload"
          compact
          footerContent={<ReportDownloadButton />}
          onApply={(next) => setFilters(next)}
          onReset={() =>
            setFilters({
              accountId: "",
              metaAccountId: "",
              googleAccountId: "",
            })
          }
        />
      }
    >
      <div className="space-y-5">
        {!hasAccountId ? (
          <ReportErrorState message="Enter at least one account ID to request data from Meta Ads Manager and Google Ads Manager." />
        ) : null}

        {error ? <ReportErrorState message={error} /> : null}

        {data ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            {data.summaries.map((section) => (
              <MetricSection key={section.platform} section={section} />
            ))}
            <OverallCampaignGroupsTable
              groups={data.campaignGroups}
              queryString={forwardQuery}
            />
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
