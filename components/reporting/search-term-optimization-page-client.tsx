"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  Undo2Icon,
} from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  SearchTermDashboardPayload,
  SearchTermOptimizationRecord,
} from "@/lib/search-term-optimization/types";

type FilterKey = "all" | "automatic" | "add_exact" | "review" | "no_action" | "failed";
type AccountSuggestion = { accountName: string; adAccountId: string; country: string | null; notionPageId: string };

export function SearchTermOptimizationPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const accountId = searchParams.get("googleAccountId") ?? searchParams.get("accountId") ?? "";
  const [data, setData] = useState<SearchTermDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reporting/search-terms?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Unable to load results.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load results.");
    } finally {
      setLoading(false);
    }
  }, [accountId, query]);

  useEffect(() => { void load(); }, [load]);

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/reporting/search-terms?${query}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Analysis failed.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  async function saveSettings(automationEnabled: boolean, cadence: SearchTermDashboardPayload["settings"]["cadence"]) {
    if (!data) return;
    setSaving(true);
    try {
      const response = await fetch("/api/reporting/search-terms/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: data.accountId, automationEnabled, cadence }),
      });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "Unable to save settings.");
      setData({ ...data, settings });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function undo(row: SearchTermOptimizationRecord) {
    if (!window.confirm(`Remove the exact negative “${row.searchTerm}” and verify its removal?`)) return;
    const response = await fetch(`/api/reporting/search-terms/${row.id}/undo`, { method: "POST" });
    const updated = await response.json();
    if (!response.ok) { setError(updated.error || "Undo failed."); return; }
    setData((current) => current ? { ...current, rows: current.rows.map((item) => item.id === row.id ? updated : item) } : current);
  }

  const counts = useMemo(() => getCounts(data?.rows ?? []), [data]);
  const visibleRows = useMemo(() => (data?.rows ?? []).filter((row) => matchesFilter(row, filter)), [data, filter]);
  const groups = useMemo(() => groupRows(visibleRows), [visibleRows]);

  return (
    <ReportShell
      title={data?.companyName ?? "Google Search-Term Optimization"}
      dateLabel={dateLabel(data)}
      activeQuery={query}
      reportReady={!loading && !running && !error}
      preHeaderContent={<AccountSearch onSelect={(item) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("googleAccountId", item.adAccountId);
        params.delete("accountId");
        router.push(`/search-term-optimization?${params.toString()}`);
      }} />}
    >
      <div className="space-y-5">
        {!accountId ? <EmptyAccount /> : null}
        {accountId ? (
          <>
            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid gap-1 text-sm text-neutral-600 sm:grid-cols-2 sm:gap-x-8">
                  <p><span className="font-semibold text-neutral-900">CID:</span> {formatCid(accountId)}</p>
                  <p><span className="font-semibold text-neutral-900">Last analysis:</span> {formatDate(data?.latestRun?.completedAt)}</p>
                  <p><span className="font-semibold text-neutral-900">Period:</span> {dateLabel(data)}</p>
                  <p><span className="font-semibold text-neutral-900">Next run:</span> {formatDate(data?.settings.nextRunAt)}</p>
                </div>
                <Button onClick={() => void runAnalysis()} disabled={running || loading} className="bg-red-600 hover:bg-red-700">
                  {running ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  {running ? "Analysing…" : "Run analysis now"}
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-neutral-100 p-4">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={data?.settings.automationEnabled ?? false} disabled={saving || !data}
                    onChange={(event) => void saveSettings(event.target.checked, data?.settings.cadence ?? "off")} />
                  Automatic negative-exact publishing
                </label>
                <select className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" value={data?.settings.cadence ?? "off"} disabled={saving || !data}
                  onChange={(event) => void saveSettings(data?.settings.automationEnabled ?? false, event.target.value as SearchTermDashboardPayload["settings"]["cadence"])}>
                  <option value="off">Manual only</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
                </select>
                <Badge variant={data?.settings.automationEnabled ? "default" : "outline"}>
                  <ShieldCheckIcon /> {data?.settings.automationEnabled ? "Account opt-in enabled" : "Automation off by default"}
                </Badge>
              </div>
            </section>

            {error ? <Notice tone="error" text={error} /> : null}
            {data?.warnings.map((warning) => <Notice key={warning} tone="warning" text={warning} />)}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {([[
                "all", "Total reviewed", counts.all], ["automatic", "Automatically excluded", counts.automatic], ["add_exact", "Add exact recommendations", counts.addExact],
                ["review", "Needs review", counts.review], ["no_action", "No action", counts.noAction], ["failed", "Failed or unverified", counts.failed],
              ] as Array<[FilterKey, string, number]>).map(([key, label, value]) => (
                <button key={key} onClick={() => setFilter(key)} className={`rounded-2xl border p-4 text-left shadow-sm transition ${filter === key ? "border-red-600 bg-red-50 ring-2 ring-red-100" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p>
                </button>
              ))}
            </section>

            {groups.map(([groupName, rows]) => <ResultGroup key={groupName} name={groupName} rows={rows} onUndo={undo} />)}
            {!loading && data?.latestRun && visibleRows.length === 0 ? <div className="rounded-3xl bg-white p-10 text-center text-neutral-500">No results match this category.</div> : null}
            {loading ? <div className="flex justify-center rounded-3xl bg-white p-12"><Loader2Icon className="animate-spin" /></div> : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function AccountSearch({ onSelect }: { onSelect: (item: AccountSuggestion) => void }) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<AccountSuggestion[]>([]);
  useEffect(() => {
    if (value.trim().length < 2) return;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/notion/accounts/search?q=${encodeURIComponent(value)}`);
      if (response.ok) setItems(((await response.json()) as { accounts: AccountSuggestion[] }).accounts);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return <div className="relative rounded-2xl bg-white p-3 shadow-sm">
    <div className="flex items-center gap-3"><SearchIcon className="ml-2 size-5 text-neutral-400" /><Input value={value} onChange={(event) => { setValue(event.target.value); if (event.target.value.trim().length < 2) setItems([]); }} placeholder="Search Notion accounts by company name or CID…" className="border-0 shadow-none focus-visible:ring-0" /></div>
    {value.trim().length >= 2 && items.length ? <div className="absolute left-3 right-3 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border bg-white shadow-xl">{items.map((item) => <button key={item.notionPageId} className="flex w-full justify-between px-4 py-3 text-left hover:bg-neutral-50" onClick={() => { onSelect(item); setValue(item.accountName); setItems([]); }}><span className="font-medium">{item.accountName}</span><span className="font-mono text-sm text-neutral-500">{formatCid(item.adAccountId)}</span></button>)}</div> : null}
  </div>;
}

function ResultGroup({ name, rows, onUndo }: { name: string; rows: SearchTermOptimizationRecord[]; onUndo: (row: SearchTermOptimizationRecord) => void }) {
  const url = rows.find((row) => row.destinationUrl)?.destinationUrl;
  return <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5"><div><h2 className="text-xl font-semibold">{name}</h2><p className="text-sm text-neutral-500">{rows.length} search terms</p></div>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">{url}<ExternalLinkIcon className="size-4" /></a> : <span className="text-sm text-neutral-400">No destination URL</span>}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-sm"><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{["Search term", "Campaign", "Triggering keyword", "Match", "Impr.", "Clicks", "Spend", "Conv.", "Classification", "Safety", "Proposed action", "Explanation"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
      <tbody className="divide-y">{rows.map((row) => <tr key={row.id} className="align-top hover:bg-neutral-50"><td className="px-4 py-4 font-semibold">{row.searchTerm}</td><td className="px-4 py-4">{row.campaignName}</td><td className="px-4 py-4">{row.triggeringKeyword ?? "—"}</td><td className="px-4 py-4">{row.triggeringMatchType ?? "—"}</td><td className="px-4 py-4">{row.impressions}</td><td className="px-4 py-4">{row.clicks}</td><td className="px-4 py-4">RM {row.cost.toFixed(2)}</td><td className="px-4 py-4">{row.conversions}</td><td className="px-4 py-4">{row.classification}</td><td className="px-4 py-4"><ScoreBadge row={row} /></td><td className="px-4 py-4"><Badge variant="outline">{row.proposedAction}</Badge>{row.executionStatus === "verified" ? <Button size="sm" variant="outline" className="mt-2" onClick={() => onUndo(row)}><Undo2Icon />Undo</Button> : null}</td><td className="max-w-md px-4 py-4 text-neutral-600"><p>{row.reason}</p><details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-neutral-700">Score breakdown</summary><ul className="mt-1 space-y-1 text-xs">{row.scoreBreakdown.filter((signal) => signal.applied).map((signal) => <li key={signal.key}>{signal.points > 0 ? "+" : ""}{signal.points}: {signal.label}</li>)}</ul>{row.hardGateFailures.length ? <p className="mt-2 text-xs text-red-700">Blocked: {row.hardGateFailures.join("; ")}</p> : null}</details></td></tr>)}</tbody>
    </table></div>
  </section>;
}

function ScoreBadge({ row }: { row: SearchTermOptimizationRecord }) { const color = row.safetyBand === "auto_safe" ? "bg-emerald-100 text-emerald-800" : row.safetyBand === "review_recommended" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-700"; return <div><span className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${color}`}>{row.safetyScore}/100</span><p className="mt-1 text-xs text-neutral-500">{row.safetyBand.replaceAll("_", " ")}</p></div>; }
function EmptyAccount() { return <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center"><SearchIcon className="mx-auto size-8 text-neutral-400" /><h2 className="mt-3 text-xl font-semibold">Select a Google Ads account</h2><p className="mt-1 text-neutral-500">Use the Notion-backed search above to open its optimization workspace.</p></div>; }
function Notice({ tone, text }: { tone: "error" | "warning"; text: string }) { return <div className={`flex gap-3 rounded-2xl border p-4 ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><AlertTriangleIcon className="size-5 shrink-0" /><p className="text-sm">{text}</p></div>; }
function getCounts(rows: SearchTermOptimizationRecord[]) { return { all: rows.length, automatic: rows.filter((r) => r.executionStatus === "verified").length, addExact: rows.filter((r) => r.proposedAction === "add exact").length, review: rows.filter((r) => r.safetyBand === "review_recommended" || r.proposedAction === "special review needed").length, noAction: rows.filter((r) => r.proposedAction === "no action").length, failed: rows.filter((r) => r.executionStatus === "failed" || r.verificationStatus === "failed" || r.verificationStatus === "missing").length }; }
function matchesFilter(row: SearchTermOptimizationRecord, filter: FilterKey) { if (filter === "all") return true; if (filter === "automatic") return row.executionStatus === "verified"; if (filter === "add_exact") return row.proposedAction === "add exact"; if (filter === "review") return row.safetyBand === "review_recommended" || row.proposedAction === "special review needed"; if (filter === "no_action") return row.proposedAction === "no action"; return row.executionStatus === "failed" || row.verificationStatus === "failed" || row.verificationStatus === "missing"; }
function groupRows(rows: SearchTermOptimizationRecord[]) { const groups = new Map<string, SearchTermOptimizationRecord[]>(); for (const row of rows) groups.set(row.adGroupName || "General", [...(groups.get(row.adGroupName || "General") ?? []), row]); return [...groups.entries()]; }
function formatCid(value: string) { const digits = value.replace(/\D/g, ""); return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : value; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled"; }
function dateLabel(data: SearchTermDashboardPayload | null) { return data?.startDate && data?.endDate ? `${data.startDate} – ${data.endDate}` : "No completed analysis"; }
