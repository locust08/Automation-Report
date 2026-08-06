"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, ArrowUpRightIcon, CheckCircle2Icon, Clock3Icon, FlagIcon, HistoryIcon, LoaderCircleIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import type { MonitoringActivity, MonitoringItem, MonitoringPriority, TeamLeadMonitoringPayload } from "@/lib/team-lead-monitoring/types";

const PAGE_SIZE = 10;
const summaryCards: Array<[keyof TeamLeadMonitoringPayload["summary"], string]> = [
  ["pendingFirstReview", "Awaiting first review"], ["pendingApproval", "Awaiting final approval"],
  ["returned", "Returned for clarification"], ["approved", "Approved / ready"],
  ["negativeOrRejected", "Negative / rejected"], ["escalated", "Escalated"], ["failed", "Failed"],
];

export function TeamLeadMonitoringPageClient({ role }: { role: string }) {
  const [data, setData] = useState<TeamLeadMonitoringPayload | null>(null);
  const [activities, setActivities] = useState<MonitoringActivity[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState("all");
  const [module, setModule] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [selected, setSelected] = useState<MonitoringItem | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/team-lead-monitoring", { cache: "no-store" });
      const payload = await response.json() as TeamLeadMonitoringPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load monitoring data.");
      setData(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load monitoring data."); }
    finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    const response = await fetch(`/api/team-lead-monitoring/history?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`, { cache: "no-store" });
    const payload = await response.json() as { activities?: MonitoringActivity[]; total?: number; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load activity history.");
    setActivities(payload.activities ?? []); setHistoryTotal(payload.total ?? 0);
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { void loadHistory(historyPage).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load history.")); }, [historyPage, loadHistory]);

  const statuses = useMemo(() => [...new Set((data?.items ?? []).map((item) => item.status))].sort(), [data]);
  const filtered = useMemo(() => {
    const cutoff = dateRange === "all" ? 0 : Date.now() - Number(dateRange) * 86_400_000;
    return (data?.items ?? []).filter((item) =>
      (account === "all" || item.accountId === account) && (module === "all" || item.module === module) &&
      (priority === "all" || item.priority === priority) && (status === "all" || item.status === status) &&
      (!cutoff || new Date(item.updatedAt).getTime() >= cutoff));
  }, [account, data, dateRange, module, priority, status]);

  async function escalate() {
    if (!selected || !note.trim()) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/team-lead-monitoring/escalations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module: selected.module, sourceId: selected.sourceId, accountId: selected.accountId, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to escalate this record.");
      setSelected(null); setNote(""); await Promise.all([loadDashboard(), loadHistory(0)]); setHistoryPage(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to escalate this record."); }
    finally { setSaving(false); }
  }

  async function resolve(item: MonitoringItem) {
    if (!item.escalation) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/team-lead-monitoring/escalations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ escalationId: item.escalation.id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to resolve this escalation.");
      await Promise.all([loadDashboard(), loadHistory(0)]); setHistoryPage(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resolve this escalation."); }
    finally { setSaving(false); }
  }

  return <ReportShell title="Team Lead Monitoring" dateLabel="Agency-wide oversight" reportReady={!loading && Boolean(data)}>
    <div className="space-y-5 text-neutral-950">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="mb-2 flex flex-wrap gap-2"><Badge>Team Lead oversight</Badge><Badge tone="green">{role === "admin" ? "Administrator" : "Team Lead"} · Monitor access</Badge></div><h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Optimization operations</h2><p className="mt-2 text-sm text-neutral-500">High-impact risks, workflow progress, and completed activity across Search Terms and Placements.</p></div>
          <ShieldAlertIcon className="size-14 text-red-600" />
        </div>
      </section>

      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <section className="rounded-2xl border bg-white p-8 shadow-sm"><div className="flex items-center gap-3"><LoaderCircleIcon className="size-5 animate-spin text-red-600"/><span>Loading monitoring activity…</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-red-600" /></div></section> : null}

      {data ? <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{summaryCards.map(([key, label]) => <div key={key} className="min-h-28 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase leading-5 text-neutral-500">{label}</p><p className="mt-3 text-3xl font-semibold">{data.summary[key]}</p></div>)}</section>
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Filter label="Account" value={account} onChange={setAccount} options={[["all","All accounts"],...data.accounts.map((entry):[string,string]=>[entry.id,entry.name])]} /><Filter label="Module" value={module} onChange={setModule} options={[["all","All modules"],["search_term","Search terms"],["placement","Placements"]]} /><Filter label="Priority" value={priority} onChange={setPriority} options={[["all","All priorities"],["critical","Critical"],["high","High"],["medium","Medium"],["normal","Normal"]]} /><Filter label="Status" value={status} onChange={setStatus} options={[["all","All statuses"],...statuses.map((entry):[string,string]=>[entry,formatStatus(entry)])]} /><Filter label="Activity" value={dateRange} onChange={setDateRange} options={[["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]]} /></div></section>

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h3 className="text-xl font-semibold">Priority monitoring queue</h3><p className="text-sm text-neutral-500">Escalations and highest-impact issues appear first.</p></div><Badge>{filtered.length} records</Badge></div><MonitoringTable items={filtered} onEscalate={setSelected} onResolve={resolve} saving={saving}/></section>

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b p-5"><HistoryIcon className="size-5 text-red-600"/><div><h3 className="text-xl font-semibold">Recent workflow activity</h3><p className="text-sm text-neutral-500">Meaningful review, approval, return, and escalation events.</p></div></div><ActivityTimeline activities={activities}/><div className="flex items-center justify-between border-t p-4 text-sm"><span>Page {historyPage + 1} of {Math.max(1, Math.ceil(historyTotal / PAGE_SIZE))}</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:opacity-40" disabled={historyPage===0} onClick={()=>setHistoryPage((page)=>page-1)}>Previous</button><button className="rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:opacity-40" disabled={(historyPage+1)*PAGE_SIZE>=historyTotal} onClick={()=>setHistoryPage((page)=>page+1)}>Next</button></div></div></section>
      </> : null}
    </div>
    {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Escalate workflow record"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start gap-3"><FlagIcon className="mt-1 size-5 text-red-600"/><div><h3 className="text-xl font-semibold">Escalate {selected.item}</h3><p className="mt-1 text-sm text-neutral-500">This flags the issue for the responsible optimization team. It does not change the decision.</p></div></div><label className="mt-5 block text-sm font-semibold">Escalation note<textarea className="mt-2 min-h-28 w-full rounded-xl border border-neutral-300 p-3 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Explain why this needs urgent attention…" /></label><div className="mt-5 flex justify-end gap-2"><button className="cursor-pointer rounded-xl border px-4 py-2 hover:bg-neutral-50" onClick={()=>{setSelected(null);setNote("");}}>Cancel</button><button className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={!note.trim()||saving} onClick={()=>void escalate()}>{saving?"Saving…":"Escalate"}</button></div></div></div> : null}
  </ReportShell>;
}

function MonitoringTable({ items, onEscalate, onResolve, saving }: { items: MonitoringItem[]; onEscalate:(item:MonitoringItem)=>void; onResolve:(item:MonitoringItem)=>void; saving:boolean }) {
  const [requestedPage, setRequestedPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const visibleItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!items.length) return <div className="p-10 text-center text-neutral-500">No monitoring records match the selected filters.</div>;
  return <><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="px-4 py-3">Issue</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Spend</th><th className="px-4 py-3">Conv.</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Waiting</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y">{visibleItems.map((item)=><tr key={item.key} className={item.escalation?"bg-amber-50/70 hover:bg-amber-50":"hover:bg-neutral-50"}><td className="px-4 py-4"><div className="font-semibold">{item.item}</div><div className="mt-1 text-xs text-neutral-500">{item.module === "search_term" ? "Search term" : "Placement"} · {item.campaign}</div>{item.escalation?<div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800"><FlagIcon className="mt-0.5 size-3.5 shrink-0"/><span>{item.escalation.note}</span></div>:null}</td><td className="px-4 py-4">{item.accountName}</td><td className="px-4 py-4">RM {item.spend.toFixed(2)}</td><td className="px-4 py-4">{item.conversions.toFixed(2)}</td><td className="px-4 py-4"><PriorityBadge priority={item.priority}/></td><td className="px-4 py-4"><div>{item.statusLabel}</div>{item.lastDecision && formatStatus(item.lastDecision)!==item.statusLabel?<div className="text-xs text-neutral-500">{formatStatus(item.lastDecision)}</div>:null}</td><td className="px-4 py-4">{waitingLabel(item.waitingSince)}</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{item.escalation?<button disabled={saving} onClick={()=>onResolve(item)} className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 hover:bg-emerald-100">Resolve</button>:<button onClick={()=>onEscalate(item)} className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 hover:bg-amber-100"><FlagIcon className="mr-1 inline size-4"/>Escalate</button>}<Link className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-neutral-100" href={item.href}>Open<ArrowUpRightIcon className="ml-1 inline size-4"/></Link></div></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t p-4 text-sm"><span>Page {page+1} of {pageCount}</span><div className="flex gap-2"><button className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40" disabled={page===0} onClick={()=>setRequestedPage(page-1)}>Previous</button><button className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40" disabled={page>=pageCount-1} onClick={()=>setRequestedPage(page+1)}>Next</button></div></div></>;
}

function ActivityTimeline({ activities }: { activities: MonitoringActivity[] }) { if(!activities.length)return <div className="p-8 text-center text-neutral-500">No workflow history has been recorded yet.</div>; return <div className="divide-y">{activities.map((activity)=><div key={activity.id} className="grid gap-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><div className="flex size-9 items-center justify-center rounded-full bg-red-50 text-red-600">{activity.resultingStatus.includes("Approved")?<CheckCircle2Icon className="size-4"/>:activity.resultingStatus.includes("Reject")?<XCircleIcon className="size-4"/>:<Clock3Icon className="size-4"/>}</div><div><div className="font-semibold">{activity.action} · {activity.item}</div><div className="text-xs text-neutral-500">{activity.accountName} · {activity.actorEmail} · {activity.resultingStatus}</div></div><time className="text-xs text-neutral-500">{formatDate(activity.occurredAt)}</time></div>)}</div>; }
function Filter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Array<[string,string]>}){return <label className="text-xs font-semibold uppercase text-neutral-500">{label}<select className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none focus:border-red-500" value={value} onChange={(event)=>onChange(event.target.value)}>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"green"}){return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone==="green"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-neutral-200 bg-neutral-50 text-neutral-700"}`}>{children}</span>}
function PriorityBadge({priority}:{priority:MonitoringPriority}){const style=priority==="critical"?"bg-red-100 text-red-700":priority==="high"?"bg-orange-100 text-orange-700":priority==="medium"?"bg-amber-100 text-amber-700":"bg-neutral-100 text-neutral-600";return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold uppercase ${style}`}>{priority==="critical"?<AlertTriangleIcon className="size-3"/>:null}{priority}</span>}
function formatStatus(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function formatDate(value:string){const date=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-MY",{dateStyle:"medium",timeStyle:"short"}).format(date)}
function waitingLabel(value:string){const time=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`).getTime();if(Number.isNaN(time))return "Unknown";const days=Math.max(0,Math.floor((Date.now()-time)/86_400_000));return days===0?"Today":`${days} day${days===1?"":"s"}`}
