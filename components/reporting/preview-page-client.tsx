"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PreviewHierarchy } from "@/components/reporting/preview-hierarchy";
import { ReportSuccessScreen } from "@/components/reporting/report-loading-screen";
import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
  ReportWarnings,
} from "@/components/reporting/report-state";
import { usePreviewReport } from "@/components/reporting/use-report-data";
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { formatGoogleAdsAccessPathErrorMessage } from "@/lib/reporting/google-access-path";
import { resolvePreviewEntry } from "@/lib/reporting/preview-selection";

export function PreviewPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, hasAccountId, setFilters } = useReportFilters();
  const selectedCampaignId = searchParams.get("campaignId")?.trim() || null;
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
  }, [
    filters.accountId,
    filters.endDate,
    filters.googleAccountId,
    filters.metaAccountId,
    filters.startDate,
  ]);

  const { data, error, loading, retry, successToken } = usePreviewReport(queryString, hasAccountId);
  const metaFatalError = data?.metaFatalErrors?.[0] ?? null;
  const googleFatalError = data?.googleFatalErrors?.[0] ?? null;
  const previewResolution = useMemo(
    () =>
      data
        ? resolvePreviewEntry(data.sections, {
            platform:
              selectedPlatform === "meta" || selectedPlatform === "google"
                ? selectedPlatform
                : null,
            campaignId: selectedCampaignId,
            campaignName: selectedCampaignName || null,
          })
        : null,
    [data, selectedCampaignId, selectedCampaignName, selectedPlatform]
  );

  const title = `${data?.companyName ?? "Company Name"} Campaign Preview`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;
  const previewReady =
    hasAccountId &&
    !loading &&
    !error &&
    Boolean(data) &&
    (data?.warnings.length ?? 0) === 0 &&
    !metaFatalError &&
    !googleFatalError &&
    previewResolution?.status === "ready" &&
    Boolean(previewResolution.section) &&
    Boolean(previewResolution.campaign);
  const { showReadyState } = useReportReadyTransition({
    ready: previewReady,
    transitionKey: successToken,
  });

  function handleCampaignChange(next: {
    platform: "meta" | "google";
    campaignId: string;
    campaignName: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const currentPlatform = params.get("platform");
    const currentCampaignId = params.get("campaignId");
    const currentCampaignName = params.get("campaignName");
    if (
      currentPlatform === next.platform &&
      currentCampaignId === next.campaignId &&
      currentCampaignName === next.campaignName
    ) {
      return;
    }
    params.set("platform", next.platform);
    params.set("campaignId", next.campaignId);
    params.set("campaignName", next.campaignName);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  if (hasAccountId && loading) {
    return (
      <ReportLoadingState
        kind="preview"
        message="Loading live Google Ads and Meta Ads hierarchy..."
        fullPage
        onRetry={retry}
      />
    );
  }

  if (showReadyState) {
    return <ReportSuccessScreen kind="preview" fullPage />;
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
          footerContent={<ReportDownloadButton fileNamePrefix={title} />}
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
            kind="preview"
            message="Enter at least one account ID to open the read-only campaign preview."
          />
        ) : null}

        {error ? <ReportErrorState kind="preview" message={error} onRetry={retry} /> : null}

        {data && metaFatalError ? (
          <ReportErrorState
            kind="preview"
            message={`Required Meta block failed: [${metaFatalError.label}] fields=${metaFatalError.fields.join(",")} code=${
              metaFatalError.errorCode ?? "n/a"
            } subcode=${metaFatalError.errorSubcode ?? "n/a"} message=${metaFatalError.message}`}
            onRetry={retry}
          />
        ) : null}

        {data && googleFatalError ? (
          <ReportErrorState
            kind="preview"
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
            onRetry={retry}
          />
        ) : null}

        {data && !metaFatalError && !googleFatalError ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            {previewResolution?.status === "invalid-campaign" ? (
              <ReportErrorState
                kind="preview"
                message={previewResolution.message ?? "The selected campaign is invalid."}
              />
            ) : null}
            {previewResolution?.status === "empty" ? (
              <ReportEmptyState
                title="No Preview Campaign"
                message={
                  previewResolution.message ??
                  "No active campaign is available for the current account and date range."
                }
              />
            ) : null}
            {previewResolution?.status === "ready" && previewResolution.section && previewResolution.campaign ? (
              <PreviewHierarchy
                key={`${previewResolution.section.platform}:${previewResolution.campaign.id}`}
                section={previewResolution.section}
                initialCampaignId={previewResolution.campaign.id}
                onCampaignChange={handleCampaignChange}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}
