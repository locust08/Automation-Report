"use client";

import { useMemo, useState } from "react";
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
  ReportLoadingState,
  ReportWarnings,
} from "@/components/reporting/report-state";
import { useReportSectionQuery } from "@/components/reporting/use-report-data";
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { formatGoogleAdsAccessPathErrorMessage } from "@/lib/reporting/google-access-path";
import {
  getFirstPreviewAd,
  getFirstPreviewChild,
} from "@/lib/reporting/preview-stages";
import { resolvePreviewEntry } from "@/lib/reporting/preview-selection";
import type { PreviewReportPayload } from "@/lib/reporting/types";

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
    if (filters.source === "meta_csv") {
      params.set("source", "meta_csv");
    }
    return params.toString();
  }, [
    filters.accountId,
    filters.endDate,
    filters.googleAccountId,
    filters.metaAccountId,
    filters.startDate,
    filters.source,
  ]);

  const accountKey = filters.metaAccountId || filters.googleAccountId || filters.accountId || "-";
  const campaignsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/accounts/${encodeURIComponent(accountKey)}/campaigns`,
    queryString,
    hasAccountId,
    "Unable to load active campaigns."
  );
  const structureQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/accounts/${encodeURIComponent(accountKey)}/structure`,
    queryString,
    hasAccountId,
    "Unable to load account structure."
  );
  const campaignResolution = useMemo(
    () =>
      campaignsQuery.data
        ? resolvePreviewEntry(campaignsQuery.data.sections, {
            platform:
              selectedPlatform === "meta" || selectedPlatform === "google"
                ? selectedPlatform
                : null,
            campaignId: selectedCampaignId,
            campaignName: selectedCampaignName || null,
          })
        : null,
    [campaignsQuery.data, selectedCampaignId, selectedCampaignName, selectedPlatform]
  );
  const selectedCampaign = campaignResolution?.campaign ?? null;
  const selectedStagePlatform = campaignResolution?.section?.platform ?? null;
  const adGroupsQueryString = useMemo(
    () =>
      buildPreviewStageQuery(queryString, {
        platform: selectedStagePlatform,
      }),
    [queryString, selectedStagePlatform]
  );
  const adGroupsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/campaigns/${encodeURIComponent(selectedCampaign?.id ?? "-")}/ad-groups`,
    adGroupsQueryString,
    hasAccountId && Boolean(selectedCampaign),
    "Unable to load ad groups or ad sets."
  );
  const selectedChild = useMemo(
    () => (adGroupsQuery.data ? getFirstPreviewChild(adGroupsQuery.data) : null),
    [adGroupsQuery.data]
  );
  const adsQueryString = useMemo(
    () =>
      buildPreviewStageQuery(queryString, {
        platform: selectedStagePlatform,
        campaignId: selectedCampaign?.id ?? null,
      }),
    [queryString, selectedCampaign?.id, selectedStagePlatform]
  );
  const adsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ad-groups/${encodeURIComponent(selectedChild?.id ?? "-")}/ads`,
    adsQueryString,
    hasAccountId && Boolean(selectedChild),
    "Unable to load ads."
  );
  const selectedAd = useMemo(
    () => (adsQuery.data ? getFirstPreviewAd(adsQuery.data) : null),
    [adsQuery.data]
  );
  const previewQueryString = useMemo(
    () =>
      buildPreviewStageQuery(queryString, {
        platform: selectedStagePlatform,
        campaignId: selectedCampaign?.id ?? null,
        adGroupId: selectedChild?.id ?? null,
      }),
    [queryString, selectedCampaign?.id, selectedChild?.id, selectedStagePlatform]
  );
  const previewQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ads/${encodeURIComponent(selectedAd?.id ?? "-")}/preview`,
    previewQueryString,
    hasAccountId && Boolean(selectedAd),
    "Unable to load preview details."
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const assetsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ads/${encodeURIComponent(selectedAd?.id ?? "-")}/assets`,
    previewQueryString,
    hasAccountId && Boolean(selectedAd) && previewVisible && Boolean(previewQuery.data),
    "Unable to load creative assets."
  );
  const data =
    assetsQuery.data ??
    previewQuery.data ??
    adsQuery.data ??
    adGroupsQuery.data ??
    campaignsQuery.data;
  const displayData = useMemo(
    () =>
      data && campaignsQuery.data
        ? mergePreviewCampaignOptions(data, campaignsQuery.data)
        : data,
    [campaignsQuery.data, data]
  );
  const error =
    campaignsQuery.error ??
    adGroupsQuery.error ??
    adsQuery.error ??
    previewQuery.error ??
    assetsQuery.error;
  const loading =
    campaignsQuery.loading ||
    adGroupsQuery.loading ||
    adsQuery.loading ||
    previewQuery.loading ||
    assetsQuery.loading;
  const retry =
    assetsQuery.error ? assetsQuery.retry :
    previewQuery.error ? previewQuery.retry :
    adsQuery.error ? adsQuery.retry :
    adGroupsQuery.error ? adGroupsQuery.retry :
    campaignsQuery.retry;
  const successToken = assetsQuery.successToken ?? previewQuery.successToken;
  const metaFatalError = data?.metaFatalErrors?.[0] ?? null;
  const googleFatalError = data?.googleFatalErrors?.[0] ?? null;
  const previewResolution = useMemo(
    () =>
      displayData
        ? resolvePreviewEntry(displayData.sections, {
            platform:
              selectedPlatform === "meta" || selectedPlatform === "google"
                ? selectedPlatform
                : null,
            campaignId: selectedCampaignId,
            campaignName: selectedCampaignName || null,
          })
        : null,
    [displayData, selectedCampaignId, selectedCampaignName, selectedPlatform]
  );

  const title = `${displayData?.companyName ?? "Company Name"} Campaign Preview`;
  const dateLabel =
    displayData?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;
  const previewReady =
    hasAccountId &&
    !loading &&
    !error &&
    Boolean(assetsQuery.data ?? previewQuery.data) &&
    (displayData?.warnings.length ?? 0) === 0 &&
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

  const flowchartPlatform =
    selectedPlatform === "meta" || selectedPlatform === "google" ? selectedPlatform : null;
  const structureFlowchartPlatform = previewResolution?.section?.platform ?? flowchartPlatform;
  const flowchartError = structureQuery.error
    ? `Unable to load live account hierarchy. ${structureQuery.error}`
    : null;
  const structureFlowchart = hasAccountId ? (
    <AccountStructureFlowchart
      sections={structureQuery.data?.sections ?? []}
      requestedPlatform={structureFlowchartPlatform}
      loading={structureQuery.loading}
      error={flowchartError}
      accountIds={{
        metaAccountId:
          structureQuery.data?.accountIds.metaAccountId ??
          (filters.metaAccountId || filters.accountId || null),
        googleAccountId:
          structureQuery.data?.accountIds.googleAccountId ??
          (filters.googleAccountId || filters.accountId || null),
      }}
      onRetry={structureQuery.retry}
    />
  ) : null;
  const previewMarkerRef = usePreviewVisibilityMarker(setPreviewVisible);

  if (showReadyState) {
    return <ReportSuccessScreen kind="preview" fullPage />;
  }

  if (hasAccountId && campaignsQuery.loading && !campaignsQuery.data) {
    return (
      <ReportLoadingState
        kind="preview"
        message="Loading active campaigns..."
        fullPage
        onRetry={campaignsQuery.retry}
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

        {campaignsQuery.loading ? (
          <ReportLoadingState kind="preview" message="Loading active campaigns..." onRetry={campaignsQuery.retry} />
        ) : null}
        {campaignsQuery.error ? (
          <ReportErrorState kind="preview" message={campaignsQuery.error} onRetry={campaignsQuery.retry} />
        ) : null}

        {adGroupsQuery.loading ? (
          <ReportLoadingState kind="preview" message="Loading ad groups or ad sets..." onRetry={adGroupsQuery.retry} />
        ) : null}
        {adGroupsQuery.error ? (
          <ReportErrorState kind="preview" message={adGroupsQuery.error} onRetry={adGroupsQuery.retry} />
        ) : null}
        {adsQuery.loading ? (
          <ReportLoadingState kind="preview" message="Loading ads..." onRetry={adsQuery.retry} />
        ) : null}
        {adsQuery.error ? (
          <ReportErrorState kind="preview" message={adsQuery.error} onRetry={adsQuery.retry} />
        ) : null}

        {displayData && metaFatalError ? (
          <ReportErrorState
            kind="preview"
            message={`Required Meta block failed: [${metaFatalError.label}] fields=${metaFatalError.fields.join(",")} code=${
              metaFatalError.errorCode ?? "n/a"
            } subcode=${metaFatalError.errorSubcode ?? "n/a"} message=${metaFatalError.message}`}
            onRetry={retry}
          />
        ) : null}

        {displayData && googleFatalError ? (
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

        {displayData && !metaFatalError && !googleFatalError ? (
          <>
            <ReportWarnings warnings={displayData.warnings} />
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
            <div ref={previewMarkerRef} />
            {previewQuery.loading ? (
              <ReportLoadingState kind="preview" message="Loading selected ad preview..." onRetry={previewQuery.retry} />
            ) : null}
            {previewQuery.error ? (
              <ReportErrorState kind="preview" message={previewQuery.error} onRetry={previewQuery.retry} />
            ) : null}
            {assetsQuery.loading ? (
              <ReportLoadingState kind="preview" message="Loading creative assets..." onRetry={assetsQuery.retry} />
            ) : null}
            {assetsQuery.error ? (
              <ReportErrorState kind="preview" message={assetsQuery.error} onRetry={assetsQuery.retry} />
            ) : null}
            {previewResolution?.status === "ready" && previewResolution.section && previewResolution.campaign && (assetsQuery.data ?? previewQuery.data) ? (
              <PreviewHierarchy
                key={`${previewResolution.section.platform}:${previewResolution.campaign.id}`}
                section={previewResolution.section}
                initialCampaignId={previewResolution.campaign.id}
                companyName={displayData.companyName}
                structureFlowchart={structureFlowchart}
                onCampaignChange={handleCampaignChange}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function usePreviewVisibilityMarker(onVisible: (visible: boolean) => void) {
  return useMemo(
    () => (node: HTMLDivElement | null) => {
      if (!node) {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            onVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: "280px 0px" }
      );
      observer.observe(node);
    },
    [onVisible]
  );
}

function buildPreviewStageQuery(
  queryString: string,
  selection: {
    platform?: "meta" | "google" | null;
    campaignId?: string | null;
    adGroupId?: string | null;
  }
): string {
  const params = new URLSearchParams(queryString);
  if (selection.platform) {
    params.set("platform", selection.platform);
  }
  if (selection.campaignId) {
    params.set("campaignId", selection.campaignId);
  }
  if (selection.adGroupId) {
    params.set("adGroupId", selection.adGroupId);
  }
  return params.toString();
}

function mergePreviewCampaignOptions(
  payload: PreviewReportPayload,
  campaignOptionsPayload: PreviewReportPayload
): PreviewReportPayload {
  return {
    ...payload,
    sections: payload.sections.map((section) => {
      const optionSection = campaignOptionsPayload.sections.find(
        (item) => item.platform === section.platform
      );
      if (!optionSection) {
        return section;
      }

      const selectedCampaignsById = new Map(
        section.campaigns.map((campaign) => [campaign.id, campaign])
      );
      const optionCampaignIds = new Set(optionSection.campaigns.map((campaign) => campaign.id));

      return {
        ...section,
        campaigns: [
          ...optionSection.campaigns.map((campaign) => selectedCampaignsById.get(campaign.id) ?? campaign),
          ...section.campaigns.filter((campaign) => !optionCampaignIds.has(campaign.id)),
        ],
      };
    }),
  };
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
