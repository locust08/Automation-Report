"use client";

import { useMemo } from "react";

import { AuctionInsightsTable } from "@/components/reporting/google-insights-table";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
  ReportWarnings,
} from "@/components/reporting/report-state";
import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { useAuctionInsightsReport } from "@/components/reporting/use-report-data";

export function AuctionPageClient() {
  const { filters, setFilters } = useReportFilters();
  const hasPotentialGoogleId = Boolean(
    filters.accountId || filters.googleAccountId,
  );

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
  }, [filters]);

  const { data, error, loading } = useAuctionInsightsReport(
    queryString,
    hasPotentialGoogleId,
  );
  const title = `${data?.companyName ?? "Company Name"} Auction Metrics`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  if (hasPotentialGoogleId && loading) {
    return (
      <ReportLoadingState
        message="Loading auction metrics from Google Ads Manager..."
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
        {!hasPotentialGoogleId ? (
          <ReportErrorState message="Enter Google account ID (or generic accountId) to load auction metrics from Google Ads Manager." />
        ) : null}

        {error ? <ReportErrorState message={error} /> : null}

        {data ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            {data.rows.length > 0 ? (
              <AuctionInsightsTable rows={data.rows} averages={data.averages} />
            ) : (
              <ReportEmptyState
                title="No auction rows found"
                message="No Google Ads auction insight data was returned for the selected account and month."
              />
            )}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
