"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AudienceClickBreakdownSection } from "@/components/reporting/audience-click-breakdown";
import { OverallCampaignGroupsTable } from "@/components/reporting/campaign-table";
import { ReportSuccessScreen } from "@/components/reporting/report-loading-screen";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { MetricSection } from "@/components/reporting/metric-grid";
import { TikTokInsightsPanel } from "@/components/reporting/tiktok-insights-panel";
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
import {
  useOverallAudienceBreakdownStage,
  useOverallCampaignPerformanceStage,
  useOverallReport,
  useOverallSummaryStage,
  useTikTokInsightsStage,
} from "@/components/reporting/use-report-data";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import type { CampaignNameFilter } from "@/lib/reporting/campaign-name-filter";
import { getCampaignNameOptions } from "@/lib/reporting/campaign-name-filter";
import { OverallReportPayload } from "@/lib/reporting/types";
import { buildReportContextQuery } from "@/lib/reporting/report-navigation";

type AccountReportEntry = {
  key: string;
  platform: "meta" | "google" | "tiktok";
  accountId: string;
  queryString: string;
};

type ResolvedAccountLabel = {
  key: string;
  companyName: string;
};

export function OverallPageClient({
  initialFilters,
}: {
  initialFilters?: Partial<ReportFilters>;
}) {
  const { filters, hasAccountId, setFilters } =
    useReportFilters(initialFilters);
  const { screenshotMode } = useScreenshotMode();
  const compactInteractive = !screenshotMode;
  const [resolvedLabels, setResolvedLabels] = useState<ResolvedAccountLabel[]>([]);
  const [readyAccountKeys, setReadyAccountKeys] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const campaignNameFilter = useMemo<CampaignNameFilter | null>(() => {
    const values = getCampaignNameOptions(filters.campaignNameFilterValues);
    return values.length > 0
      ? {
          mode: filters.campaignNameFilterMode,
          values,
        }
      : null;
  }, [filters.campaignNameFilterMode, filters.campaignNameFilterValues]);
  const handleCampaignNameFilterChange = useCallback(
    (nextFilter: CampaignNameFilter | null) => {
      setFilters({
        campaignNameFilterMode: nextFilter?.mode ?? "include",
        campaignNameFilterValues: nextFilter?.values ?? [],
      });
    },
    [setFilters]
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
    if (filters.tiktokAccountId) {
      params.set("tiktokAccountId", filters.tiktokAccountId);
    }
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    if (filters.source === "meta_csv") {
      params.set("source", "meta_csv");
    }
    params.set("platform", filters.platform);
    return buildReportContextQuery(params.toString());
  }, [
    filters.accountId,
    filters.endDate,
    filters.googleAccountId,
    filters.metaAccountId,
    filters.platform,
    filters.tiktokAccountId,
    filters.startDate,
    filters.source,
  ]);
  const activeQueryString = useMemo(() => {
    const params = new URLSearchParams(queryString);
    if (campaignNameFilter) {
      params.set("campaignNameFilterMode", campaignNameFilter.mode);
      params.delete("campaignNameFilterValue");
      campaignNameFilter.values.forEach((value) => params.append("campaignNameFilterValue", value));
    }
    return params.toString();
  }, [campaignNameFilter, queryString]);
  const stageQueryString = useMemo(() => {
    if (refreshKey <= 0) {
      return queryString;
    }
    const params = new URLSearchParams(queryString);
    params.set("refresh", String(refreshKey));
    return params.toString();
  }, [queryString, refreshKey]);

  const accountReportEntries = useMemo(
    () => buildAccountReportEntries(filters, queryString),
    [filters, queryString]
  );
  const splitByAccount = accountReportEntries.length > 1;

  const accountKey = useMemo(
    () => filters.metaAccountId || filters.googleAccountId || filters.tiktokAccountId || filters.accountId || "-",
    [filters.accountId, filters.googleAccountId, filters.metaAccountId, filters.tiktokAccountId]
  );
  const summaryQuery = useOverallSummaryStage(
    accountKey,
    stageQueryString,
    hasAccountId && !splitByAccount
  );
  const campaignQuery = useOverallCampaignPerformanceStage(
    accountKey,
    stageQueryString,
    hasAccountId && !splitByAccount
  );
  const data = summaryQuery.data;
  const isTikTokOnly = isTikTokOnlyFilters(filters);
  const tiktokStageWarnings = useMemo(
    () => isTikTokOnly
      ? dedupeWarnings([
          ...(summaryQuery.data?.warnings ?? []),
          ...(campaignQuery.data?.warnings ?? []),
        ])
      : [],
    [campaignQuery.data?.warnings, isTikTokOnly, summaryQuery.data?.warnings],
  );
  const overallReady =
    hasAccountId &&
    !splitByAccount &&
    !summaryQuery.loading &&
    !campaignQuery.loading &&
    !summaryQuery.error &&
    !campaignQuery.error &&
    Boolean(summaryQuery.data) &&
    Boolean(campaignQuery.data);
  const { showReadyState } = useReportReadyTransition({
    ready: overallReady,
    transitionKey: summaryQuery.successToken,
  });

  const handleAccountResolved = useCallback((label: ResolvedAccountLabel) => {
    setResolvedLabels((current) => {
      const withoutCurrent = current.filter((item) => item.key !== label.key);
      return [...withoutCurrent, label];
    });
  }, []);

  const handleAccountReadyChange = useCallback((key: string, ready: boolean) => {
    setReadyAccountKeys((current) => {
      if (current[key] === ready) {
        return current;
      }
      return { ...current, [key]: ready };
    });
  }, []);

  const forwardQuery = useMemo(() => {
    const params = new URLSearchParams(activeQueryString);
    if (screenshotMode) {
      params.set("screenshot", "1");
    }
    return params.toString() ? `&${params.toString()}` : "";
  }, [activeQueryString, screenshotMode]);

  const activeAccountKeys = useMemo(
    () => new Set(accountReportEntries.map((entry) => entry.key)),
    [accountReportEntries]
  );
  const reportReady = splitByAccount
    ? accountReportEntries.length > 0 && accountReportEntries.every((entry) => readyAccountKeys[entry.key])
    : Boolean(summaryQuery.data && campaignQuery.data && !summaryQuery.loading && !campaignQuery.loading);
  const firstResolvedCompanyName = resolvedLabels.find((label) =>
    activeAccountKeys.has(label.key)
  )?.companyName;
  const title = `${
    data?.companyName ?? firstResolvedCompanyName ?? (splitByAccount ? "Multi-Account" : "Company Name")
  } Monthly Performance`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  if (showReadyState) {
    return <ReportSuccessScreen kind="overall" fullPage />;
  }

  if (hasAccountId && !splitByAccount && summaryQuery.loading && !summaryQuery.data) {
    return (
      <ReportLoadingState
        kind="overall"
        message="Loading summary metrics..."
        fullPage
        onRetry={summaryQuery.retry}
      />
    );
  }

  return (
    <ReportShell
      compactResponsive={compactInteractive}
      title={title}
      dateLabel={dateLabel}
      activeQuery={activeQueryString}
      reportReady={reportReady}
      headerDateControl={
        <ReportHeaderMonthPicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          variant={compactInteractive ? "compact" : "header"}
          densePopover={compactInteractive}
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
          showResetButton
          submitLabel="Reload"
          compact
          compactToolbar
          immediateAccountApply
          footerContent={<ReportDownloadButton fileNamePrefix={title} compact={compactInteractive} />}
          onApply={(next) => {
            const unchanged =
              next.accountId === filters.accountId &&
              next.metaAccountId === filters.metaAccountId &&
              next.googleAccountId === filters.googleAccountId &&
              next.tiktokAccountId === filters.tiktokAccountId &&
              next.startDate === filters.startDate &&
              next.endDate === filters.endDate &&
              next.source === filters.source;
            if (unchanged) {
              setRefreshKey(Date.now());
              return;
            }
            setRefreshKey(0);
            setFilters(next);
          }}
          onReset={() =>
            setFilters({
              accountId: "",
              metaAccountId: "",
              googleAccountId: "",
              tiktokAccountId: "",
            })
          }
        />
      }
    >
      <div className={compactInteractive ? "space-y-4 lg:space-y-5" : "space-y-5"}>
        {!hasAccountId ? (
          <ReportErrorState
            kind="overall"
            message="Enter at least one account ID to request data from Meta Ads Manager and Google Ads Manager."
          />
        ) : null}

        {splitByAccount ? (
          <div className="space-y-8">
            {accountReportEntries.map((entry, index) => (
              <SplitAccountOverallReport
                key={entry.key}
                entry={entry}
                index={index}
                screenshotMode={screenshotMode}
                campaignNameFilter={campaignNameFilter}
                onCampaignNameFilterChange={handleCampaignNameFilterChange}
                onResolved={handleAccountResolved}
                onReadyChange={handleAccountReadyChange}
              />
            ))}
          </div>
        ) : hasAccountId ? (
          <>
            {summaryQuery.loading ? (
              <ReportLoadingState
                kind="overall"
                message="Loading summary metrics..."
                onRetry={summaryQuery.retry}
              />
            ) : null}
            {summaryQuery.error ? (
              <ReportErrorState
                kind="overall"
                message={summaryQuery.error}
                onRetry={summaryQuery.retry}
              />
            ) : null}
            {summaryQuery.data ? (
              <>
                <ReportWarnings warnings={isTikTokOnly ? tiktokStageWarnings : summaryQuery.data.warnings} />
                {summaryQuery.data.tiktokAccounts?.map((account) => (
                  <TikTokAccountContext key={account.advertiserId} account={account} />
                ))}
                {summaryQuery.data.summaries.map((section) => (
                  <MetricSection
                    key={section.platform}
                    section={section}
                    dateRange={summaryQuery.data?.dateRange}
                    compact={compactInteractive}
                  />
                ))}
              </>
            ) : null}

            {campaignQuery.loading ? (
              <ReportLoadingState
                kind="overall"
                message="Loading campaign performance..."
                onRetry={campaignQuery.retry}
              />
            ) : null}
            {campaignQuery.error ? (
              <ReportErrorState
                kind="overall"
                message={campaignQuery.error}
                onRetry={campaignQuery.retry}
              />
            ) : null}
            {campaignQuery.data ? (
              <>
                {!isTikTokOnly ? <ReportWarnings warnings={campaignQuery.data.warnings} /> : null}
                <OverallCampaignGroupsTable
                  groups={campaignQuery.data.campaignGroups}
                  queryString={forwardQuery}
                  compact={compactInteractive}
                  campaignNameFilter={campaignNameFilter}
                  onCampaignNameFilterChange={handleCampaignNameFilterChange}
                />
              </>
            ) : null}

            {isTikTokOnly ? (
              <LazyTikTokInsights accountKey={accountKey} queryString={stageQueryString} enabled={hasAccountId} screenshotMode={screenshotMode} />
            ) : (
              <LazyAudienceBreakdown
                accountKey={accountKey}
                queryString={stageQueryString}
                enabled={hasAccountId}
                screenshotMode={screenshotMode}
                compact={compactInteractive}
                summaryData={summaryQuery.data}
              />
            )}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function SplitAccountOverallReport({
  entry,
  index,
  screenshotMode,
  campaignNameFilter,
  onCampaignNameFilterChange,
  onResolved,
  onReadyChange,
}: {
  entry: AccountReportEntry;
  index: number;
  screenshotMode: boolean;
  campaignNameFilter: CampaignNameFilter | null;
  onCampaignNameFilterChange: (filter: CampaignNameFilter | null) => void;
  onResolved: (label: ResolvedAccountLabel) => void;
  onReadyChange: (key: string, ready: boolean) => void;
}) {
  const { data, error, loading, retry } = useOverallReport(entry.queryString, true);

  useEffect(() => {
    if (data?.companyName) {
      onResolved({ key: entry.key, companyName: data.companyName });
    }
  }, [data?.companyName, entry.key, onResolved]);

  useEffect(() => {
    onReadyChange(entry.key, Boolean(data && !loading && !error));
  }, [data, entry.key, error, loading, onReadyChange]);

  const forwardQuery = useMemo(() => {
    const params = new URLSearchParams(entry.queryString);
    if (campaignNameFilter) {
      params.set("campaignNameFilterMode", campaignNameFilter.mode);
      params.delete("campaignNameFilterValue");
      campaignNameFilter.values.forEach((value) => params.append("campaignNameFilterValue", value));
    }
    if (screenshotMode) {
      params.set("screenshot", "1");
    }
    return params.toString() ? `&${params.toString()}` : "";
  }, [campaignNameFilter, entry.queryString, screenshotMode]);

  const sectionTitle = data?.companyName ?? `${platformDisplayName(entry.platform)} Account ${entry.accountId}`;

  return (
    <section className="space-y-5 border-t border-[#d5d5d5] pt-7 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#9f0019]">
            {platformDisplayName(entry.platform)} Report {index + 1}
          </p>
          <h2 className="text-2xl font-semibold leading-tight text-[#333] sm:text-3xl">
            {sectionTitle}
          </h2>
        </div>
        <p className="rounded-full border border-[#d7d7d7] bg-white px-3 py-1 text-sm font-medium text-[#555]">
          {entry.accountId}
        </p>
      </div>

      {loading ? (
        <ReportLoadingState
          kind="overall"
          message={`Loading ${platformDisplayName(entry.platform)} report for ${entry.accountId}...`}
          onRetry={retry}
        />
      ) : null}

      {error ? <ReportErrorState kind="overall" message={error} onRetry={retry} /> : null}

      {data ? (
        <AccountReportContent
          data={data}
          queryString={forwardQuery}
          screenshotMode={screenshotMode}
          showTikTokAccountContext={false}
          campaignNameFilter={campaignNameFilter}
          onCampaignNameFilterChange={onCampaignNameFilterChange}
        />
      ) : null}
    </section>
  );
}

export function AccountReportContent({
  data,
  queryString,
  campaignNameFilter = null,
  onCampaignNameFilterChange,
  screenshotMode = false,
  showTikTokAccountContext = true,
}: {
  data: OverallReportPayload;
  queryString: string;
  campaignNameFilter?: CampaignNameFilter | null;
  onCampaignNameFilterChange?: (filter: CampaignNameFilter | null) => void;
  screenshotMode?: boolean;
  showTikTokAccountContext?: boolean;
}) {
  const compactInteractive = !screenshotMode;

  return (
    <>
      <ReportWarnings warnings={data.warnings} />
      {showTikTokAccountContext ? data.tiktokAccounts?.map((account) => (
        <TikTokAccountContext key={account.advertiserId} account={account} />
      )) : null}
      {data.summaries.map((section) => (
        <MetricSection key={section.platform} section={section} dateRange={data.dateRange} compact={compactInteractive} />
      ))}
      <OverallCampaignGroupsTable
        groups={data.campaignGroups}
        queryString={queryString}
        compact={compactInteractive}
        campaignNameFilter={campaignNameFilter}
        onCampaignNameFilterChange={onCampaignNameFilterChange}
      />
      {isTikTokOnlyPayload(data) ? (
        <LazyTikTokInsights
          accountKey={data.accountIds.tiktokAccountIds?.[0] ?? data.accountIds.tiktokAccountId ?? "-"}
          queryString={queryString.replace(/^&/, "")}
          enabled
          screenshotMode={screenshotMode}
        />
      ) : (
        <AudienceClickBreakdownSection
          breakdown={data.audienceClickBreakdown}
          pdfLocationTab={resolvePdfAudienceLocationTab(data)}
          compact={compactInteractive}
        />
      )}
    </>
  );
}

function LazyAudienceBreakdown({
  accountKey,
  queryString,
  enabled,
  screenshotMode,
  compact,
  summaryData,
}: {
  accountKey: string;
  queryString: string;
  enabled: boolean;
  screenshotMode: boolean;
  compact: boolean;
  summaryData: Pick<OverallReportPayload, "accountIds"> | null;
}) {
  const [visible, setVisible] = useState(screenshotMode);
  const shouldLoad = enabled && (visible || screenshotMode);
  const { data, error, loading, retry } = useOverallAudienceBreakdownStage(
    accountKey,
    queryString,
    shouldLoad
  );

  const markerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || screenshotMode) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(node);
  }, [screenshotMode]);

  return (
    <div ref={markerRef} className="space-y-5">
      {!shouldLoad ? (
        <ReportLoadingState
          kind="overall"
          message="Audience breakdown will load when this section is visible."
        />
      ) : null}
      {loading ? (
        <ReportLoadingState
          kind="overall"
          message="Loading audience click breakdown..."
          onRetry={retry}
        />
      ) : null}
      {error ? <ReportErrorState kind="overall" message={error} onRetry={retry} /> : null}
      {data ? (
        <>
          <ReportWarnings warnings={data.warnings} />
          <AudienceClickBreakdownSection
            breakdown={data.audienceClickBreakdown}
            compact={compact}
            pdfLocationTab={resolvePdfAudienceLocationTab({
              accountIds: data.accountIds ??
                summaryData?.accountIds ?? {
                  metaAccountId: null,
                  googleAccountId: null,
                  metaAccountIds: [],
                  googleAccountIds: [],
                },
            })}
          />
        </>
      ) : null}
    </div>
  );
}

function resolvePdfAudienceLocationTab(
  data: Pick<OverallReportPayload, "accountIds">
): "region" | "city" | undefined {
  const hasMeta = data.accountIds.metaAccountIds.length > 0 || Boolean(data.accountIds.metaAccountId);
  const hasGoogle = data.accountIds.googleAccountIds.length > 0 || Boolean(data.accountIds.googleAccountId);

  if (hasMeta && !hasGoogle) {
    return "region";
  }
  if (hasGoogle && !hasMeta) {
    return "city";
  }

  return undefined;
}

function buildAccountReportEntries(filters: ReportFilters, fallbackQueryString: string): AccountReportEntry[] {
  const entries: AccountReportEntry[] = [];

  splitAccountIdList(filters.metaAccountId).forEach((accountId) => {
    entries.push(createAccountReportEntry("meta", accountId, filters));
  });

  splitAccountIdList(filters.googleAccountId).forEach((accountId) => {
    entries.push(createAccountReportEntry("google", accountId, filters));
  });

  splitAccountIdList(filters.tiktokAccountId).forEach((accountId) => {
    entries.push(createAccountReportEntry("tiktok", accountId, filters));
  });

  splitAccountIdList(filters.accountId).forEach((token) => {
    const classified = classifyAccountIdToken(token);
    entries.push(createAccountReportEntry(classified.platform, classified.accountId, filters));
  });

  const deduped = dedupeAccountReportEntries(entries);
  if (deduped.length === 0 && fallbackQueryString) {
    return [];
  }
  return deduped;
}

function createAccountReportEntry(
  platform: AccountReportEntry["platform"],
  accountId: string,
  filters: Pick<ReportFilters, "startDate" | "endDate">
): AccountReportEntry {
  const params = new URLSearchParams();
  if (platform === "meta") {
    params.set("metaAccountId", accountId);
  } else if (platform === "google") {
    params.set("googleAccountId", accountId);
  } else {
    params.set("tiktokAccountId", accountId);
  }
  params.set("startDate", filters.startDate);
  params.set("endDate", filters.endDate);

  return {
    key: `${platform}:${accountId}`,
    platform,
    accountId,
    queryString: params.toString(),
  };
}

function dedupeAccountReportEntries(entries: AccountReportEntry[]): AccountReportEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.key)) {
      return false;
    }
    seen.add(entry.key);
    return true;
  });
}

function splitAccountIdList(value: string): string[] {
  return value
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifyAccountIdToken(token: string): Pick<AccountReportEntry, "platform" | "accountId"> {
  const trimmed = token.trim();
  const lowered = trimmed.toLowerCase();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (lowered.startsWith("meta:") || lowered.startsWith("m:")) {
    return { platform: "meta", accountId: trimmed.split(":").slice(1).join(":").trim() };
  }

  if (lowered.startsWith("google:") || lowered.startsWith("g:")) {
    return { platform: "google", accountId: trimmed.split(":").slice(1).join(":").trim() };
  }

  if (lowered.startsWith("tiktok:") || lowered.startsWith("tt:")) {
    return { platform: "tiktok", accountId: trimmed.split(":").slice(1).join(":").trim() };
  }

  if (lowered.startsWith("act_")) {
    return { platform: "meta", accountId: trimmed };
  }

  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed) || (/^\d+$/.test(trimmed) && digitsOnly.length === 10)) {
    return { platform: "google", accountId: trimmed };
  }

  return { platform: "meta", accountId: trimmed };
}

function platformDisplayName(platform: AccountReportEntry["platform"]): string {
  return platform === "meta" ? "Meta Ads" : platform === "tiktok" ? "TikTok Ads" : "Google Ads";
}

function LazyTikTokInsights({
  accountKey,
  queryString,
  enabled,
  screenshotMode,
}: {
  accountKey: string;
  queryString: string;
  enabled: boolean;
  screenshotMode: boolean;
}) {
  const [visible, setVisible] = useState(screenshotMode);
  const shouldLoad = enabled && (visible || screenshotMode);
  const { data, error, loading, retry } = useTikTokInsightsStage(accountKey, queryString, shouldLoad);
  const markerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || screenshotMode) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
  }, [screenshotMode]);

  return (
    <div ref={markerRef} className="space-y-5">
      {!shouldLoad ? <ReportLoadingState kind="overall" message="TikTok insights will load when this section is visible." /> : null}
      {loading ? <ReportLoadingState kind="overall" message="Loading TikTok insights..." onRetry={retry} /> : null}
      {error ? <ReportErrorState kind="overall" message={error} onRetry={retry} /> : null}
      {data ? <TikTokInsightsPanel payload={data} /> : null}
    </div>
  );
}

function isTikTokOnlyFilters(filters: ReportFilters): boolean {
  return Boolean(filters.tiktokAccountId) && !filters.accountId && !filters.metaAccountId && !filters.googleAccountId;
}

function isTikTokOnlyPayload(data: OverallReportPayload): boolean {
  const tiktokIds = data.accountIds.tiktokAccountIds ?? [];
  return tiktokIds.length > 0 && data.accountIds.metaAccountIds.length === 0 && data.accountIds.googleAccountIds.length === 0;
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings.map((warning) => warning.trim()).filter(Boolean)));
}

function TikTokAccountContext({
  account,
}: {
  account: NonNullable<OverallReportPayload["tiktokAccounts"]>[number];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
      <span className="font-semibold text-slate-950">{account.advertiserName}</span>
      {` · TikTok advertiser ${account.advertiserId} · ${account.currency} · ${account.timezone}`}
    </div>
  );
}
