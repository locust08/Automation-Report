"use client";

import { useMemo, useState } from "react";

import {
  InsightsDataTable,
  InsightsTable,
} from "@/components/reporting/insights-table";
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
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { useInsightsReport } from "@/components/reporting/use-report-data";
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import { PlatformInsightsSection } from "@/lib/reporting/types";

export function InsightsPageClient() {
  const { filters, hasAccountId, setFilters } = useReportFilters();
  const [activePlatform, setActivePlatform] =
    useState<PlatformInsightsSection["platform"]>("meta");

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

  const { data, error, loading, retry, successToken } = useInsightsReport(queryString, hasAccountId);
  const resolvedPlatform =
    data?.sections.find(
      (section) =>
        section.platform === activePlatform && section.rows.length > 0,
    )?.platform ??
    data?.sections.find((section) => section.rows.length > 0)?.platform ??
    activePlatform;
  const activeSection =
    data?.sections.find((section) => section.platform === resolvedPlatform) ??
    data?.sections[0] ??
    null;
  const title = `${data?.companyName ?? "Company Name"} Insights`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;
  const insightsReady =
    hasAccountId &&
    !loading &&
    !error &&
    Boolean(activeSection && activeSection.rows.length > 0) &&
    (data?.warnings.length ?? 0) === 0;
  const { showReadyState } = useReportReadyTransition({
    ready: insightsReady,
    transitionKey: successToken,
  });

  if (hasAccountId && loading) {
    return (
      <ReportLoadingState
        kind="dashboard"
        message="Building ranked Meta and Google insights from campaign output data..."
        fullPage
        onRetry={retry}
      />
    );
  }

  if (showReadyState) {
    return <ReportSuccessScreen kind="insights" fullPage />;
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
          <ReportErrorState
            kind="dashboard"
            message="Enter at least one Meta or Google account ID to generate insights from the selected month output data."
          />
        ) : null}

        {error ? <ReportErrorState kind="dashboard" message={error} onRetry={retry} /> : null}

        {data ? (
          <>
            <ReportWarnings warnings={data.warnings} />

            <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap gap-3">
                {data.sections.map((section) => (
                  <InsightsTable
                    key={section.platform}
                    section={section}
                    active={section.platform === resolvedPlatform}
                    onSelect={setActivePlatform}
                  />
                ))}
              </div>
            </section>

            {activeSection && activeSection.rows.length > 0 ? (
              <InsightsDataTable section={activeSection} />
            ) : (
              <ReportEmptyState
                title="No insights found"
                message="No ranked experiments could be created for the selected platform and month because there was not enough campaign output data."
              />
            )}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
