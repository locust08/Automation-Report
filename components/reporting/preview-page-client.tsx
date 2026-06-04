"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccountStructureFlowchart } from "@/components/reporting/account-structure-flowchart";
import { PreviewHierarchy } from "@/components/reporting/preview-hierarchy";
import { ReportSuccessScreen } from "@/components/reporting/report-loading-screen";
import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportFiltersBar } from "@/components/reporting/report-filters-bar";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  ReportEmptyState,
  ReportErrorState,
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
  const selectedPlatform = searchParams.get("platform");
  const hasExplicitDateRange =
    Boolean(searchParams.get("startDate")?.trim()) ||
    Boolean(searchParams.get("endDate")?.trim());
  const selectedCampaignId = hasExplicitDateRange
    ? searchParams.get("campaignId")?.trim() || null
    : null;
  const selectedCampaignName = hasExplicitDateRange
    ? searchParams.get("campaignName")?.trim() ?? ""
    : "";
  const googlePreviewDefaultDates = useMemo(() => {
    const today = toLocalIsoDate(new Date());
    return { startDate: today, endDate: today };
  }, []);
  const shouldUseGooglePreviewDefaultDate =
    selectedPlatform === "google" ||
    Boolean(searchParams.get("googleAccountId")?.trim());
  const { filters, hasAccountId, setFilters } = useReportFilters(
    shouldUseGooglePreviewDefaultDate ? googlePreviewDefaultDates : undefined
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
    const currentStartDate = params.get("startDate");
    const currentEndDate = params.get("endDate");
    if (
      currentPlatform === next.platform &&
      currentCampaignId === next.campaignId &&
      currentCampaignName === next.campaignName &&
      currentStartDate === filters.startDate &&
      currentEndDate === filters.endDate
    ) {
      return;
    }
    params.set("platform", next.platform);
    params.set("campaignId", next.campaignId);
    params.set("campaignName", next.campaignName);
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  if (showReadyState) {
    return <ReportSuccessScreen kind="preview" fullPage />;
  }

  const flowchartPlatform =
    selectedPlatform === "meta" || selectedPlatform === "google" ? selectedPlatform : null;
  const flowchartError = error ? `Unable to load live account hierarchy. ${error}` : null;

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

        {hasAccountId && (loading || error) ? (
          <AccountStructureFlowchart
            sections={data?.sections ?? []}
            requestedPlatform={flowchartPlatform}
            loading={loading}
            error={flowchartError}
            accountIds={{
              metaAccountId:
                data?.accountIds.metaAccountId ??
                (filters.metaAccountId || filters.accountId || null),
              googleAccountId:
                data?.accountIds.googleAccountId ??
                (filters.googleAccountId || filters.accountId || null),
            }}
            onRetry={retry}
          />
        ) : null}

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
                companyName={data.companyName}
                structureFlowchart={
                  <AccountStructureFlowchart
                    sections={data.sections}
                    requestedPlatform={previewResolution.section.platform}
                    loading={false}
                    error={null}
                    accountIds={{
                      metaAccountId: data.accountIds.metaAccountId,
                      googleAccountId: data.accountIds.googleAccountId,
                    }}
                    onRetry={retry}
                  />
                }
                onCampaignChange={handleCampaignChange}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
