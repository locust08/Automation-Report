"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatFocusedSitelinkAuditValue } from "@/lib/ads-management/sitelink-display";
import { formatAdsManagementUserError } from "@/lib/ads-management/user-error";
import type { AdsChangeSetRecord, AdsFieldChangeRecord } from "@/lib/ads-management/types";

export function AccountHistoryPanel({ accountId, accountName, onResumeRequest }: { accountId: string; accountName: string; onResumeRequest?: (request: AdsChangeSetRecord) => void }) {
  const [items, setItems] = useState<AdsChangeSetRecord[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState("");

  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/ads-management/change-requests?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setItems(payload.requests); })
      .catch((cause) => setError(formatAdsManagementUserError(cause, "Unable to load change history. Please try again later.")))
      .finally(() => setLoading(false));
  }, [accountId]);

  const shown = useMemo(() => items.filter((item) => (status === "all" || item.status === status) && `${item.title} ${item.created_by_name}`.toLowerCase().includes(query.toLowerCase())), [items, query, status]);

  return <div className="space-y-5">
    <section className="rounded-2xl border bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-red-700">Google Ads</p><h2 className="mt-1 text-3xl font-semibold">Change history</h2><p className="mt-2 text-sm text-slate-600">Every draft, conflict, publication, verification, retry, and revert for {accountName}.</p></section>
    {error && items.length > 0 ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    <section className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2"><Input aria-label="Search change history" placeholder="Search title or creator" value={query} onChange={(event) => setQuery(event.target.value)} /><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full" aria-label="Filter history by status"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Array.from(new Set(items.map((item) => item.status))).map((itemStatus) => <SelectItem key={itemStatus} value={itemStatus} className="capitalize">{itemStatus.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm">
        <thead className="bg-slate-50">
        <tr><th className="p-3">Request</th>
          <th className="p-3 text-center">Status</th>
          <th className="p-3 text-center">Changed by</th>
          <th className="p-3 text-center">Updated</th>
        </tr>
        </thead>
        <tbody>{shown.map((item) =>
        { const editable = ["draft", "validation_failed", "conflict_detected"].includes(item.status);
          return <tr key={item.id} className="border-t align-middle hover:bg-red-50/40">
          <td className="px-3 py-4">
            <button type="button" className="inline-flex items-center text-left font-medium text-red-700 hover:underline" onClick={() => setSelectedRequestId(item.id)}>
              {editable ? "View draft: " : "View request: "}{item.title}
            </button>
          </td>
          <td className="px-3 py-4 text-center capitalize">{item.status.replaceAll("_", " ")}</td>
          <td className="px-3 py-4 text-center">{item.created_by_name}</td>
          <td className="whitespace-nowrap px-3 py-4 text-center">{new Date(item.updated_at).toLocaleString()}</td>
          </tr>; })}</tbody>
      </table>
      </div>{loading ? <p className="p-8 text-center text-slate-500">Loading change history…</p> : !shown.length ? <p className="p-8 text-center text-slate-500">No change requests found for this account.</p> : null}</section>
    {selectedRequestId ? <ChangeRequestHistoryDrawer id={selectedRequestId} onClose={() => setSelectedRequestId("")} onResume={onResumeRequest ? (request) => { setSelectedRequestId(""); onResumeRequest(request); } : undefined} /> : null}
  </div>;
}

function ChangeRequestHistoryDrawer({ id, onClose, onResume }: { id: string; onClose: () => void; onResume?: (request: AdsChangeSetRecord) => void }) {
  const [request, setRequest] = useState<AdsChangeSetRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/ads-management/change-requests/${id}`, { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); if (active) setRequest(payload); })
      .catch((cause) => { if (active) setError(formatAdsManagementUserError(cause, "Unable to load the change request. Please try again later.")); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  const editable = request && ["draft", "validation_failed", "conflict_detected"].includes(request.status);
  return <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="history-request-title">
    <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" aria-label="Close change request details" onClick={onClose} />
    <aside className="relative z-10 flex h-full w-full max-w-[980px] flex-col bg-slate-50 shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b bg-white p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-red-700">Change request</p><h2 id="history-request-title" className="mt-1 text-2xl font-semibold">{request?.title || "Loading request…"}</h2>{request ? <p className="mt-1 text-sm text-slate-500">{request.status.replaceAll("_", " ")} · changed by {request.created_by_name} · version {request.version}</p> : null}</div><Button type="button" size="icon" variant="ghost" aria-label="Close change request details" onClick={onClose}><XIcon /></Button></header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : !request ? <p className="p-8 text-center text-slate-500">Loading change request…</p> : <>
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b px-4 py-3"><h3 className="font-semibold">Changes</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Entity / field</th><th className="p-3">Original</th><th className="p-3">Latest Google</th><th className="p-3">Proposed</th><th className="p-3">Result</th></tr></thead><tbody>{(request.ads_field_changes ?? []).map((change) => <tr key={change.id} className="border-t align-top"><td className="p-3"><strong>{change.entity_name}</strong><div className="text-slate-500">{change.field_label}</div></td><td className="whitespace-pre-wrap bg-red-50 p-3 font-mono text-red-800">{historyChangeValue(change, change.baseline_value)}</td><td className="whitespace-pre-wrap p-3 font-mono">{historyChangeValue(change, change.latest_official_value)}</td><td className="whitespace-pre-wrap bg-green-50 p-3 font-mono text-green-800">{historyChangeValue(change, change.proposed_value)}</td><td className="p-3"><span>{change.publish_status}</span><div className="text-xs text-slate-500">Verification: {change.verification_status}</div></td></tr>)}</tbody></table></div></section>
          <section className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="font-semibold">Activity history</h3><ol className="mt-3 space-y-3">{(request.ads_change_events ?? []).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).map((event) => <li key={String(event.id)} className="border-l-2 pl-3 text-sm"><strong>{String(event.message)}</strong><div className="text-slate-500">{String(event.actor_name)} · {new Date(String(event.created_at)).toLocaleString()}</div></li>)}</ol></section>
        </>}
      </div>
      <footer className="flex justify-end gap-2 border-t bg-white p-4"><Button type="button" variant="outline" onClick={onClose}>Close</Button>{editable && onResume && request ? <Button type="button" onClick={() => onResume(request)}>Resume editing</Button> : null}</footer>
    </aside>
  </div>;
}

function historyChangeValue(change: AdsFieldChangeRecord, value: unknown) {
  if (value == null) return "—";
  if (change.value_type === "money_micros") { const amount = Number(value) / 1_000_000; return `MYR ${Number.isFinite(amount) ? amount.toFixed(2) : "—"}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`; }
  if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${String((item as { text?: unknown }).text ?? "")}`).join("\n");
  if (change.value_type === "sitelinks") return formatFocusedSitelinkAuditValue(change.baseline_value, change.proposed_value, value);
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function HistoryPageClient() {
  const params = useSearchParams();
  const accountId = params.get("accountId") || "";
  const accountName = params.get("accountName") || `Account ${accountId}`;
  if (!accountId) return <main className="p-8">Select an account before opening history.</main>;
  return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-6xl space-y-5"><header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-5"><div><p className="text-sm text-slate-500">Account change history</p><h1 className="text-2xl font-semibold">{accountName}</h1><p className="text-sm text-slate-500">{accountId}</p></div><Button asChild variant="outline"><Link href={`/manage?platform=google&accountId=${encodeURIComponent(accountId)}&accountName=${encodeURIComponent(accountName)}&view=change_requests`}>Back to management</Link></Button></header><AccountHistoryPanel accountId={accountId} accountName={accountName} /></div></main>;
}
