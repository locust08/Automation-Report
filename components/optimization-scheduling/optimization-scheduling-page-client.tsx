"use client";

import { useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import { CalendarClockIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { ReportShell } from "@/components/reporting/report-shell";
import { GoogleAccountSearchField } from "@/components/optimization/google-account-search-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { OptimizationSchedule } from "@/lib/optimization-scheduling/service";

type Account={accountName:string;adAccountId:string};
const RECENT_SCHEDULE_ACCOUNTS_KEY="optimization-scheduling-recent-accounts";
const emptySchedule=(account:Account):OptimizationSchedule=>({googleCustomerId:account.adAccountId.replace(/\D/g,""),accountName:account.accountName,enabled:true,scheduleType:"monthly",runDay:1,scheduledDate:null,runTime:"09:00",periodMode:"rolling",rollingDays:30,periodStartDate:null,periodEndDate:null});

export function OptimizationSchedulingPageClient(){
  const [schedules,setSchedules]=useState<OptimizationSchedule[]>([]);
  const [query,setQuery]=useState(""); const [accounts,setAccounts]=useState<Account[]>([]); const [recentAccounts,setRecentAccounts]=useState<Account[]>([]); const [selected,setSelected]=useState<Account|null>(null); const [searchOpen,setSearchOpen]=useState(false);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState<string|null>(null);
  useEffect(()=>{void fetch("/api/optimization-scheduling",{cache:"no-store"}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);setSchedules(p.schedules??[]);}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));},[]);
  useEffect(()=>{try{const stored=JSON.parse(window.localStorage.getItem(RECENT_SCHEDULE_ACCOUNTS_KEY)??"[]") as Account[];setRecentAccounts(Array.isArray(stored)?stored.slice(0,5):[]);}catch{window.localStorage.removeItem(RECENT_SCHEDULE_ACCOUNTS_KEY);}},[]);
  useEffect(()=>{if(query.trim().length<2){setAccounts([]);return;}const controller=new AbortController();const timer=setTimeout(()=>{void fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(query)}`,{signal:controller.signal}).then(r=>r.json()).then(p=>setAccounts((p.accounts??[]).map((a:Account)=>({accountName:a.accountName,adAccountId:a.adAccountId})))).catch(()=>undefined);},300);return()=>{clearTimeout(timer);controller.abort();};},[query]);
  const usage=useMemo(()=>{const map=new Map<string,number>();for(const s of schedules){if(!s.enabled)continue;const day=s.scheduleType==="monthly"?s.runDay:Number(s.scheduledDate?.slice(-2));const key=`Day ${day}`;map.set(key,(map.get(key)??0)+1);}return map;},[schedules]);
  const overCapacityDays=useMemo(()=>[...usage].filter(([,count])=>count>4).map(([day])=>day),[usage]);
  function patch(index:number,changes:Partial<OptimizationSchedule>){setSchedules(current=>current.map((s,i)=>i===index?{...s,...changes}:s));}
  function add(){if(!selected)return;if(schedules.some(s=>s.googleCustomerId===selected.adAccountId.replace(/\D/g,""))){setMessage("That account already has a schedule.");return;}setSchedules(s=>[...s,emptySchedule(selected)]);setSelected(null);setQuery("");setAccounts([]);setMessage(null);}
  async function save(){setSaving(true);setMessage(null);try{const r=await fetch("/api/optimization-scheduling",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({schedules})});const p=await r.json();if(!r.ok)throw new Error(p.error);setSchedules(p.schedules);setMessage("All schedules saved.");posthog.capture("optimization_schedules_saved",{schedule_count:p.schedules.length,enabled_schedule_count:p.schedules.filter((schedule:OptimizationSchedule)=>schedule.enabled).length});}catch(e){setMessage(e instanceof Error?e.message:"Unable to save schedules.");}finally{setSaving(false);}}
  return <ReportShell title="Optimization Scheduling" dateLabel="Malaysia time · maximum 4 accounts per day" reportReady={!loading}>
    <div className="space-y-5 text-neutral-950">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><CalendarClockIcon className="mt-0.5 size-6 text-red-600"/><div><h2 className="text-xl font-semibold">Add an account schedule</h2><p className="text-sm text-neutral-500">Search Google Ads accounts only. Scheduled analysis can review up to 2,500 terms per account.</p></div></div>
        <div className="relative mt-4 max-w-4xl"><div className="flex items-start gap-2"><GoogleAccountSearchField value={query} onChange={value=>{setQuery(value);setSelected(null);setSearchOpen(true);}} results={accounts} recentAccounts={recentAccounts} open={searchOpen} state={query.trim().length>=2?"success":"idle"} onFocus={()=>setSearchOpen(true)} onBlur={()=>window.setTimeout(()=>setSearchOpen(false),100)} onSelect={account=>{setSelected(account);setQuery(`${account.accountName} | ${account.adAccountId}`);setAccounts([]);setSearchOpen(false);setRecentAccounts(current=>{const next=[account,...current.filter(item=>item.adAccountId!==account.adAccountId)].slice(0,5);window.localStorage.setItem(RECENT_SCHEDULE_ACCOUNTS_KEY,JSON.stringify(next));return next;});}}/><Button className="h-12" onClick={add} disabled={!selected}><PlusIcon/>Add Schedule</Button></div></div>
      </section>
      <section className="flex flex-wrap gap-2">{[...usage].sort().map(([day,count])=><span key={day} className={`rounded-full border px-3 py-1 text-sm font-medium ${count>=4?"border-red-200 bg-red-50 text-red-700":"border-neutral-200 bg-white"}`}>{day}: {count} of 4 accounts scheduled</span>)}</section>
      {overCapacityDays.length>0?<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Too many accounts on {overCapacityDays.join(", ")}. Move at least one account to another day before saving.</p>:schedules.length>4?<p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{schedules.length} schedule cards added. This is allowed only when no day has more than 4 accounts.</p>:null}
      {message?<p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{message}</p>:null}
      <div className="grid gap-4 xl:grid-cols-2">{schedules.map((s,index)=><section key={s.googleCustomerId} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{s.accountName}</h3><p className="text-sm text-neutral-500">CID {s.googleCustomerId}</p></div><div className="flex items-center gap-3"><span className="text-sm font-medium">{s.enabled?"On":"Off"}</span><Switch checked={s.enabled} onCheckedChange={enabled=>patch(index,{enabled})} className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"/><Button variant="outline" size="icon" aria-label="Remove schedule" onClick={()=>setSchedules(current=>current.filter((_,i)=>i!==index))}><Trash2Icon/></Button></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Schedule"><select value={s.scheduleType} onChange={e=>patch(index,{scheduleType:e.target.value as "monthly"|"once",periodMode:e.target.value==="monthly"?"rolling":s.periodMode,rollingDays:e.target.value==="monthly"?(s.rollingDays??30):s.rollingDays,scheduledDate:e.target.value==="once"?(s.scheduledDate??new Date().toISOString().slice(0,10)):null,runDay:e.target.value==="monthly"?(s.runDay??1):null})} className="h-10 w-full rounded-md border px-3"><option value="monthly">Monthly</option><option value="once">One time</option></select></Field>
          {s.scheduleType==="monthly"?<Field label="Run day (1–28)"><Input type="number" min={1} max={28} value={s.runDay??1} onChange={e=>patch(index,{runDay:Number(e.target.value)})}/></Field>:<Field label="Run date"><Input type="date" value={s.scheduledDate??""} onChange={e=>patch(index,{scheduledDate:e.target.value})}/></Field>}
          <Field label="Run time (Malaysia)"><Input type="time" value={s.runTime} onChange={e=>patch(index,{runTime:e.target.value})}/></Field>
          <Field label="Analysis period"><select value={s.periodMode} onChange={e=>patch(index,{periodMode:e.target.value as "rolling"|"fixed",scheduleType:e.target.value==="fixed"?"once":s.scheduleType,scheduledDate:e.target.value==="fixed"?(s.scheduledDate??new Date().toISOString().slice(0,10)):s.scheduledDate,rollingDays:e.target.value==="rolling"?(s.rollingDays??30):null,periodStartDate:e.target.value==="fixed"?(s.periodStartDate??new Date().toISOString().slice(0,10)):null,periodEndDate:e.target.value==="fixed"?(s.periodEndDate??new Date().toISOString().slice(0,10)):null})} className="h-10 w-full rounded-md border px-3"><option value="rolling">Past N days</option><option value="fixed">Fixed date range (one time)</option></select></Field>
          {s.periodMode==="rolling"?<Field label="Past days (1–365)"><Input type="number" min={1} max={365} value={s.rollingDays??30} onChange={e=>patch(index,{rollingDays:Number(e.target.value)})}/></Field>:<><Field label="Analysis start"><Input type="date" value={s.periodStartDate??""} onChange={e=>patch(index,{periodStartDate:e.target.value})}/></Field><Field label="Analysis end"><Input type="date" value={s.periodEndDate??""} onChange={e=>patch(index,{periodEndDate:e.target.value})}/></Field></>}
        </div>{s.nextRunAt?<p className="mt-4 text-xs text-neutral-500">Next run {new Date(s.nextRunAt).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}{s.lastStatus?` · Last status: ${s.lastStatus}`:""}</p>:null}
      </section>)}</div>
      {schedules.length>0?<div className="flex justify-end"><Button className="bg-red-600 hover:bg-red-700" disabled={saving||loading||overCapacityDays.length>0} onClick={()=>void save()}><SaveIcon/>{saving?"Saving…":schedules.length===1?"Save":"Save All"}</Button></div>:null}
    </div>
  </ReportShell>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>{children}</label>;}
