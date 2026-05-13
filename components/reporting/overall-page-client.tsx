"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AudienceClickBreakdownSection } from "@/components/reporting/audience-click-breakdown";
import { OverallCampaignGroupsTable } from "@/components/reporting/campaign-table";
import { ReportSuccessScreen } from "@/components/reporting/report-loading-screen";
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
import { useReportReadyTransition } from "@/components/reporting/use-report-ready-transition";
import { OverallReportPayload } from "@/lib/reporting/types";

type AccountReportEntry = {
  key: string;
  platform: "meta" | "google";
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
  const [resolvedLabels, setResolvedLabels] = useState<ResolvedAccountLabel[]>([]);

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

  const accountReportEntries = useMemo(
    () => buildAccountReportEntries(filters, queryString),
    [filters, queryString]
  );
  const splitByAccount = accountReportEntries.length > 1;

  const { data, error, loading, retry, successToken } = useOverallReport(
    queryString,
    hasAccountId && !splitByAccount
  );
  const overallReady =
    hasAccountId && !splitByAccount && !loading && !error && Boolean(data) && (data?.warnings.length ?? 0) === 0;
  const { showReadyState } = useReportReadyTransition({
    ready: overallReady,
    transitionKey: successToken,
  });

  const handleAccountResolved = useCallback((label: ResolvedAccountLabel) => {
    setResolvedLabels((current) => {
      const withoutCurrent = current.filter((item) => item.key !== label.key);
      return [...withoutCurrent, label];
    });
  }, []);

  const forwardQuery = useMemo(() => {
    const params = new URLSearchParams(queryString);
    if (screenshotMode) {
      params.set("screenshot", "1");
    }
    return params.toString() ? `&${params.toString()}` : "";
  }, [queryString, screenshotMode]);

  const activeAccountKeys = useMemo(
    () => new Set(accountReportEntries.map((entry) => entry.key)),
    [accountReportEntries]
  );
  const firstResolvedCompanyName = resolvedLabels.find((label) =>
    activeAccountKeys.has(label.key)
  )?.companyName;
  const title = `${
    data?.companyName ?? firstResolvedCompanyName ?? (splitByAccount ? "Multi-Account" : "Company Name")
  } Monthly Performance`;
  const dateLabel =
    data?.dateRange.currentLabel ?? `${filters.startDate} - ${filters.endDate}`;

  if (hasAccountId && !splitByAccount && loading) {
    return (
      <ReportLoadingState
        kind="overall"
        message="Loading overview data from Meta and Google APIs..."
        fullPage
        onRetry={retry}
      />
    );
  }

  if (showReadyState) {
    return <ReportSuccessScreen kind="overall" fullPage />;
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
            kind="overall"
            message="Enter at least one account ID to request data from Meta Ads Manager and Google Ads Manager."
          />
        ) : null}

        {error ? <ReportErrorState kind="overall" message={error} onRetry={retry} /> : null}

        {splitByAccount ? (
          <div className="space-y-8">
            {accountReportEntries.map((entry, index) => (
              <SplitAccountOverallReport
                key={entry.key}
                entry={entry}
                index={index}
                screenshotMode={screenshotMode}
                onResolved={handleAccountResolved}
              />
            ))}
          </div>
        ) : data ? (
          <>
            <ReportWarnings warnings={data.warnings} />
            {data.summaries.map((section) => (
              <MetricSection key={section.platform} section={section} />
            ))}
            <OverallCampaignGroupsTable
              groups={data.campaignGroups}
              queryString={forwardQuery}
            />
            <AudienceClickBreakdownSection breakdown={data.audienceClickBreakdown} />
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
  onResolved,
}: {
  entry: AccountReportEntry;
  index: number;
  screenshotMode: boolean;
  onResolved: (label: ResolvedAccountLabel) => void;
}) {
  const { data, error, loading, retry } = useOverallReport(entry.queryString, true);

  useEffect(() => {
    if (data?.companyName) {
      onResolved({ key: entry.key, companyName: data.companyName });
    }
  }, [data?.companyName, entry.key, onResolved]);

  const forwardQuery = useMemo(() => {
    const params = new URLSearchParams(entry.queryString);
    if (screenshotMode) {
      params.set("screenshot", "1");
    }
    return params.toString() ? `&${params.toString()}` : "";
  }, [entry.queryString, screenshotMode]);

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

      {data ? <AccountReportContent data={data} queryString={forwardQuery} /> : null}
    </section>
  );
}

function AccountReportContent({
  data,
  queryString,
}: {
  data: OverallReportPayload;
  queryString: string;
}) {
  return (
    <>
      <ReportWarnings warnings={data.warnings} />
      {data.summaries.map((section) => (
        <MetricSection key={section.platform} section={section} />
      ))}
      <OverallCampaignGroupsTable groups={data.campaignGroups} queryString={queryString} />
      <AudienceClickBreakdownSection breakdown={data.audienceClickBreakdown} />
    </>
  );
}

function buildAccountReportEntries(filters: ReportFilters, fallbackQueryString: string): AccountReportEntry[] {
  const entries: AccountReportEntry[] = [];

  splitAccountIdList(filters.metaAccountId).forEach((accountId) => {
    entries.push(createAccountReportEntry("meta", accountId, filters));
  });

  splitAccountIdList(filters.googleAccountId).forEach((accountId) => {
    entries.push(createAccountReportEntry("google", accountId, filters));
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
  } else {
    params.set("googleAccountId", accountId);
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

  if (lowered.startsWith("act_")) {
    return { platform: "meta", accountId: trimmed };
  }

  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed) || (/^\d+$/.test(trimmed) && digitsOnly.length === 10)) {
    return { platform: "google", accountId: trimmed };
  }

  return { platform: "meta", accountId: trimmed };
}

function platformDisplayName(platform: AccountReportEntry["platform"]): string {
  return platform === "meta" ? "Meta Ads" : "Google Ads";
}
