"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type AnalysisProgress = { currentBatch:number; completedBatches:number; maxBatches:number; currentBatchSize:number; termsProcessed:number; progressComplete:boolean };

export function AnalysisProgressPanel({ title = "Analyzing search terms", label, compact = false, startedAt, activityAt, progress, showWorkerStatus = true, onStop, stopping = false }: { title?:string; label:string; compact?:boolean; startedAt?:string|null; activityAt?:string|null; progress?:AnalysisProgress; showWorkerStatus?:boolean; onStop?:()=>void; stopping?:boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (compact || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [compact, startedAt]);
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000)) : null;
  const activitySeconds = activityAt ? Math.max(0, Math.floor((now - Date.parse(activityAt)) / 1_000)) : null;
  const heartbeatHealthy = activitySeconds === null || activitySeconds < 10 * 60;
  const progressPercent = progress?.progressComplete ? 100 : Math.round(100 * (progress?.completedBatches ?? 0) / Math.max(1, progress?.maxBatches ?? 10));
  if (compact) return <div className="mt-3 flex items-center gap-3 text-sm font-medium text-neutral-600" role="status" aria-live="polite"><Spinner className="size-5 text-red-600" /><span>{label}</span></div>;
  return <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm" role="status" aria-live="polite">
    <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100"><Spinner className="size-5" /></span>
      <div className="min-w-0 flex-1"><p className="font-semibold text-neutral-900">{title}</p><p className="mt-0.5 truncate text-sm text-neutral-500">{progress?.currentBatch ? `Run ${progress.currentBatch} of ${progress.maxBatches} · analyzing ${progress.currentBatchSize} terms` : label}</p></div>
      {onStop ? <Button type="button" variant="outline" disabled={stopping} className="shrink-0 cursor-pointer" onClick={onStop}>{stopping ? <><Spinner className="size-4" />Force stopping…</> : "Force stop"}</Button> : <span className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500 sm:inline-flex">Please wait</span>}
    </div>
    <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-500"><span>{showWorkerStatus ? (elapsedSeconds === null ? "Analysis in progress" : `Elapsed ${formatElapsedTime(elapsedSeconds)}`) : "Loading saved results"}</span>{showWorkerStatus ? <span className={heartbeatHealthy ? "text-emerald-700" : "text-amber-700"}>{activitySeconds === null ? "Waiting for worker ping…" : heartbeatHealthy ? `Worker ping: ${activitySeconds}s ago` : `Worker ping: ${activitySeconds}s ago · checking status`}</span> : <span>Checking saved analysis...</span>}</div>
      <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200 ring-1 ring-inset ring-neutral-300/60"><div className="h-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-red-400 shadow-sm transition-[width] duration-500" style={{ width:`${progressPercent}%` }} /></div>
    </div>
  </div>;
}

function formatElapsedTime(totalSeconds:number) { const minutes=Math.floor(totalSeconds/60); const seconds=totalSeconds%60; return minutes>0?`${minutes}m ${seconds.toString().padStart(2,"0")}s`:`${seconds}s`; }
