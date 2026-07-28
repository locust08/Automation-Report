"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PreviewHierarchy } from "@/components/reporting/preview-hierarchy";
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
import { useReportFilters } from "@/components/reporting/use-report-filters";
import { formatGoogleAdsAccessPathErrorMessage } from "@/lib/reporting/google-access-path";
import { resolvePreviewEntry } from "@/lib/reporting/preview-selection";
import type {
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewPlatformSection,
  PreviewReportPayload,
} from "@/lib/reporting/types";

const PREVIEW_OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_DETAILS_CACHE_TTL_MS = 2 * 60 * 1000;

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
    "Unable to load active campaigns.",
    PREVIEW_OPTIONS_CACHE_TTL_MS
  );
  const structureQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/accounts/${encodeURIComponent(accountKey)}/structure`,
    queryString,
    hasAccountId,
    "Unable to load account structure.",
    PREVIEW_OPTIONS_CACHE_TTL_MS
  );
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedAdId, setSelectedAdId] = useState("");
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
    "Unable to load ad groups or ad sets.",
    PREVIEW_OPTIONS_CACHE_TTL_MS
  );
  const selectedChild = useMemo(() => {
    const children = getPreviewChildren(
      adGroupsQuery.data,
      selectedStagePlatform,
      selectedCampaign?.id ?? null
    );
    return children.find((child) => child.id === selectedChildId) ?? children[0] ?? null;
  }, [adGroupsQuery.data, selectedCampaign?.id, selectedChildId, selectedStagePlatform]);
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
    "Unable to load ads.",
    PREVIEW_OPTIONS_CACHE_TTL_MS
  );
  const selectedAd = useMemo(() => {
    const ads = getPreviewAds(
      adsQuery.data,
      selectedStagePlatform,
      selectedCampaign?.id ?? null,
      selectedChild?.id ?? null
    );
    return ads.find((ad) => ad.id === selectedAdId) ?? ads[0] ?? null;
  }, [
    adsQuery.data,
    selectedAdId,
    selectedCampaign?.id,
    selectedChild?.id,
    selectedStagePlatform,
  ]);
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
    "Unable to load preview details.",
    PREVIEW_DETAILS_CACHE_TTL_MS
  );
  const assetsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ads/${encodeURIComponent(selectedAd?.id ?? "-")}/assets`,
    previewQueryString,
    hasAccountId && Boolean(selectedAd) && Boolean(previewQuery.data),
    "Unable to load creative assets.",
    PREVIEW_DETAILS_CACHE_TTL_MS
  );
  const displayData = useMemo(
    () =>
      mergePreviewStagePayloads({
        campaigns: campaignsQuery.data,
        structure: structureQuery.data,
        adGroups: adGroupsQuery.data,
        ads: adsQuery.data,
        details: assetsQuery.data ?? previewQuery.data,
        platform: selectedStagePlatform,
        campaignId: selectedCampaign?.id ?? null,
        adGroupId: selectedChild?.id ?? null,
        adId: selectedAd?.id ?? null,
      }),
    [
      adGroupsQuery.data,
      adsQuery.data,
      assetsQuery.data,
      campaignsQuery.data,
      structureQuery.data,
      previewQuery.data,
      selectedAd?.id,
      selectedCampaign?.id,
      selectedChild?.id,
      selectedStagePlatform,
    ]
  );
  const retry =
    assetsQuery.error ? assetsQuery.retry :
    previewQuery.error ? previewQuery.retry :
    adsQuery.error ? adsQuery.retry :
    adGroupsQuery.error ? adGroupsQuery.retry :
    campaignsQuery.retry;
  const metaFatalError = displayData?.metaFatalErrors?.[0] ?? null;
  const googleFatalError = displayData?.googleFatalErrors?.[0] ?? null;
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
  function handleCampaignChange(next: {
    platform: "meta" | "google";
    campaignId: string;
    campaignName: string;
  }) {
    setSelectedChildId("");
    setSelectedAdId("");
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

  function handleChildChange(childId: string) {
    setSelectedChildId(childId);
    setSelectedAdId("");
  }

  function handleAdChange(adId: string) {
    setSelectedAdId(adId);
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

        {adGroupsQuery.error ? (
          <ReportErrorState kind="preview" message={adGroupsQuery.error} onRetry={adGroupsQuery.retry} />
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
            {previewQuery.error ? (
              <ReportErrorState kind="preview" message={previewQuery.error} onRetry={previewQuery.retry} />
            ) : null}
            {assetsQuery.error ? (
              <ReportErrorState kind="preview" message={assetsQuery.error} onRetry={assetsQuery.retry} />
            ) : null}
            {previewResolution?.status === "ready" && previewResolution.section && previewResolution.campaign ? (
              <PreviewHierarchy
                key={`${previewResolution.section.platform}:${previewResolution.campaign.id}`}
                section={previewResolution.section}
                initialCampaignId={previewResolution.campaign.id}
                initialChildId={selectedChild?.id ?? ""}
                initialAdId={selectedAd?.id ?? ""}
                companyName={displayData.companyName}
                detailsLoading={
                  adGroupsQuery.loading ||
                  adsQuery.loading ||
                  previewQuery.loading ||
                  assetsQuery.loading
                }
                onCampaignChange={handleCampaignChange}
                onChildChange={handleChildChange}
                onAdChange={handleAdChange}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </ReportShell>
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
  // Increment when the preview metric contract changes so long-lived client
  // sessions do not keep displaying an older in-memory stage response.
  params.set("previewMetricsVersion", "2");
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

function mergePreviewStagePayloads(input: {
  campaigns: PreviewReportPayload | null;
  structure: PreviewReportPayload | null;
  adGroups: PreviewReportPayload | null;
  ads: PreviewReportPayload | null;
  details: PreviewReportPayload | null;
  platform: PreviewPlatformSection["platform"] | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
}): PreviewReportPayload | null {
  const payload = input.details ?? input.ads ?? input.adGroups ?? input.campaigns;
  if (!payload || !input.campaigns) {
    return payload;
  }

  return {
    ...payload,
    sections: input.campaigns.sections.map((section) => {
      if (!input.platform || section.platform !== input.platform) {
        return section;
      }

      return {
        ...section,
        campaigns: section.campaigns.map((campaign) => {
          if (!input.campaignId || campaign.id !== input.campaignId) {
            return campaign;
          }

          const stageCampaign = findPreviewCampaign(
            input.adGroups,
            section.platform,
            campaign.id
          );
          const children = (stageCampaign?.children ?? campaign.children).map((child) => {
            const structureChild = findPreviewChild(
              input.structure,
              section.platform,
              campaign.id,
              child.id
            );
            if (!input.adGroupId || child.id !== input.adGroupId) {
              return structureChild ?? child;
            }

            const stageChild = findPreviewChild(
              input.ads,
              section.platform,
              campaign.id,
              child.id
            );
            const ads = (stageChild?.ads ?? structureChild?.ads ?? child.ads).map((ad) => {
              if (!input.adId || ad.id !== input.adId) {
                return ad;
              }

              return (
                findPreviewAd(
                  input.details,
                  section.platform,
                  campaign.id,
                  child.id,
                  ad.id
                ) ?? ad
              );
            });

            return { ...(stageChild ?? structureChild ?? child), ads };
          });

          return { ...(stageCampaign ?? campaign), children };
        }),
      };
    }),
  };
}

function getPreviewChildren(
  payload: PreviewReportPayload | null,
  platform: PreviewPlatformSection["platform"] | null,
  campaignId: string | null
): PreviewAdGroupNode[] {
  if (!platform || !campaignId) {
    return [];
  }
  return findPreviewCampaign(payload, platform, campaignId)?.children ?? [];
}

function getPreviewAds(
  payload: PreviewReportPayload | null,
  platform: PreviewPlatformSection["platform"] | null,
  campaignId: string | null,
  adGroupId: string | null
): PreviewAdNode[] {
  if (!platform || !campaignId || !adGroupId) {
    return [];
  }
  return findPreviewChild(payload, platform, campaignId, adGroupId)?.ads ?? [];
}

function findPreviewCampaign(
  payload: PreviewReportPayload | null,
  platform: PreviewPlatformSection["platform"],
  campaignId: string
): PreviewCampaignNode | null {
  return (
    payload?.sections
      .find((section) => section.platform === platform)
      ?.campaigns.find((campaign) => campaign.id === campaignId) ?? null
  );
}

function findPreviewChild(
  payload: PreviewReportPayload | null,
  platform: PreviewPlatformSection["platform"],
  campaignId: string,
  adGroupId: string
): PreviewAdGroupNode | null {
  return (
    findPreviewCampaign(payload, platform, campaignId)?.children.find(
      (child) => child.id === adGroupId
    ) ?? null
  );
}

function findPreviewAd(
  payload: PreviewReportPayload | null,
  platform: PreviewPlatformSection["platform"],
  campaignId: string,
  adGroupId: string,
  adId: string
): PreviewAdNode | null {
  return (
    findPreviewChild(payload, platform, campaignId, adGroupId)?.ads.find(
      (ad) => ad.id === adId
    ) ?? null
  );
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
