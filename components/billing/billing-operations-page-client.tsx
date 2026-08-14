"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import {
  AlertTriangleIcon,
  Building2Icon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { BillingChecklistItem, BillingCompanySummary, BillingPicOption, BillingReportResponse } from "@/lib/billing/types";

const SECTION_LABELS: Record<string, string> = {
  no_spend: "No Spend",
  post_billing_spend: "Spend After Billing End",
  post_billing_warning: "Verification Warning",
  pacing: "Spend Pacing",
  no_conversion: "No Conversion",
  cpl: "CPL Alert",
  score: "Score",
};

type LoadState = "loading" | "ready" | "error";

export function BillingOperationsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<BillingReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("company") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "unresolved");
  const [platformFilter, setPlatformFilter] = useState(searchParams.get("platform") ?? "all");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") ?? "all");
  const [pageSizeFilter, setPageSizeFilter] = useState(searchParams.get("pageSize") ?? "25");
  const query = searchParams.toString();

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch(`/api/billing${query ? `?${query}` : ""}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as BillingReportResponse | { message?: string } | null;
      if (!response.ok || !payload || !("companies" in payload)) {
        throw new Error(payload && "message" in payload ? payload.message : "Unable to load Billing Operations.");
      }
      setData(payload);
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Billing Operations.");
      setState("error");
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const applied = new URLSearchParams(query);
    setSearch(applied.get("company") ?? "");
    setStatusFilter(applied.get("status") ?? "unresolved");
    setPlatformFilter(applied.get("platform") ?? "all");
    setCategoryFilter(applied.get("category") ?? "all");
    setPageSizeFilter(applied.get("pageSize") ?? "25");
  }, [query]);

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!("page" in updates)) next.delete("page");
    router.push(`/billing${next.size ? `?${next.toString()}` : ""}`);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    updateParams({
      company: search.trim() || null,
      status: statusFilter === "unresolved" ? null : statusFilter,
      platform: platformFilter === "all" ? null : platformFilter,
      category: categoryFilter === "all" ? null : categoryFilter,
      pageSize: pageSizeFilter === "25" ? null : pageSizeFilter,
    });
  }

  function handleItemUpdated(itemKey: string, changes: { checked?: boolean; remark?: string }) {
    setData((current) => {
      if (!current) return current;
      let checkedDelta = 0;
      const companies = current.companies.map((company) => {
        const existing = company.items.find((item) => item.itemKey === itemKey);
        if (!existing) return company;
        if (typeof changes.checked === "boolean" && changes.checked !== existing.checked) checkedDelta = changes.checked ? 1 : -1;
        return {
          ...company,
          unresolvedIssues: company.unresolvedIssues - checkedDelta,
          items: company.items.map((item) => item.itemKey === itemKey ? { ...item, ...changes } : item),
        };
      });
      return {
        ...current,
        companies,
        summary: {
          ...current.summary,
          unresolved: current.summary.unresolved - checkedDelta,
          completed: current.summary.completed + checkedDelta,
        },
      };
    });
  }

  function handlePicUpdated(companyId: string, picName: string | null) {
    setData((current) => current ? {
      ...current,
      companies: current.companies.map((company) => company.companyId === companyId ? { ...company, picName } : company),
    } : current);
  }

  const dateLabel = data?.report
    ? `Daily snapshot · ${formatDate(data.report.date)}`
    : "Daily billing snapshot";

  return (
    <ReportShell title="Billing Operations" dateLabel={dateLabel} activeQuery="" reportReady={state === "ready"}>
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Companies" value={data?.summary.companies ?? 0} icon={Building2Icon} />
          <SummaryCard label="All issues" value={data?.summary.issues ?? 0} icon={CircleAlertIcon} />
          <SummaryCard label="Unresolved" value={data?.summary.unresolved ?? 0} icon={AlertTriangleIcon} tone="danger" />
          <SummaryCard label="Completed" value={data?.summary.completed ?? 0} icon={CheckCircle2Icon} tone="success" />
          <SummaryCard label="Warnings" value={data?.summary.warnings ?? 0} icon={CircleAlertIcon} tone="warning" />
        </section>

        <section className="rounded-2xl border border-[#d7d7d7] bg-white p-4 shadow-sm">
          <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" onSubmit={submitSearch}>
            <div className="relative min-w-0 flex-[1_1_280px]">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search company or account ID" />
            </div>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[['unresolved','Unresolved',data?.facets?.status.unresolved],['completed','Completed',data?.facets?.status.completed],['all','All statuses']]} />
            <FilterSelect label="Platform" value={platformFilter} onChange={setPlatformFilter} options={[['all','All platforms'],['meta','Meta',data?.facets?.platform.meta],['google','Google',data?.facets?.platform.google]]} />
            <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[['all','All categories'], ...Object.entries(SECTION_LABELS).map(([key, text]) => [key, text, data?.facets?.category[key]] as FilterOption)]} />
            <FilterSelect label="Rows" value={pageSizeFilter} onChange={setPageSizeFilter} options={[['25','25 companies'],['50','50 companies'],['100','100 companies']]} />
            <Button type="submit" className="w-full px-6 sm:w-auto">Apply</Button>
          </form>
          {data?.report ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Generated {formatDateTime(data.report.generatedAt)} · {data.report.scannedCount} billing records scanned
            </p>
          ) : null}
        </section>

        {state === "loading" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error ?? "Unable to load."} retry={() => void load()} /> : null}
        {state === "ready" && data?.companies.length === 0 ? <EmptyState hasReport={Boolean(data.report)} /> : null}
        {state === "ready" && data ? (
          <section className="space-y-3">
            {data.companies.map((company) => <CompanyCard key={company.companyId} company={company} picOptions={data.picOptions} onItemUpdated={handleItemUpdated} onPicUpdated={handlePicUpdated} />)}
            <Pagination data={data} onPage={(page) => updateParams({ page: page === 1 ? null : String(page) })} />
          </section>
        ) : null}
      </div>
    </ReportShell>
  );
}

function SummaryCard({ label, value, icon: Icon, tone = "default" }: { label: string; value: number; icon: typeof Building2Icon; tone?: "default" | "danger" | "success" | "warning" }) {
  const tones = { default: "text-[#8f0018] bg-[#fff3f4]", danger: "text-red-700 bg-red-50", success: "text-emerald-700 bg-emerald-50", warning: "text-amber-700 bg-amber-50" };
  return <div className="flex items-center gap-3 rounded-2xl border border-[#d7d7d7] bg-white p-4 shadow-sm"><span className={`rounded-xl p-2 ${tones[tone]}`}><Icon className="size-5" /></span><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div></div>;
}

type FilterOption = [key: string, label: string, count?: number];

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void }) {
  const selected = options.find(([key]) => key === value) ?? [value, value, undefined];
  const contentWidth = Math.max(14, selected[1].length + 9);
  return <div className="w-full min-w-0 sm:w-auto"><span className="sr-only">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} style={{ width: `${contentWidth}ch`, maxWidth: "100%" }} className="bg-white"><span className="flex min-w-0 flex-1 items-center justify-between gap-3"><span className="truncate">{selected[1]}</span>{typeof selected[2] === "number" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{selected[2]}</span> : null}</span></SelectTrigger><SelectContent position="popper" align="start">{options.map(([key, text, count]) => <SelectItem key={key} value={key}><span className="flex min-w-44 items-center justify-between gap-6"><span>{text}</span>{typeof count === "number" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span> : null}</span></SelectItem>)}</SelectContent></Select></div>;
}

function CompanyCard({ company, picOptions, onItemUpdated, onPicUpdated }: { company: BillingCompanySummary; picOptions: BillingPicOption[]; onItemUpdated: (itemKey: string, changes: { checked?: boolean; remark?: string }) => void; onPicUpdated: (companyId: string, picName: string | null) => void }) {
  const [assigning, setAssigning] = useState(false);
  const [picError, setPicError] = useState<string | null>(null);
  async function assignPic(picKey: string) {
    const reportDate = company.items[0]?.reportDate;
    if (!reportDate || company.accountKeys.length === 0) return;
    setAssigning(true); setPicError(null);
    try {
      const response = await fetch(`/api/billing/companies/${encodeURIComponent(company.companyId)}/pic`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, accountKeys: company.accountKeys, picKey }),
      });
      if (!response.ok) throw new Error("Unable to assign PIC.");
      onPicUpdated(company.companyId, picOptions.find((option) => option.key === picKey)?.name ?? null);
      posthog.capture("billing_pic_assigned", {
        platform_count: company.platforms.length,
        account_count: company.accountIds.length,
        assignment_cleared: !picKey,
      });
    } catch (error) {
      setPicError(error instanceof Error ? error.message : "Unable to assign PIC.");
    } finally { setAssigning(false); }
  }
  return <details className="group overflow-hidden rounded-2xl border border-[#d7d7d7] bg-white shadow-sm">
    <summary className="grid cursor-pointer list-none gap-3 p-4 hover:bg-[#fffafa] sm:grid-cols-[minmax(220px,1fr)_auto_auto_auto] sm:items-center">
      <div><h2 className="font-semibold">{company.companyName}</h2><div className="mt-1 flex flex-wrap gap-1.5">{company.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}<span className="text-xs text-muted-foreground">{company.accountIds.length} account{company.accountIds.length === 1 ? "" : "s"}</span></div></div>
      <Metric label="Unresolved" value={company.unresolvedIssues} danger={company.unresolvedIssues > 0} />
      <Metric label="Warnings" value={company.warningIssues} danger={company.warningIssues > 0} />
      <Metric label="Post-end spend" value={formatCurrency(company.combinedPostBillingSpend)} danger={company.combinedPostBillingSpend > 0} />
    </summary>
    <div className="border-t bg-[#fafafa] p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-[#e1e1e1] bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {company.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}
          {company.accountIds.map((accountId) => <span key={accountId} className="font-mono text-xs font-semibold text-[#3f3f46]">{accountId}</span>)}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm"><span className="text-muted-foreground">PIC</span><select aria-label={`PIC for ${company.companyName}`} disabled={assigning || company.accountKeys.length === 0} value={picOptions.find((option) => option.name === company.picName)?.key ?? ""} onChange={(event) => void assignPic(event.target.value)} className="h-9 rounded-md border border-input bg-white px-3"><option value="">Unassigned</option>{picOptions.map((option) => <option value={option.key} key={option.key}>{option.name}</option>)}</select></div>
      </div>
      {picError ? <p className="mb-2 text-xs text-red-700">{picError}</p> : null}
      <div className="space-y-3">{company.items.map((item) => <ChecklistItem key={item.itemKey} item={item} onUpdated={onItemUpdated} />)}</div>
    </div>
  </details>;
}

function PlatformBadge({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();
  const isMeta = normalized.includes("meta") || normalized.includes("facebook");
  const isGoogle = normalized.includes("google");
  return <Badge variant="outline" className="gap-1.5 bg-white">
    {isMeta ? <span className="flex h-3.5 w-4 shrink-0 items-center overflow-hidden" aria-hidden="true"><Image src="/MetaLogo.png" alt="" width={118} height={46} className="h-3.5 w-auto max-w-none" /></span> : null}
    {isGoogle ? <Image src="/google-ads-logo.svg" alt="" width={14} height={14} className="size-3.5 shrink-0 rounded-[2px]" aria-hidden="true" /> : null}
    <span>{platform}</span>
  </Badge>;
}

function Metric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return <div className="min-w-0 sm:min-w-20"><p className="whitespace-nowrap text-[9px] uppercase tracking-[0.04em] text-muted-foreground sm:text-[10px]">{label}</p><p className={`whitespace-nowrap text-sm font-semibold tabular-nums sm:text-[15px] ${danger ? "text-red-700" : ""}`}>{value}</p></div>;
}

function ChecklistItem({ item, onUpdated }: { item: BillingChecklistItem; onUpdated: (itemKey: string, changes: { checked?: boolean; remark?: string }) => void }) {
  const [checked, setChecked] = useState(item.checked);
  const [remark, setRemark] = useState(item.remark);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const detail = itemDetail(item);

  async function save(input: { checked?: boolean; remark?: string }) {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/billing/items/${encodeURIComponent(item.itemKey)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportDate: item.reportDate, ...input }) });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save.");
      onUpdated(item.itemKey, input);
      posthog.capture("billing_checklist_item_updated", {
        section_key: item.sectionKey,
        update_type: typeof input.checked === "boolean" ? "completion" : "remark",
        checked: input.checked,
      });
    } catch (error) {
      if (typeof input.checked === "boolean") setChecked(item.checked);
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    }
    finally { setSaving(false); }
  }

  const adAccountUrl = getAdAccountUrl(item);
  return <div>
  <article className={`rounded-xl border p-3 sm:p-4 ${checked ? "border-emerald-200 bg-emerald-50/40" : "border-[#dedede] bg-white"}`}>
    <div className="flex flex-col gap-3">
      <label className="flex min-w-0 flex-1 items-start gap-3"><input type="checkbox" checked={checked} disabled={saving} onChange={(event) => { const next = event.target.checked; setChecked(next); void save({ checked: next }); }} className="mt-1 size-4 accent-red-700" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><Badge variant={item.sectionKey === "post_billing_warning" ? "destructive" : "secondary"}>{SECTION_LABELS[item.sectionKey] ?? item.sectionKey}</Badge><strong className="text-sm">{item.payload.invoiceNo || "Untitled"}</strong>{item.payload.contractStatus ? <span className="text-xs text-muted-foreground">{item.payload.contractStatus}</span> : null}</span><span className="mt-2 block w-full text-sm leading-6 text-[#454545]">{detail}</span></span></label>
      <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-[#ececec] pt-3 sm:flex-row"><Input value={remark} disabled={saving} onChange={(event) => setRemark(event.target.value)} placeholder="Add a remark" onKeyDown={(event) => { if (event.key === "Enter") void save({ remark }); }} /><Button type="button" variant="outline" disabled={saving || remark === item.remark} onClick={() => void save({ remark })}>{saving ? <Loader2Icon className="size-4 animate-spin" /> : "Save remark"}</Button></div>
    </div>{message ? <p className="mt-2 text-xs text-red-700">{message}</p> : null}
  </article>
  <div className="mt-1.5 flex flex-wrap justify-end gap-3 px-1">
    {adAccountUrl ? <a href={adAccountUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9f0019] hover:underline">Open ad account <ExternalLinkIcon className="size-3.5" /></a> : null}
    {item.payload.url ? <a href={item.payload.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555] hover:underline">Open billing record <ExternalLinkIcon className="size-3.5" /></a> : null}
  </div>
  </div>;
}

function getAdAccountUrl(item: BillingChecklistItem): string | null {
  const direct = item.payload.accountUrls?.find(Boolean);
  if (direct) return direct;
  const accountId = item.payload.accountIds?.[0]?.replace(/\D/g, "");
  if (!accountId) return null;
  const platform = item.payload.platformNames?.[0]?.toLowerCase() ?? "";
  if (platform.includes("meta") || platform.includes("facebook")) return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(accountId)}`;
  if (platform.includes("google")) return `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(accountId)}`;
  return null;
}

function itemDetail(item: BillingChecklistItem) {
  const p = item.payload;
  if (item.sectionKey === "post_billing_spend") return `Spend detected after billing ended: ${formatCurrency(p.combinedSpend ?? 0)}${p.checkedDates?.length ? ` across ${p.checkedDates.join(", ")}` : ""}.`;
  if (item.sectionKey === "post_billing_warning") return p.verificationError ?? "Unable to verify post-billing spend.";
  if (item.sectionKey === "pacing") return `Spend pacing ${formatPercent(p.spentPacing)}.`;
  if (item.sectionKey === "no_spend") return `No spend detected on ${(p.noSpendFlags ?? []).join(" and ") || "the monitored days"}.`;
  if (item.sectionKey === "no_conversion") return `No conversions detected on ${(p.noConvFlags ?? []).join(" and ") || "the monitored days"}.`;
  if (item.sectionKey === "cpl") return `CPL ${p.cpl ?? "n/a"}.`;
  if (item.sectionKey === "score") return `Performance score ${p.score ?? "n/a"}.`;
  return "Billing issue requires review.";
}

function Pagination({ data, onPage }: { data: BillingReportResponse; onPage: (page: number) => void }) {
  const { page, totalPages, totalCompanies } = data.pagination;
  return <div className="flex items-center justify-end gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-sm"><span className="mr-2 text-muted-foreground">Page {page} of {totalPages} · {totalCompanies} companies</span><Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeftIcon className="size-4" /></Button><Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRightIcon className="size-4" /></Button></div>;
}

function LoadingState() { return <div className="flex min-h-48 items-center justify-center rounded-2xl bg-white"><Loader2Icon className="mr-2 size-5 animate-spin" /> Loading the daily billing snapshot…</div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-semibold text-red-800">Billing Operations is unavailable</h2><p className="mt-1 text-sm text-red-700">{message}</p><Button className="mt-4" variant="outline" onClick={retry}>Try again</Button></div>; }
function EmptyState({ hasReport }: { hasReport: boolean }) { return <div className="rounded-2xl bg-white p-8 text-center shadow-sm"><CheckCircle2Icon className="mx-auto size-8 text-emerald-600" /><h2 className="mt-3 font-semibold">{hasReport ? "No companies match these filters" : "No daily snapshot is available"}</h2><p className="mt-1 text-sm text-muted-foreground">{hasReport ? "Change the filters to view other checklist items." : "The scheduled billing worker must generate the first report."}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${value}T00:00:00+08:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value)); }
function formatCurrency(value: number) { return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number | null | undefined) { return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a"; }
