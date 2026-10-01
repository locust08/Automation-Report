"use client";

import { useCallback, useState } from "react";
import type { DemandGenPayload } from "@/lib/reporting/demand-gen";
import { ReportDownloadButton } from "./screenshot-mode-toggle";
import { ReportHeaderMonthPicker } from "./report-header-month-picker";
import { useSearchParams } from "next/navigation";
import { DemandGenSection } from "./demand-gen-section";
import { ReportShell } from "./report-shell";
import { ReportFiltersBar } from "./report-filters-bar";
import { ReportEmptyState } from "./report-state";
import { useReportFilters } from "./use-report-filters";
import { parseCampaignNameFilter } from "@/lib/reporting/campaign-name-filter";

export function DemandGenPageClient() {
  const [context, setContext] = useState<{ data: DemandGenPayload | null; ready: boolean }>({ data: null, ready: false });
  const onContext = useCallback((data: DemandGenPayload | null, ready: boolean) => setContext({ data, ready }), []);
  const [refresh, setRefresh] = useState(0);
  const params = useSearchParams();
  const { filters, setFilters } = useReportFilters({ platform: "google" });
  const isGoogle = filters.platform === "google" || filters.platform === "googleYoutube";
  const accountId = isGoogle ? filters.googleAccountId || filters.accountId : "";
  const query = new URLSearchParams(params.toString());
  ["screenshot", "campaignId", "metric"].forEach((key) => query.delete(key));
  query.delete("accountId"); query.delete("metaAccountId"); query.delete("tiktokAccountId");
  query.set("googleAccountId", accountId); query.set("platform", "google");
  if (refresh) query.set("refresh", String(refresh));
  query.set("startDate", filters.startDate); query.set("endDate", filters.endDate);
  const title = `${context.data?.account.id === accountId ? context.data.account.name : "Google Ads"} · ${accountId}`;
  return <ReportShell title={title} reportReady={context.ready} headerDateControl={<ReportHeaderMonthPicker startDate={filters.startDate} endDate={filters.endDate} onChange={(next) => setFilters(next)} />} dateLabel={`${filters.startDate} – ${filters.endDate}`} activeQuery={params.toString()} wideContent headerBottomControl={<ReportFiltersBar filters={filters} onApply={(next) => { setRefresh(Date.now()); setFilters({ ...next, accountId: "" }, { push: true }); }} onReset={() => setFilters({ accountId: "", googleAccountId: "", metaAccountId: "", tiktokAccountId: "", platform: "google" })} allowMultipleAccounts={false} dateMode="month" showDateFilters={false} compact compactToolbar immediateAccountApply footerContent={<ReportDownloadButton fileNamePrefix={`${title} Demand Gen`} disabled={!context.ready} />} />}>
    <div data-standalone-report="demand-gen">{accountId ? <DemandGenSection queryString={query.toString()} campaignNameFilter={parseCampaignNameFilter(params.toString())} onContext={onContext} /> : <ReportEmptyState title="Choose a Google Ads account" message="Demand Gen analysis is available for Google Ads accounts. Select one above to view campaign performance." />}</div>
  </ReportShell>;
}
