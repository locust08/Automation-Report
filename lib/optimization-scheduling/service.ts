import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";

export type OptimizationSchedule = {
  id?: string;
  googleCustomerId: string;
  accountName: string;
  enabled: boolean;
  scheduleType: "monthly" | "once";
  runDay: number | null;
  scheduledDate: string | null;
  runTime: string;
  periodMode: "rolling" | "fixed";
  rollingDays: number | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
};

type ScheduleRow = {
  id:string; google_customer_id:string; account_name:string; enabled:boolean; schedule_type:"monthly"|"once";
  run_day:number|null; scheduled_date:string|null; run_time:string; period_mode:"rolling"|"fixed"; rolling_days:number|null;
  period_start_date:string|null; period_end_date:string|null; next_run_at:string|null; last_run_at:string|null;
  last_status:string|null; last_error:string|null;
};

const MALAYSIA_OFFSET = "+08:00";
const map = (row:ScheduleRow):OptimizationSchedule => ({
  id:row.id, googleCustomerId:row.google_customer_id, accountName:row.account_name, enabled:row.enabled,
  scheduleType:row.schedule_type, runDay:row.run_day, scheduledDate:row.scheduled_date, runTime:row.run_time.slice(0,5),
  periodMode:row.period_mode, rollingDays:row.rolling_days, periodStartDate:row.period_start_date,
  periodEndDate:row.period_end_date, nextRunAt:row.next_run_at, lastRunAt:row.last_run_at,
  lastStatus:row.last_status, lastError:row.last_error,
});

function malaysiaParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kuala_Lumpur", year:"numeric", month:"2-digit", day:"2-digit" }).format(now).split("-").map(Number);
  return { year:parts[0], month:parts[1], day:parts[2] };
}

export function calculateScheduleNextRun(schedule:OptimizationSchedule, now = new Date()) {
  if (!schedule.enabled) return null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.runTime) ? schedule.runTime : "09:00";
  if (schedule.scheduleType === "once") {
    if (!schedule.scheduledDate) throw new Error("Select the one-time run date.");
    const candidate = new Date(`${schedule.scheduledDate}T${time}:00${MALAYSIA_OFFSET}`);
    return candidate > now ? candidate.toISOString() : now.toISOString();
  }
  const {year,month} = malaysiaParts(now);
  const day = schedule.runDay ?? 1;
  let candidate = new Date(`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${time}:00${MALAYSIA_OFFSET}`);
  if (candidate <= now) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    candidate = new Date(`${nextYear}-${String(nextMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}T${time}:00${MALAYSIA_OFFSET}`);
  }
  return candidate.toISOString();
}

export function validateSchedules(schedules:OptimizationSchedule[]) {
  const ids = new Set<string>();
  const capacity = new Map<string,number>();
  for (const item of schedules) {
    item.googleCustomerId = item.googleCustomerId.replace(/\D/g, "");
    if (!/^\d{10}$/.test(item.googleCustomerId)) throw new Error("Every schedule needs a valid Google Ads account ID.");
    if (ids.has(item.googleCustomerId)) throw new Error(`${item.accountName} was added more than once.`);
    ids.add(item.googleCustomerId);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.runTime)) throw new Error(`Select a valid run time for ${item.accountName}.`);
    if (item.scheduleType === "monthly" && (!Number.isInteger(item.runDay) || item.runDay! < 1 || item.runDay! > 28)) throw new Error(`Run day for ${item.accountName} must be from 1 to 28.`);
    if (item.periodMode === "rolling" && (!Number.isInteger(item.rollingDays) || item.rollingDays! < 1 || item.rollingDays! > 365)) throw new Error(`Past days for ${item.accountName} must be from 1 to 365.`);
    if (item.periodMode === "fixed" && (!item.periodStartDate || !item.periodEndDate || item.periodStartDate > item.periodEndDate)) throw new Error(`Select a valid analysis date range for ${item.accountName}.`);
    if (item.periodMode === "fixed" && item.scheduleType !== "once") throw new Error(`Fixed date ranges must use a one-time schedule for ${item.accountName}.`);
    if (!item.enabled) continue;
    const key = `day:${item.scheduleType === "monthly" ? item.runDay : Number(item.scheduledDate?.slice(-2))}`;
    const count = (capacity.get(key) ?? 0) + 1;
    if (count > 4) throw new Error("A maximum of four enabled accounts can be scheduled on the same day.");
    capacity.set(key,count);
  }
  return capacity;
}

export async function listOptimizationSchedules() {
  const rows = await supabaseRest<ScheduleRow[]>("ad_automation_search_term_schedules?select=*&order=account_name.asc");
  return rows.map(map);
}

export async function saveOptimizationSchedules(schedules:OptimizationSchedule[]) {
  validateSchedules(schedules);
  const existing = await listOptimizationSchedules();
  const keep = new Set(schedules.map(item=>item.googleCustomerId));
  for (const row of existing) if (!keep.has(row.googleCustomerId)) await supabaseRest(`ad_automation_search_term_schedules?google_customer_id=eq.${qs(row.googleCustomerId)}`, {method:"DELETE"});
  if (!schedules.length) return [];
  const rows = await supabaseRest<ScheduleRow[]>("ad_automation_search_term_schedules?on_conflict=google_customer_id", {
    method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=representation"}, body:jsonBody(schedules.map(item=>({
      google_customer_id:item.googleCustomerId, account_name:item.accountName, enabled:item.enabled, schedule_type:item.scheduleType,
      run_day:item.scheduleType === "monthly" ? item.runDay : null, scheduled_date:item.scheduleType === "once" ? item.scheduledDate : null,
      run_time:item.runTime, timezone:"Asia/Kuala_Lumpur", period_mode:item.periodMode,
      rolling_days:item.periodMode === "rolling" ? item.rollingDays : null, period_start_date:item.periodMode === "fixed" ? item.periodStartDate : null,
      period_end_date:item.periodMode === "fixed" ? item.periodEndDate : null, next_run_at:calculateScheduleNextRun(item), updated_at:new Date().toISOString(),
    })))
  });
  return rows.map(map).sort((a,b)=>a.accountName.localeCompare(b.accountName));
}

export type ClaimedScheduleRun = { runId:string; scheduleId:string; googleCustomerId:string; accountName:string; startDate:string; endDate:string; scheduledFor:string };

function malaysiaDate(value:Date) {
  return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
}

export async function claimDueOptimizationSchedules(now = new Date()) {
  const due = await supabaseRest<ScheduleRow[]>(`ad_automation_search_term_schedules?enabled=eq.true&next_run_at=lte.${qs(now.toISOString())}&select=*&order=next_run_at.asc&limit=4`);
  const claimed:ClaimedScheduleRun[] = [];
  for (const row of due) {
    const day = malaysiaDate(new Date(row.next_run_at ?? now));
    const runKey = `${row.id}:${row.next_run_at}`;
    const endDate = row.period_mode === "fixed" ? row.period_end_date! : day;
    const startDate = row.period_mode === "fixed" ? row.period_start_date! : malaysiaDate(new Date(new Date(`${day}T00:00:00${MALAYSIA_OFFSET}`).getTime() - ((row.rolling_days ?? 30) - 1) * 86400000));
    const runs = await supabaseRest<Array<{id:string}>>("ad_automation_search_term_schedule_runs?on_conflict=run_key", {method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:jsonBody({schedule_id:row.id,google_customer_id:row.google_customer_id,run_key:runKey,scheduled_for:row.next_run_at!,malaysia_run_date:day,status:"claimed"})});
    if (runs[0]) claimed.push({runId:runs[0].id,scheduleId:row.id,googleCustomerId:row.google_customer_id,accountName:row.account_name,startDate,endDate,scheduledFor:row.next_run_at!});
  }
  return claimed;
}

export async function updateOptimizationScheduleRun(input:{runId:string;status:"dispatched"|"running"|"completed"|"failed";dispatchId?:string;termsProcessed?:number;batchesCompleted?:number;error?:string}) {
  const runs = await supabaseRest<Array<{schedule_id:string;scheduled_for:string}>>(`ad_automation_search_term_schedule_runs?id=eq.${qs(input.runId)}&select=schedule_id,scheduled_for`);
  const run = runs[0];
  if (!run) throw new Error("Schedule run was not found.");
  const runChanges:Record<string,string|number|null>={status:input.status,dispatch_id:input.dispatchId??null,terms_processed:input.termsProcessed??0,batches_completed:input.batchesCompleted??0,error:input.error??null,updated_at:new Date().toISOString()};
  if(input.status==="running")runChanges.started_at=new Date().toISOString();
  if(["completed","failed"].includes(input.status))runChanges.completed_at=new Date().toISOString();
  await supabaseRest(`ad_automation_search_term_schedule_runs?id=eq.${qs(input.runId)}`, {method:"PATCH",body:jsonBody(runChanges)});
  const schedules = await supabaseRest<ScheduleRow[]>(`ad_automation_search_term_schedules?id=eq.${qs(run.schedule_id)}&select=*`);
  const schedule = schedules[0];
  if (!schedule) return;
  const mapped = map(schedule);
  const completed = input.status === "completed";
  const next = completed && schedule.schedule_type === "once" ? null : completed ? calculateScheduleNextRun(mapped,new Date(new Date(run.scheduled_for).getTime()+1000)) : schedule.next_run_at;
  await supabaseRest(`ad_automation_search_term_schedules?id=eq.${qs(run.schedule_id)}`, {method:"PATCH",body:jsonBody({enabled:completed&&schedule.schedule_type==="once"?false:schedule.enabled,next_run_at:next,last_run_at:completed?new Date().toISOString():schedule.last_run_at,last_status:input.status,last_error:input.error??null,updated_at:new Date().toISOString()})});
}
