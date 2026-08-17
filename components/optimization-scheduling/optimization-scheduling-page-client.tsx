"use client";

import { useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import { CalendarClockIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, Clock3Icon, InfoIcon, PlusIcon, SaveIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { ReportShell } from "@/components/reporting/report-shell";
import { GoogleAccountSearchField } from "@/components/optimization/google-account-search-field";
import { DailyCapacityCounterGrid, type DailyAnalysisCapacity } from "@/components/optimization/daily-capacity-counter-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateScheduleNextRun, type OptimizationSchedule } from "@/lib/optimization-scheduling/service";

type Account={accountName:string;adAccountId:string};
const RECENT_SCHEDULE_ACCOUNTS_KEY="optimization-scheduling-recent-accounts";
const emptySchedule=(account:Account):OptimizationSchedule=>({googleCustomerId:account.adAccountId.replace(/\D/g,""),accountName:account.accountName,enabled:true,scheduleType:"monthly",runDay:1,scheduledDate:null,runTime:"09:00",periodMode:"rolling",rollingDays:30,periodStartDate:null,periodEndDate:null});

export function OptimizationSchedulingPageClient(){
  const [schedules,setSchedules]=useState<OptimizationSchedule[]>([]);
  const [query,setQuery]=useState(""); const [accounts,setAccounts]=useState<Account[]>([]); const [recentAccounts,setRecentAccounts]=useState<Account[]>([]); const [selected,setSelected]=useState<Account|null>(null); const [searchOpen,setSearchOpen]=useState(false);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState<string|null>(null);
  const [scheduleSearch,setScheduleSearch]=useState("");
  const [dailyCapacity,setDailyCapacity]=useState<DailyAnalysisCapacity|null>(null);
  useEffect(()=>{void fetch("/api/optimization-scheduling",{cache:"no-store"}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);setSchedules(p.schedules??[]);setDailyCapacity(p.capacity??null);}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));},[]);
  useEffect(()=>{try{const stored=JSON.parse(window.localStorage.getItem(RECENT_SCHEDULE_ACCOUNTS_KEY)??"[]") as Account[];setRecentAccounts(Array.isArray(stored)?stored.slice(0,5):[]);}catch{window.localStorage.removeItem(RECENT_SCHEDULE_ACCOUNTS_KEY);}},[]);
  useEffect(()=>{if(query.trim().length<2){setAccounts([]);return;}const controller=new AbortController();const timer=setTimeout(()=>{void fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(query)}`,{signal:controller.signal}).then(r=>r.json()).then(p=>setAccounts((p.accounts??[]).map((a:Account)=>({accountName:a.accountName,adAccountId:a.adAccountId})))).catch(()=>undefined);},300);return()=>{clearTimeout(timer);controller.abort();};},[query]);
  const usage=useMemo(()=>{const map=new Map<string,number>();for(const s of schedules){if(!s.enabled)continue;const day=s.scheduleType==="monthly"?s.runDay:Number(s.scheduledDate?.slice(-2));const key=`Day ${day}`;map.set(key,(map.get(key)??0)+1);}return map;},[schedules]);
  const overCapacityDays=useMemo(()=>[...usage].filter(([,count])=>count>4).map(([day])=>day),[usage]);
  const visibleSchedules=useMemo(()=>{
    const normalized=scheduleSearch.trim().toLowerCase();
    const digits=normalized.replace(/\D/g,"");
    return schedules.map((schedule,index)=>({schedule,index})).filter(({schedule})=>!normalized||schedule.accountName.toLowerCase().includes(normalized)||(digits.length>0&&schedule.googleCustomerId.includes(digits)));
  },[scheduleSearch,schedules]);
  function patch(index:number,changes:Partial<OptimizationSchedule>){setSchedules(current=>current.map((s,i)=>i===index?{...s,...changes}:s));}
  function add(){if(!selected)return;if(schedules.some(s=>s.googleCustomerId===selected.adAccountId.replace(/\D/g,""))){setMessage("That account already has a schedule.");return;}setSchedules(s=>[...s,emptySchedule(selected)]);setSelected(null);setQuery("");setAccounts([]);setMessage(null);}
  async function save(){setSaving(true);setMessage(null);try{const r=await fetch("/api/optimization-scheduling",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({schedules})});const p=await r.json();if(!r.ok)throw new Error(p.error);setSchedules(p.schedules);setMessage("All schedules saved.");posthog.capture("optimization_schedules_saved",{schedule_count:p.schedules.length,enabled_schedule_count:p.schedules.filter((schedule:OptimizationSchedule)=>schedule.enabled).length});}catch(e){setMessage(e instanceof Error?e.message:"Unable to save schedules.");}finally{setSaving(false);}}
  return <ReportShell title="Optimization Scheduling" dateLabel="" reportReady={!loading} headerControlLayout="wide" headerDateControl={<DailyCapacityCounterGrid capacity={dailyCapacity}/> }>
    <div className="space-y-5 text-neutral-950">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><CalendarClockIcon className="mt-0.5 size-6 text-red-600"/><div><h2 className="text-xl font-semibold">Add an account schedule</h2><p className="text-sm text-neutral-500">Search Google Ads accounts only. Scheduled analysis can review up to 2,500 terms per account.</p></div></div>
        <div className="relative mt-4 max-w-4xl"><div className="flex items-start gap-2"><GoogleAccountSearchField value={query} onChange={value=>{setQuery(value);setSelected(null);setSearchOpen(true);}} results={accounts} recentAccounts={recentAccounts} open={searchOpen} state={query.trim().length>=2?"success":"idle"} onFocus={()=>setSearchOpen(true)} onBlur={()=>window.setTimeout(()=>setSearchOpen(false),100)} onSelect={account=>{setSelected(account);setQuery(`${account.accountName} | ${account.adAccountId}`);setAccounts([]);setSearchOpen(false);setRecentAccounts(current=>{const next=[account,...current.filter(item=>item.adAccountId!==account.adAccountId)].slice(0,5);window.localStorage.setItem(RECENT_SCHEDULE_ACCOUNTS_KEY,JSON.stringify(next));return next;});}}/><Button className="h-12" onClick={add} disabled={!selected}><PlusIcon/>Add Schedule</Button></div></div>
      </section>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">{usage.size>0?[...usage].sort().map(([day,count])=><span key={day} className={`rounded-full border px-3 py-1 text-sm font-medium ${count>=4?"border-red-200 bg-red-50 text-red-700":"border-neutral-200 bg-white"}`}>{day}: {count} of 4 active scheduled accounts</span>):<span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm font-medium">0 active scheduled accounts</span>}</div>
        <div className="relative w-full sm:max-w-sm"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"/><Input value={scheduleSearch} onChange={event=>setScheduleSearch(event.target.value)} placeholder="Search scheduled accounts" className="bg-white pl-9"/></div>
      </section>
      {overCapacityDays.length>0?<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Too many accounts on {overCapacityDays.join(", ")}. Move at least one account to another day before saving.</p>:schedules.length>4?<p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{schedules.length} schedule cards added. This is allowed only when no day has more than 4 accounts.</p>:null}
      {message?<p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{message}</p>:null}
      <div className="grid gap-4">{visibleSchedules.map(({schedule:s,index})=><section key={s.googleCustomerId} className="w-full rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{s.accountName}</h3><p className="text-sm text-neutral-500">CID {s.googleCustomerId}</p></div><div className="flex items-center gap-3"><span className="text-sm font-medium">{s.enabled?"On":"Off"}</span><Switch checked={s.enabled} onCheckedChange={enabled=>patch(index,{enabled})} className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"/><Button variant="outline" size="icon" aria-label="Remove schedule" onClick={()=>setSchedules(current=>current.filter((_,i)=>i!==index))}><Trash2Icon/></Button></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Schedule"><Select value={s.scheduleType} onValueChange={value=>patch(index,{scheduleType:value as "monthly"|"once",periodMode:value==="monthly"?"rolling":s.periodMode,rollingDays:value==="monthly"?(s.rollingDays??30):s.rollingDays,scheduledDate:value==="once"?(s.scheduledDate??new Date().toISOString().slice(0,10)):null,runDay:value==="monthly"?(s.runDay??1):null})}><SelectTrigger className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="once">One time</SelectItem></SelectContent></Select></Field>
          {s.scheduleType==="monthly"?<Field label={<InfoLabel label="Run day" explanation="Choose which day of every month the analysis should run. Monthly schedules are limited to days 1–28 so every month has the selected date."/>}><MonthlyRunDayPicker value={s.runDay??1} onChange={runDay=>patch(index,{runDay})}/></Field>:<Field label="Run date"><DatePicker value={s.scheduledDate??""} onChange={scheduledDate=>patch(index,{scheduledDate})}/></Field>}
          <Field label="Run time (Malaysia)"><TimePicker value={s.runTime} minTime={minimumRunTime(s)} onChange={runTime=>patch(index,{runTime})}/></Field>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:col-span-2 xl:col-span-3">
            <p className="mb-3 text-sm font-semibold text-neutral-900">Analysis method</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label={<InfoLabel label="Method" explanation="Choose recent days for every scheduled run, or one exact date range for a one-time analysis."/>}><Select value={s.periodMode} onValueChange={value=>patch(index,{periodMode:value as "rolling"|"fixed",scheduleType:value==="fixed"?"once":s.scheduleType,scheduledDate:value==="fixed"?(s.scheduledDate??new Date().toISOString().slice(0,10)):s.scheduledDate,rollingDays:value==="rolling"?(s.rollingDays??30):null,periodStartDate:value==="fixed"?(s.periodStartDate??new Date().toISOString().slice(0,10)):null,periodEndDate:value==="fixed"?(s.periodEndDate??new Date().toISOString().slice(0,10)):null})}><SelectTrigger className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rolling">Recent day range</SelectItem><SelectItem value="fixed">Fixed day range (one time)</SelectItem></SelectContent></Select></Field>
              {s.periodMode==="rolling"?<><Field label={<InfoLabel label="Day range" explanation="How many recent days to analyze. Example: 30 means the latest 30 days."/>}><Input type="number" min={1} max={365} value={s.rollingDays??30} onChange={e=>patch(index,{rollingDays:Number(e.target.value)})}/></Field><RollingRangePreview schedule={s}/></>:<><Field label="Start date"><DatePicker value={s.periodStartDate??""} onChange={periodStartDate=>patch(index,{periodStartDate})}/></Field><Field label="End date"><DatePicker value={s.periodEndDate??""} onChange={periodEndDate=>patch(index,{periodEndDate})}/></Field></>}
            </div>
          </div>
        </div>{s.nextRunAt?<p className="mt-4 text-xs text-neutral-500">Next run {new Date(s.nextRunAt).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}{s.lastStatus?` · Last status: ${s.lastStatus}`:""}</p>:null}
      </section>)}{schedules.length>0&&visibleSchedules.length===0?<div className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center"><p className="font-semibold">No scheduled accounts found</p><p className="mt-1 text-sm text-neutral-500">Try searching by another account name or CID.</p></div>:null}</div>
      {schedules.length>0?<div className="flex justify-end"><Button className="bg-red-600 hover:bg-red-700" disabled={saving||loading||overCapacityDays.length>0} onClick={()=>void save()}><SaveIcon/>{saving?"Saving…":schedules.length===1?"Save":"Save All"}</Button></div>:null}
    </div>
  </ReportShell>;
}

function MonthlyRunDayPicker({value,onChange}:{value:number;onChange:(day:number)=>void}){
  const [open,setOpen]=useState(false);
  const days=Array.from({length:31},(_,index)=>index+1);
  const nextDate=nextMonthlyDate(value);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start bg-white font-normal"><CalendarDaysIcon className="text-neutral-500"/>{formatRunDate(nextDate)}</Button></PopoverTrigger><PopoverContent align="start" className="w-72"><p className="mb-1 text-sm font-semibold">Monthly run day</p><p className="mb-3 text-xs text-neutral-500">Next run: {formatRunDate(nextDate)}</p><div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-neutral-400">{["M","T","W","T","F","S","S"].map((day,index)=><span key={`${day}-${index}`}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map(day=><Button key={day} type="button" size="icon" variant={day===value?"default":"ghost"} disabled={day>28} className={`size-8 ${day===value?"bg-red-700 hover:bg-red-800":""}`} onClick={()=>{onChange(day);setOpen(false);}}>{day}</Button>)}</div><p className="mt-3 text-xs text-neutral-500">Days 29–31 are unavailable so the schedule works every month.</p></PopoverContent></Popover>;
}

function DatePicker({value,onChange}:{value:string;onChange:(date:string)=>void}){
  const selected=parseDateOnly(value);
  const [open,setOpen]=useState(false);
  const [month,setMonth]=useState(()=>selected?new Date(selected.getFullYear(),selected.getMonth(),1):new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const year=month.getFullYear();
  const monthIndex=month.getMonth();
  const firstDay=(new Date(year,monthIndex,1).getDay()+6)%7;
  const daysInMonth=new Date(year,monthIndex+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,index)=>index+1)];
  const choose=(day:number)=>{onChange(`${year}-${String(monthIndex+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);setOpen(false);};
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start bg-white font-normal"><CalendarDaysIcon className="text-neutral-500"/><span>{selected?formatRunDate(selected):"Select date"}</span></Button></PopoverTrigger><PopoverContent align="start" className="w-72"><div className="mb-3 flex items-center justify-between"><Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Previous month" onClick={()=>setMonth(new Date(year,monthIndex-1,1))}><ChevronLeftIcon/></Button><p className="text-sm font-semibold">{month.toLocaleDateString("en-MY",{month:"long",year:"numeric"})}</p><Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Next month" onClick={()=>setMonth(new Date(year,monthIndex+1,1))}><ChevronRightIcon/></Button></div><div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-neutral-400">{["M","T","W","T","F","S","S"].map((day,index)=><span key={`${day}-${index}`}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{cells.map((day,index)=>day===null?<span key={`blank-${index}`} className="size-8"/>:<Button key={day} type="button" size="icon" variant={selected?.getFullYear()===year&&selected.getMonth()===monthIndex&&selected.getDate()===day?"default":"ghost"} className={`size-8 ${selected?.getFullYear()===year&&selected.getMonth()===monthIndex&&selected.getDate()===day?"bg-red-700 hover:bg-red-800":""}`} onClick={()=>choose(day)}>{day}</Button>)}</div></PopoverContent></Popover>;
}

function nextMonthlyDate(day:number){
  const now=new Date();
  let candidate=new Date(now.getFullYear(),now.getMonth(),day);
  if(candidate.getTime()<new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime())candidate=new Date(now.getFullYear(),now.getMonth()+1,day);
  return candidate;
}

function formatRunDate(date:Date){
  const weekday=date.toLocaleDateString("en-MY",{weekday:"long"});
  const numeric=date.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});
  return `${weekday} — ${numeric}`;
}

function RollingRangePreview({schedule}:{schedule:OptimizationSchedule}){
  const days=Math.min(365,Math.max(1,schedule.rollingDays??30));
  let endDate:string;
  try{
    endDate=schedule.scheduleType==="once"&&schedule.scheduledDate
      ? schedule.scheduledDate
      : new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(calculateScheduleNextRun(schedule)??new Date()));
  }catch{
    endDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  }
  const end=parseDateOnly(endDate)??new Date();
  const start=new Date(end.getFullYear(),end.getMonth(),end.getDate()-(days-1));
  const format=(date:Date)=>date.toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"});
  return <div className="rounded-lg border border-red-100 bg-white px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Dates analyzed</p><p className="mt-1 font-semibold text-neutral-950">{format(start)} – {format(end)}</p><p className="mt-0.5 text-xs text-neutral-500">{days} day{days===1?"":"s"}, ending on the run date</p></div>;
}

function parseDateOnly(value:string){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)return null;
  return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
}

function minimumRunTime(schedule:OptimizationSchedule){
  if(schedule.scheduleType!=="once"||schedule.scheduledDate!==malaysiaDateOnly())return null;
  const now=new Date();
  return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
}

function malaysiaDateOnly(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}

function TimePicker({value,minTime,onChange}:{value:string;minTime:string|null;onChange:(time:string)=>void}){
  const normalized=/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?value:"09:00";
  const slots=Array.from({length:24},(_,hour)=>`${String(hour).padStart(2,"0")}:00`)
    .filter(time=>!minTime||time>=minTime);
  const displayTime=(time:string)=>{
    const [displayHour,displayMinute]=time.split(":").map(Number);
    return `${String(displayHour%12||12).padStart(2,"0")}:${String(displayMinute).padStart(2,"0")} ${displayHour>=12?"PM":"AM"}`;
  };
  const selected=slots.includes(normalized)?normalized:"";
  return <div>
    <Select value={selected} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-white" aria-label="Run time in Malaysia">
        <span className="flex items-center gap-2"><Clock3Icon className="size-4 text-neutral-500"/><SelectValue placeholder="Select an available time"/></span>
      </SelectTrigger>
      <SelectContent>{slots.map(time=><SelectItem key={time} value={time}>{displayTime(time)}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

function InfoLabel({label,explanation}:{label:string;explanation:string}){
  return <span className="inline-flex items-center gap-1.5">{label}<TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`About ${label}`} className="rounded-full text-neutral-400 outline-none transition hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-600"><InfoIcon className="size-3.5"/></button></TooltipTrigger><TooltipContent side="top" sideOffset={8} className="border border-white/15 bg-[#211114] px-3 py-2 text-sm font-medium leading-relaxed text-white shadow-xl">{explanation}</TooltipContent></Tooltip></TooltipProvider></span>;
}

function Field({label,children}:{label:React.ReactNode;children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>{children}</label>;}
