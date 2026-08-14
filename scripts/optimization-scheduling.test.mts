import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { OptimizationSchedule } from "../lib/optimization-scheduling/service";

const require=createRequire(import.meta.url);
const {calculateScheduleNextRun,validateSchedules}=require("../lib/optimization-scheduling/service") as typeof import("../lib/optimization-scheduling/service");

const schedule=(id:number,day:number,enabled=true):OptimizationSchedule=>({googleCustomerId:String(1000000000+id),accountName:`Account ${id}`,enabled,scheduleType:"monthly",runDay:day,scheduledDate:null,runTime:"09:00",periodMode:"rolling",rollingDays:30,periodStartDate:null,periodEndDate:null});
validateSchedules([schedule(1,12),schedule(2,12),schedule(3,12),schedule(4,12)]);
assert.throws(()=>validateSchedules([schedule(1,12),schedule(2,12),schedule(3,12),schedule(4,12),schedule(5,12)]),/maximum of four/i);
validateSchedules([schedule(1,12),schedule(2,12),schedule(3,12),schedule(4,12),schedule(5,12,false)]);
const once={...schedule(6,13),scheduleType:"once" as const,runDay:null,scheduledDate:"2026-09-12"};
assert.throws(()=>validateSchedules([schedule(1,12),schedule(2,12),schedule(3,12),schedule(4,12),once]),/maximum of four/i);
assert.equal(calculateScheduleNextRun(schedule(1,12),new Date("2026-08-11T00:00:00Z")),"2026-08-12T01:00:00.000Z");
console.log("optimization scheduling passed");
