"use client";

import { FileCheck2Icon, FileDownIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReportShell } from "@/components/reporting/report-shell";
import type { SearchTermPmReport, SearchTermPmReportList } from "@/lib/search-term-pm-reports/types";

const PAGE_SIZE = 10;

export function SearchTermPmReportsPageClient() {
  const [data, setData] = useState<SearchTermPmReportList | null>(null);
  const [selected, setSelected] = useState<SearchTermPmReport | null>(null);
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (accountId) query.set("accountId", accountId);
    if (startDate) query.set("startDate", startDate);
    if (endDate) query.set("endDate", endDate);
    try {
      const response = await fetch(`/api/search-term-pm-reports?${query}`, { cache: "no-store" });
      const payload = await response.json() as SearchTermPmReportList & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load PM reports.");
      setData(payload);
      setSelected((current) => current && payload.reports.some((report) => report.id === current.id) ? current : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load PM reports."); }
    finally { setLoading(false); }
  }, [accountId, endDate, page, startDate]);

  useEffect(() => { void loadList(); }, [loadList]);

  const openReport = async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/search-term-pm-reports/${id}`, { cache: "no-store" });
      const payload = await response.json() as SearchTermPmReport & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to open report.");
      setSelected(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to open report."); }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const dateLabel = selected ? `Verified ${formatDate(selected.verifiedAt)}` : "Verified platform changes";
  const accountOptions = useMemo(() => data?.accounts ?? [], [data]);

  return <ReportShell title="Search-Term PM Reports" dateLabel={dateLabel} reportReady={!loading}>
    <div className="space-y-5 text-neutral-950">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-red-50 p-3 text-[#df001b]"><FileCheck2Icon className="size-6" /></div>
          <div><h2 className="text-2xl font-semibold">Verified optimization reports</h2><p className="mt-1 text-sm text-neutral-500">A concise record of search-term exclusions that were published and verified in Google Ads.</p></div>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <Filter label="ACCOUNT"><select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(0); }} className={inputClass}><option value="">All accounts</option>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Filter>
        <Filter label="PUBLISHED FROM"><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(0); }} className={inputClass} /></Filter>
        <Filter label="PUBLISHED TO"><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(0); }} className={inputClass} /></Filter>
      </section>

      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <LoadingPanel /> : !data?.reports.length ? <EmptyPanel /> : <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-xl font-semibold">Report history</h2><p className="text-sm text-neutral-500">Immutable snapshots of verified Google Ads changes.</p></div><span className="rounded-full border px-3 py-1 text-sm">{data.total} reports</span></div>
        <div className="divide-y">{data.reports.map((report) => <div key={report.id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-red-50/60"><div className="min-w-0"><p className="truncate font-semibold">{report.customerName}</p><p className="text-sm text-neutral-500">CID {formatCid(report.googleCustomerId)} · {report.itemCount} exclusions · {formatDate(report.publishedAt)}</p></div><div className="flex shrink-0 items-center gap-2"><a href={`/api/search-term-pm-reports/${report.id}/pdf`} download style={{ backgroundColor: "#df001b" }} className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-semibold text-white shadow-sm transition hover:brightness-90"><FileDownIcon className="size-4" />Generate report</a><button type="button" onClick={() => selected?.id === report.id ? setSelected(null) : void openReport(report.id)} className="cursor-pointer rounded-xl border border-neutral-200 px-4 py-2 font-semibold transition hover:border-red-200 hover:bg-red-50 hover:text-[#df001b]">{selected?.id === report.id ? "Close report" : "View report"}</button></div></div>)}</div>
        <div className="flex items-center justify-between border-t px-5 py-4"><span className="text-sm text-neutral-500">Page {page + 1} of {totalPages}</span><div className="flex gap-2"><Pager disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Pager><Pager disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Pager></div></div>
      </section>}

      {selected ? <ReportDetails report={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  </ReportShell>;
}

function ReportDetails({ report, onClose }: { report: SearchTermPmReport; onClose: () => void }) {
  const cards = [["Published exclusions", report.itemCount], ["Affected campaigns", report.affectedCampaignCount], ["Spend reviewed", `RM ${report.totalSpend.toFixed(2)}`], ["Clicks / conversions", `${report.totalClicks} / ${report.totalConversions.toFixed(2)}`]];
  return <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Verified</span><h2 className="mt-2 text-2xl font-semibold">{report.customerName}</h2><p className="text-sm text-neutral-500">CID {formatCid(report.googleCustomerId)} · Published by {report.publishedByEmail}</p><p className="mt-1 text-sm text-neutral-500">Reporting period: {report.reportingStartDate || "Unknown"} to {report.reportingEndDate || "Unknown"} · Verified {formatDate(report.verifiedAt)}</p></div><div className="flex gap-2"><a href={`/api/search-term-pm-reports/${report.id}/pdf`} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#df001b] px-4 py-2.5 font-semibold text-white transition hover:bg-[#b80016]"><FileDownIcon className="size-4" />Download PDF</a><button type="button" onClick={onClose} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 font-semibold transition hover:bg-neutral-100"><XIcon className="size-4" />Close</button></div></div>
    <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border bg-neutral-50 p-4"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <div className="overflow-x-auto border-t"><table className="w-full min-w-[1050px] text-left"><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{["Excluded search term","Campaign / ad group","Match type","Classification / reason","Spend","Clicks","Conv."].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{report.items.map((item) => <tr key={item.id} className="align-top"><td className="px-4 py-4 font-semibold">{item.searchTerm}</td><td className="px-4 py-4"><p>{item.campaignName}</p><p className="text-sm text-neutral-500">{item.adGroupName}</p></td><td className="px-4 py-4">{item.negativeMatchType}</td><td className="max-w-sm px-4 py-4"><p className="font-medium">{item.classification}</p><p className="mt-1 text-sm text-neutral-500">{item.reason}</p></td><td className="px-4 py-4">RM {item.spend.toFixed(2)}</td><td className="px-4 py-4">{item.clicks}</td><td className="px-4 py-4">{item.conversions.toFixed(2)}</td></tr>)}</tbody></table></div>
  </section>;
}

function EmptyPanel() { return <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm"><FileCheck2Icon className="mx-auto size-9 text-neutral-300" /><h2 className="mt-3 text-xl font-semibold">No verified post-optimization reports are available.</h2><p className="mt-1 text-sm text-neutral-500">A report will appear after a published search-term change set is successfully verified.</p></section>; }
function LoadingPanel() { return <section role="status" className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#df001b]" /></div><p className="mt-3 text-sm text-neutral-500">Loading verified reports…</p></section>; }
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-semibold text-neutral-500">{label}</span>{children}</label>; }
function Pager({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" disabled={disabled} onClick={onClick} className="cursor-pointer rounded-lg border px-3 py-2 text-sm transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
const inputClass = "h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-red-400";
function formatDate(value: string) { const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-MY", { dateStyle: "medium" }).format(date); }
function formatCid(value: string) { const digits = value.replace(/\D/g, ""); return digits.length === 10 ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` : value; }
