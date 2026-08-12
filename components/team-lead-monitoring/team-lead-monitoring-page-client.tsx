"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, Clock3Icon, FlagIcon, HistoryIcon, LoaderCircleIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react";

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
  const [queueView, setQueueView] = useState("needs_attention");
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
    const terminal = new Set(["approved_for_publishing", "ready_for_publishing", "published", "rejected", "approver_rejected", "kept", "excluded"]);
    const failed = (item: MonitoringItem) => item.status.includes("failed");
    const inQueue = (item: MonitoringItem) => {
      if (queueView === "all") return true;
      if (queueView === "escalated") return Boolean(item.escalation);
      if (queueView === "high_impact") return item.priority === "critical" || item.priority === "high";
      if (queueView === "awaiting_approval") return item.status === "ready_for_approval";
      if (queueView === "returned") return item.status === "returned_for_clarification";
      if (queueView === "completed") return terminal.has(item.status);
      return Boolean(item.escalation) || item.priority === "critical" || item.priority === "high" || item.status === "ready_for_approval" || item.status === "returned_for_clarification" || failed(item);
    };
    return (data?.items ?? []).filter((item) => inQueue(item) &&
      (account === "all" || item.accountId === account) && (module === "all" || item.module === module) &&
      (priority === "all" || item.priority === priority) && (status === "all" || item.status === status) &&
      (!cutoff || new Date(item.updatedAt).getTime() >= cutoff));
  }, [account, data, dateRange, module, priority, queueView, status]);

  const categoryCounts = useMemo(() => {
    const items = data?.items ?? [];
    const terminal = new Set(["approved_for_publishing", "ready_for_publishing", "published", "rejected", "approver_rejected", "kept", "excluded"]);
    return {
      needs_attention: items.filter((item) => item.escalation || item.priority === "critical" || item.priority === "high" || item.status === "ready_for_approval" || item.status === "returned_for_clarification" || item.status.includes("failed")).length,
      escalated: items.filter((item) => item.escalation).length,
      high_impact: items.filter((item) => item.priority === "critical" || item.priority === "high").length,
      awaiting_approval: items.filter((item) => item.status === "ready_for_approval").length,
      returned: items.filter((item) => item.status === "returned_for_clarification").length,
      completed: items.filter((item) => terminal.has(item.status)).length,
      all: items.length,
    };
  }, [data]);

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
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Filter label="Queue category" value={queueView} onChange={setQueueView} options={[["needs_attention",`Needs attention (${categoryCounts.needs_attention})`],["escalated",`Escalated (${categoryCounts.escalated})`],["high_impact",`High-impact risk (${categoryCounts.high_impact})`],["awaiting_approval",`Awaiting final approval (${categoryCounts.awaiting_approval})`],["returned",`Returned for clarification (${categoryCounts.returned})`],["completed",`Completed decisions (${categoryCounts.completed})`],["all",`All records (${categoryCounts.all})`]]} /><Filter label="Account" value={account} onChange={setAccount} options={[["all","All accounts"],...data.accounts.map((entry):[string,string]=>[entry.id,entry.name])]} /><Filter label="Module" value={module} onChange={setModule} options={[["all","All modules"],["search_term","Search terms"],["placement","Placements"]]} /></div><details className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-semibold text-neutral-600">More filters</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><Filter label="Priority" value={priority} onChange={setPriority} options={[["all","All priorities"],["critical","Critical"],["high","High"],["medium","Medium"],["normal","Normal"]]} /><Filter label="Status" value={status} onChange={setStatus} options={[["all","All statuses"],...statuses.map((entry):[string,string]=>[entry,formatStatus(entry)])]} /><Filter label="Activity" value={dateRange} onChange={setDateRange} options={[["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]]} /></div></details></section>

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h3 className="text-xl font-semibold">{queueTitle(queueView)}</h3><p className="text-sm text-neutral-500">{queueDescription(queueView)}</p></div><Badge>{filtered.length} records</Badge></div><MonitoringTable items={filtered} onEscalate={setSelected} onResolve={resolve} saving={saving}/></section>

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b p-5"><HistoryIcon className="size-5 text-red-600"/><div><h3 className="text-xl font-semibold">Recent workflow activity</h3><p className="text-sm text-neutral-500">Meaningful review, approval, return, and escalation events.</p></div></div><ActivityTimeline activities={activities}/><div className="flex items-center justify-between border-t p-4 text-sm"><span>Page {historyPage + 1} of {Math.max(1, Math.ceil(historyTotal / PAGE_SIZE))}</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:opacity-40" disabled={historyPage===0} onClick={()=>setHistoryPage((page)=>page-1)}>Previous</button><button className="rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:opacity-40" disabled={(historyPage+1)*PAGE_SIZE>=historyTotal} onClick={()=>setHistoryPage((page)=>page+1)}>Next</button></div></div></section>
      </> : null}
    </div>
    {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Escalate workflow record"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start gap-3"><FlagIcon className="mt-1 size-5 text-red-600"/><div><h3 className="text-xl font-semibold">Escalate {selected.item}</h3><p className="mt-1 text-sm text-neutral-500">This flags the issue for the responsible optimization team. It does not change the decision.</p></div></div><label className="mt-5 block text-sm font-semibold">Escalation note<textarea className="mt-2 min-h-28 w-full rounded-xl border border-neutral-300 p-3 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Explain why this needs urgent attention…" /></label><div className="mt-5 flex justify-end gap-2"><button className="cursor-pointer rounded-xl border px-4 py-2 hover:bg-neutral-50" onClick={()=>{setSelected(null);setNote("");}}>Cancel</button><button className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={!note.trim()||saving} onClick={()=>void escalate()}>{saving?"Saving…":"Escalate"}</button></div></div></div> : null}
  </ReportShell>;
}

function MonitoringTable({ items, onEscalate, onResolve, saving }: { items: MonitoringItem[]; onEscalate:(item:MonitoringItem)=>void; onResolve:(item:MonitoringItem)=>void; saving:boolean }) {
  const [requestedPage, setRequestedPage] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const visibleItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!items.length) return <div className="p-10 text-center text-neutral-500">No monitoring records match the selected filters.</div>;
  return <>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="px-4 py-3">Issue</th><th className="w-32 px-4 py-3">Priority</th><th className="w-36 px-4 py-3 text-right">Action</th></tr></thead>
        <tbody className="divide-y">{visibleItems.map((item) => {
          const expanded = expandedKeys.has(item.key);
          return <Fragment key={item.key}>
            <tr className={item.escalation?"bg-amber-50/70 hover:bg-amber-50":"hover:bg-neutral-50"}>
              <td className="px-4 py-4"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.item}</span><AttentionReasons item={item}/></div><div className="mt-1 text-xs text-neutral-500">{item.module === "search_term" ? "Search term" : "Placement"} · {item.campaign}</div><button type="button" aria-expanded={expanded} onClick={()=>setExpandedKeys((current)=>{const next=new Set(current);if(next.has(item.key))next.delete(item.key);else next.add(item.key);return next;})} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200">View details<ChevronDownIcon className={`size-3.5 transition-transform duration-200 ${expanded?"rotate-180":""}`}/></button></td>
              <td className="px-4 py-4 align-top"><PriorityBadge priority={item.priority}/></td>
              <td className="px-4 py-4 align-top"><div className="flex justify-end">{item.escalation?<button disabled={saving} onClick={()=>onResolve(item)} className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 hover:bg-emerald-100">Resolve</button>:<button onClick={()=>onEscalate(item)} className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 hover:bg-amber-100"><FlagIcon className="mr-1 inline size-4"/>Escalate</button>}</div></td>
            </tr>
            {expanded?<tr className="bg-neutral-50/70"><td colSpan={3} className="px-4 pb-4 pt-0"><div className="grid gap-x-6 gap-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-xs shadow-sm sm:grid-cols-2 lg:grid-cols-3"><Detail label="Account" value={item.accountName}/><Detail label="Spend" value={`RM ${item.spend.toFixed(2)}`}/><Detail label="Conversions" value={item.conversions.toFixed(2)}/><Detail label="Stage" value={item.statusLabel}/><Detail label="Latest decision" value={item.lastDecision ? formatStatus(item.lastDecision) : "None"}/><Detail label="Waiting" value={waitingLabel(item.waitingSince)}/>{item.escalation?<div className="sm:col-span-2 lg:col-span-3"><span className="font-semibold uppercase text-neutral-500">Escalation note</span><p className="mt-1 text-amber-800">{item.escalation.note}</p></div>:null}</div></td></tr>:null}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between border-t p-4 text-sm"><span>Page {page+1} of {pageCount}</span><div className="flex gap-2"><button className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40" disabled={page===0} onClick={()=>setRequestedPage(page-1)}>Previous</button><button className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40" disabled={page>=pageCount-1} onClick={()=>setRequestedPage(page+1)}>Next</button></div></div>
  </>;
}

function AttentionReasons({ item }: { item: MonitoringItem }) {
  const reasons: Array<{ label: string; tone: string }> = [];
  if (item.escalation) reasons.push({ label: "Escalated", tone: "border-amber-200 bg-amber-50 text-amber-800" });
  if (item.status.includes("failed")) reasons.push({ label: "Failed", tone: "border-red-200 bg-red-50 text-red-700" });
  if (item.status === "returned_for_clarification") reasons.push({ label: "Returned", tone: "border-orange-200 bg-orange-50 text-orange-700" });
  if (item.status === "ready_for_approval") reasons.push({ label: "Awaiting approval", tone: "border-blue-200 bg-blue-50 text-blue-700" });
  if (item.priority === "critical" || item.priority === "high") reasons.push({ label: item.conversions === 0 && item.spend > 0 ? "Spend without conversions" : "High impact", tone: "border-red-200 bg-red-50 text-red-700" });
  if (!reasons.length) reasons.push({ label: "Routine", tone: "border-neutral-200 bg-neutral-50 text-neutral-600" });
  return <div className="flex flex-wrap gap-1.5">{reasons.map((reason) => <span key={reason.label} className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${reason.tone}`}>{reason.label}</span>)}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span className="font-semibold uppercase text-neutral-500">{label}</span><p className="mt-1 text-neutral-800">{value}</p></div>;
}

function ActivityTimeline({ activities }: { activities: MonitoringActivity[] }) { if(!activities.length)return <div className="p-8 text-center text-neutral-500">No workflow history has been recorded yet.</div>; return <div className="divide-y">{activities.map((activity)=><div key={activity.id} className="grid gap-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><div className="flex size-9 items-center justify-center rounded-full bg-red-50 text-red-600">{activity.resultingStatus.includes("Approved")?<CheckCircle2Icon className="size-4"/>:activity.resultingStatus.includes("Reject")?<XCircleIcon className="size-4"/>:<Clock3Icon className="size-4"/>}</div><div><div className="font-semibold">{activity.action} · {activity.item}</div><div className="text-xs text-neutral-500">{activity.accountName} · {activity.actorEmail} · {activity.resultingStatus}</div></div><time className="text-xs text-neutral-500">{formatDate(activity.occurredAt)}</time></div>)}</div>; }
function Filter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Array<[string,string]>}){return <label className="text-xs font-semibold uppercase text-neutral-500">{label}<select className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none focus:border-red-500" value={value} onChange={(event)=>onChange(event.target.value)}>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"green"}){return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone==="green"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-neutral-200 bg-neutral-50 text-neutral-700"}`}>{children}</span>}
function PriorityBadge({priority}:{priority:MonitoringPriority}){const style=priority==="critical"?"bg-red-100 text-red-700":priority==="high"?"bg-orange-100 text-orange-700":priority==="medium"?"bg-amber-100 text-amber-700":"bg-neutral-100 text-neutral-600";return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold uppercase ${style}`}>{priority==="critical"?<AlertTriangleIcon className="size-3"/>:null}{priority}</span>}
function formatStatus(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function formatDate(value:string){const date=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-MY",{dateStyle:"medium",timeStyle:"short"}).format(date)}
function waitingLabel(value:string){const time=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`).getTime();if(Number.isNaN(time))return "Unknown";const days=Math.max(0,Math.floor((Date.now()-time)/86_400_000));return days===0?"Today":`${days} day${days===1?"":"s"}`}
function queueTitle(view:string){return view==="needs_attention"?"Needs attention":view==="escalated"?"Escalated issues":view==="high_impact"?"High-impact risk":view==="awaiting_approval"?"Awaiting final approval":view==="returned"?"Returned for clarification":view==="completed"?"Completed decisions":"All workflow records"}
function queueDescription(view:string){return view==="needs_attention"?"Only escalated, high-impact, delayed, failed, or approval-ready work is shown.":view==="completed"?"Terminal outcomes are available for oversight; no action is required.":view==="all"?"Complete workflow inventory, including routine pending records.":"Focused records from the selected operational category."}
