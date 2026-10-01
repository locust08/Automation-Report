"use client";

import { useSearchParams } from "next/navigation";
import { OverallCampaignGroupsTable } from "./campaign-table";
import { ReportShell } from "./report-shell";
import { ReportHeaderMonthPicker } from "./report-header-month-picker";
import { ReportFiltersBar } from "./report-filters-bar";
import { ReportEmptyState, ReportErrorState, ReportWarnings } from "./report-state";
import { AdvancedLoadingPanel } from "./advanced-loading-panel";
import { useReportFilters } from "./use-report-filters";
import { useOverallCampaignPerformanceStage } from "./use-report-data";
import { parseCampaignNameFilter, resolveEffectiveCampaignScope, LT_CAMPAIGN_META_ACCOUNT_ID } from "@/lib/reporting/campaign-name-filter";

export function CampaignBreakdownPageClient() {
  const params = useSearchParams();
  const { filters, setFilters } = useReportFilters();
  const supported = filters.platform === "meta" || filters.platform === "tiktok";
  const accountId = supported ? (filters.platform === "meta" ? filters.metaAccountId : filters.tiktokAccountId) || filters.accountId : "";
  const query = new URLSearchParams(params.toString());
  query.delete("screenshot");
  if (supported) ["accountId", "metaAccountId", "googleAccountId", "tiktokAccountId"].forEach((key) => query.delete(key));
  if (accountId) query.set(filters.platform === "meta" ? "metaAccountId" : "tiktokAccountId", accountId);
  query.set("platform", filters.platform);
  query.set("startDate", filters.startDate);
  query.set("endDate", filters.endDate);
  const scope = resolveEffectiveCampaignScope({ requestedScope: filters.campaignScope, metaAccountIds: filters.platform === "meta" && accountId ? [accountId] : [] });
  query.set("campaignScope", scope);
  const queryString = query.toString();
  const report = useOverallCampaignPerformanceStage(accountId, queryString, Boolean(accountId));

  return (
    <ReportShell title={report.data?.companyName ? `${report.data.companyName} Campaign Breakdown` : "Campaign Breakdown"} dateLabel={`${filters.startDate} – ${filters.endDate}`} activeQuery={queryString} wideContent
      headerDateControl={<ReportHeaderMonthPicker startDate={filters.startDate} endDate={filters.endDate} onChange={(next) => setFilters(next)} />}
      headerBottomControl={<ReportFiltersBar filters={filters} onApply={(next) => setFilters({ ...next, accountId: "" }, { push: true })} onReset={() => setFilters({ accountId: "", metaAccountId: "", googleAccountId: "", tiktokAccountId: "", platform: "meta" })} allowMultipleAccounts={false} dateMode="month" showDateFilters={false} compact compactToolbar immediateAccountApply />}>
      {!accountId ? <ReportEmptyState title="Choose a Meta or TikTok account" message="Campaign breakdowns are available for Meta and TikTok. Select an account above to view ad set and ad performance." /> : <div className="space-y-4">
        {report.loading ? <AdvancedLoadingPanel title="Loading Campaign Breakdown" message="Retrieving campaign performance..." /> : null}
        {report.error ? <ReportErrorState message={report.error} onRetry={report.retry} /> : null}
        {report.data ? <>
          <ReportWarnings warnings={report.data.warnings} />
          <OverallCampaignGroupsTable groups={report.data.campaignGroups} queryString={`&${queryString}`} enableHierarchy
            campaignNameFilter={parseCampaignNameFilter(params.toString())}
            onCampaignNameFilterChange={(filter) => setFilters({ campaignNameFilterMode: filter?.mode ?? "include", campaignNameFilterValues: filter?.values ?? [] })}
            campaignScope={scope} onCampaignScopeChange={filters.platform === "meta" && accountId === LT_CAMPAIGN_META_ACCOUNT_ID ? (campaignScope) => setFilters({ campaignScope }) : undefined} />
        </> : null}
      </div>}
    </ReportShell>
  );
}
