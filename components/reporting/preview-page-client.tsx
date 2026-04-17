"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { PreviewHierarchy } from "@/components/reporting/preview-hierarchy";
import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ReportShell } from "@/components/reporting/report-shell";
import { ReportErrorState, ReportLoadingState, ReportWarnings } from "@/components/reporting/report-state";
import { usePreviewReport } from "@/components/reporting/use-report-data";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { formatGoogleAdsAccessPathErrorMessage } from "@/lib/reporting/google-access-path";

export function PreviewPageClient() {
  const searchParams = useSearchParams();
  const { filters, hasAccountId, setFilters } = useReportFilters();
  const selectedCampaignName = searchParams.get("campaignName")?.trim() ?? "";
  const selectedPlatform = searchParams.get("platform");

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
  }, [filters.accountId, filters.endDate, filters.googleAccountId, filters.metaAccountId, filters.startDate]);

  const { data, error, loading } = usePreviewReport(queryString, hasAccountId);
  const metaFatalError = data?.metaFatalErrors?.[0] ?? null;
  const googleFatalError = data?.googleFatalErrors?.[0] ?? null;

  const title = `${data?.companyName ?? "Company Name"} Campaign Preview`;
  const dateLabel = data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  return (
    <ReportShell
      title={title}
      dateLabel={dateLabel}
      activeQuery={queryString}
      headerDateControl={
        <ReportHeaderMonthPicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={(next) => setFilters({ startDate: next.startDate, endDate: next.endDate })}
        />
      }
      headerBottomControl={
        <div className="space-y-2">
          <ReportDownloadButton />
          <ReportFiltersBar
            filters={filters}
            dateMode="month"
            showDateFilters={false}
            showResetButton={false}
            submitLabel="Load Preview"
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
          <ReportErrorState message="Enter at least one account ID to open the read-only campaign preview." />
        ) : null}

        {loading ? <ReportLoadingState message="Loading live Google Ads and Meta Ads hierarchy..." /> : null}

        {error ? <ReportErrorState message={error} /> : null}

        {data && metaFatalError ? (
          <ReportErrorState
            message={`Required Meta block failed: [${metaFatalError.label}] fields=${metaFatalError.fields.join(",")} code=${
              metaFatalError.errorCode ?? "n/a"
            } subcode=${metaFatalError.errorSubcode ?? "n/a"} message=${metaFatalError.message}`}
          />
        ) : null}

        {data && googleFatalError ? (
          <ReportErrorState
            message={
              googleFatalError.code === "google-account-resolution-failed"
                ? formatGoogleAdsAccessPathErrorMessage({
                    accountId: googleFatalError.customerId,
                    originalAccessPath: googleFatalError.originalAccessPath,
                    resolvedAccessPath: googleFatalError.resolvedAccessPath,
                    fallbackUsed: googleFatalError.fallbackUsed,
                    errorCode: googleFatalError.errorCode ?? "UNKNOWN",
                    errorMessage:
                      googleFatalError.errorMessage ??
                      googleFatalError.reason ??
                      googleFatalError.message,
                  })
                : `Required Google block failed: [${googleFatalError.label}] code=${
                    googleFatalError.errorCode ?? "n/a"
                  } message=${googleFatalError.message}`
            }
          />
        ) : null}

        {data && !metaFatalError && !googleFatalError ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            <PreviewHierarchy
              sections={data.sections}
              selectedCampaignName={selectedCampaignName}
              selectedPlatform={
                selectedPlatform === "meta" || selectedPlatform === "google"
                  ? selectedPlatform
                  : null
              }
            />
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
