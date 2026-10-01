"use client";

import { useSearchParams } from "next/navigation";
import { DemandGenSection } from "./demand-gen-section";
import { ReportShell } from "./report-shell";
import { ReportFiltersBar } from "./report-filters-bar";
import { ReportEmptyState } from "./report-state";
import { useReportFilters } from "./use-report-filters";
import { parseCampaignNameFilter } from "@/lib/reporting/campaign-name-filter";

export function DemandGenPageClient() {
  const params = useSearchParams();
  const { filters, setFilters } = useReportFilters({ platform: "google" });
  const isGoogle = filters.platform === "google" || filters.platform === "googleYoutube";
  const accountId = isGoogle ? filters.googleAccountId || filters.accountId : "";
  const query = new URLSearchParams(params.toString());
  query.delete("accountId"); query.delete("metaAccountId"); query.delete("tiktokAccountId");
  query.set("googleAccountId", accountId); query.set("platform", "google");
  query.set("startDate", filters.startDate); query.set("endDate", filters.endDate);
  return <ReportShell title="Demand Gen Analysis" dateLabel={`${filters.startDate} – ${filters.endDate}`} activeQuery={params.toString()} wideContent headerBottomControl={<ReportFiltersBar filters={filters} onApply={(next) => setFilters({ ...next, accountId: "" }, { push: true })} onReset={() => setFilters({ accountId: "", googleAccountId: "", metaAccountId: "", tiktokAccountId: "", platform: "google" })} allowMultipleAccounts={false} dateMode="month" compact immediateAccountApply />}>
    {accountId ? <DemandGenSection queryString={query.toString()} campaignNameFilter={parseCampaignNameFilter(params.toString())} /> : <ReportEmptyState title="Choose a Google Ads account" message="Demand Gen analysis is available for Google Ads accounts. Select one above to view campaign performance." />}
  </ReportShell>;
}
