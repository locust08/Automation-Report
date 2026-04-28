"use client";

import { useMemo } from "react";

import { TopKeywordTable } from "@/components/reporting/google-insights-table";
import { ReportSuccessScreen } from "@/components/reporting/report-loading-screen";
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
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import { useTopKeywordsReport } from "@/components/reporting/use-report-data";

export function TopKeywordsPageClient() {
  const { filters, setFilters } = useReportFilters();
  const { screenshotMode } = useScreenshotMode();
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

  const { data, error, loading, retry, successToken } = useTopKeywordsReport(
    queryString,
    hasPotentialGoogleId,
  );
  const title = `${data?.companyName ?? "Company Name"} Top 10 Keyword Table`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;
  const keywordsReady =
    hasPotentialGoogleId &&
    !loading &&
    !error &&
    Boolean(data && data.rows.length > 0) &&
    (data?.warnings.length ?? 0) === 0;
  const { showReadyState } = useReportReadyTransition({
    ready: keywordsReady,
    transitionKey: successToken,
  });

  if (hasPotentialGoogleId && loading) {
    return (
      <ReportLoadingState
        kind="keywords"
        message="Loading top keyword metrics from Google Ads Manager..."
        fullPage
        onRetry={retry}
      />
    );
  }

  if (showReadyState) {
    return <ReportSuccessScreen kind="keywords" fullPage />;
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
          <ReportErrorState
            kind="keywords"
            message="Enter Google account ID (or generic accountId) to load top keyword metrics from Google Ads Manager."
          />
        ) : null}

        {error ? <ReportErrorState kind="keywords" message={error} onRetry={retry} /> : null}

        {data ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            {data.rows.length > 0 ? (
              <TopKeywordTable
                rows={data.rows}
                totals={data.totals}
                screenshotMode={screenshotMode}
              />
            ) : (
              <ReportEmptyState
                title="No keyword rows found"
                message="No Google Ads keyword data was returned for the selected account and month."
              />
            )}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
