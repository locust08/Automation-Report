"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectAutomaticExclusionCandidates } from "@/lib/search-term-optimization/automatic-exclusion-rules";
import type { AuthRole } from "@/lib/auth/roles";
import type { AutomaticActionHistoryPayload, OptimizationDashboardPayload, SearchTermAccountSettings } from "@/lib/search-term-optimization/types";

export function AutomaticActionsPanel({role,dashboard}:{role:AuthRole;dashboard:OptimizationDashboardPayload}) {
  const [settings,setSettings]=useState<SearchTermAccountSettings>(dashboard.settings);
  const [history,setHistory]=useState<AutomaticActionHistoryPayload|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const eligible=useMemo(()=>selectAutomaticExclusionCandidates(dashboard.results,dashboard,settings.autoSafeScoreThreshold).length,[dashboard,settings.autoSafeScoreThreshold]);

  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/search-term-optimization/automatic-actions?accountId=${encodeURIComponent(dashboard.account.customerId)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{const payload=await response.json() as AutomaticActionHistoryPayload&{error?:string};if(!response.ok)throw new Error(payload.error??"Unable to load history.");setHistory(payload);})
      .catch(error=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Unable to load automatic action history.");});
    return()=>controller.abort();
  },[dashboard.account.customerId,dashboard.account.lastAnalysisAt]);

  async function save() {
    setSaving(true);setMessage(null);
    try {
      const response=await fetch("/api/search-term-optimization/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
      const payload=await response.json() as SearchTermAccountSettings&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Unable to save automatic exclusion settings.");
      setSettings(payload);setMessage("Automatic exclusion settings saved.");
    } catch(error) {setMessage(error instanceof Error?error.message:"Unable to save automatic exclusion settings.");}
    finally {setSaving(false);}
  }

  const live=history?.livePublishingEnabled===true;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><ShieldCheckIcon className="size-5"/></span><div><h2 className="font-semibold">Automatic negative keywords</h2><p className="mt-1 text-sm text-neutral-500">Strict negative-exact safeguards · shared exclusion cap managed in Settings</p></div></div>
      <Badge variant="outline" className={live?"border-red-300 bg-red-50 text-red-800":"border-amber-300 bg-amber-50 text-amber-800"}>{live?"Live publishing":"Dry run"}</Badge>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Currently eligible</p><p className="mt-1 text-2xl font-semibold">{eligible}</p></div>
      <label className="rounded-xl border bg-neutral-50 p-3"><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Safety threshold</span><Input className="mt-2 bg-white" type="number" min={90} max={100} disabled={role!=="admin"} value={settings.autoSafeScoreThreshold} onChange={event=>setSettings(current=>({...current,autoSafeScoreThreshold:Number(event.target.value)}))}/></label>
      <div className="rounded-xl border bg-neutral-50 p-3"><p className="text-sm font-semibold">All accounts included</p><p className="mt-1 text-xs text-neutral-500">Automatic exclusions apply to all accounts. Only eligible terms are applied.</p></div>
    </div>
    {role==="admin"?<div className="mt-3 flex items-center gap-3"><Button disabled={saving||settings.autoSafeScoreThreshold<90||settings.autoSafeScoreThreshold>100} onClick={()=>void save()}>{saving?"Saving…":"Save automation settings"}</Button>{message?<p className="text-sm text-neutral-600">{message}</p>:null}</div>:message?<p className="mt-3 text-sm text-neutral-600">{message}</p>:null}
    <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Automatic action history</h3>{history?.items.length?<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-neutral-500"><tr><th className="pb-2">Search term</th><th className="pb-2">Score</th><th className="pb-2">Mode</th><th className="pb-2">Status</th><th className="pb-2">Created</th></tr></thead><tbody className="divide-y">{history.items.map(item=><tr key={item.id}><td className="py-2 pr-3"><p className="font-medium">{item.searchTerm}</p><p className="text-xs text-neutral-500">{item.campaign} · {item.adGroup}</p>{item.error?<p className="text-xs text-red-700">{item.error}</p>:null}</td><td className="py-2 pr-3">{item.safetyScore}/{item.scoreThreshold}</td><td className="py-2 pr-3">{item.executionMode.replace("_"," ")}</td><td className="py-2 pr-3">{item.status.replace("_"," ")}</td><td className="py-2">{new Intl.DateTimeFormat("en-MY",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(item.createdAt))}</td></tr>)}</tbody></table></div>:<p className="mt-2 text-sm text-neutral-500">No automatic actions have been recorded for this account.</p>}</div>
  </section>;
}
