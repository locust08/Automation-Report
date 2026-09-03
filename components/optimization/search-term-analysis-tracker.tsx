"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, ChevronDownIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";

import {
  analysisJobProgressPercent,
  analysisJobsPollDelay,
  type SearchTermAnalysisJobSummary,
} from "@/lib/search-term-optimization/job-summary";

type TrackerContextValue = {
  jobs: SearchTermAnalysisJobSummary[];
  refreshJobs: () => Promise<void>;
};

const TrackerContext = createContext<TrackerContextValue>({ jobs: [], refreshJobs: async () => undefined });

export function useSearchTermAnalysisJobs() {
  return useContext(TrackerContext);
}

export function SearchTermAnalysisTracker({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<SearchTermAnalysisJobSummary[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/search-term-optimization/jobs?status=active", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setAuthorized(false);
        setJobs([]);
        return;
      }
      if (!response.ok) return;
      const payload = await response.json() as { jobs?: SearchTermAnalysisJobSummary[] };
      setAuthorized(true);
      setJobs(payload.jobs ?? []);
    } catch {
      // Keep the last shared state visible during a transient network failure.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshJobs]);
  useEffect(() => {
    if (authorized === false) return;
    const timer = window.setTimeout(() => void refreshJobs(), analysisJobsPollDelay(jobs.length));
    return () => window.clearTimeout(timer);
  }, [authorized, jobs, refreshJobs]);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshJobs(); };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshJobs]);

  const value = useMemo(() => ({ jobs, refreshJobs }), [jobs, refreshJobs]);
  const screenshotMode = searchParams.get("screenshot") === "1" || searchParams.get("screenshot") === "true";
  const leadJob = jobs[0];
  const needsAttention = leadJob?.status === "needs_retry" || leadJob?.stale;
  const runningCount = jobs.filter(job => job.status !== "needs_retry" && !job.stale).length;
  const attentionCount = jobs.length - runningCount;

  return (
    <TrackerContext.Provider value={value}>
      {children}
      {authorized && !screenshotMode && leadJob ? (
        <aside className="fixed right-3 top-3 z-[100] w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-md" aria-label="Google Optimization progress">
          <button type="button" className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(current => !current)} aria-expanded={open}>
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              {needsAttention ? <AlertTriangleIcon className="size-5" /> : <LoaderCircleIcon className="size-5 animate-spin" />}
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-700 px-1 text-center text-[10px] font-bold leading-5 text-white">{jobs.length}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-950">{needsAttention ? "Google Optimization needs attention" : "Google Optimization running"}</span>
              <span className="block truncate text-xs text-neutral-500">{jobs.length === 1 ? `${leadJob.accountName} · ${leadJob.stage}` : runningCount > 0 ? `${runningCount} running · ${attentionCount} need attention` : `${attentionCount} accounts need attention`}</span>
            </span>
            <ChevronDownIcon className={`size-4 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <div className="h-1 bg-neutral-100"><div className="h-full bg-red-700 transition-[width] duration-500" style={{ width: `${analysisJobProgressPercent(leadJob)}%` }} /></div>
          {open ? (
            <div className="max-h-[min(65vh,32rem)] space-y-2 overflow-y-auto border-t border-neutral-100 p-3">
              {jobs.map(job => <AnalysisJobItem key={job.jobId} job={job} />)}
            </div>
          ) : null}
        </aside>
      ) : null}
    </TrackerContext.Provider>
  );
}

function AnalysisJobItem({ job }: { job: SearchTermAnalysisJobSummary }) {
  const percent = analysisJobProgressPercent(job);
  const attention = job.status === "needs_retry" || job.stale;
  return (
    <Link href={`/google-optimization?googleAccountId=${encodeURIComponent(job.accountId)}&tab=search-terms`} className="block rounded-xl border border-neutral-200 p-3 transition hover:border-red-200 hover:bg-red-50/40">
      <div className="flex items-start gap-2">
        {attention ? <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-red-700" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-neutral-950">{job.accountName}</p><span className="text-xs font-semibold tabular-nums text-neutral-600">{percent}%</span></div>
          <p className="mt-0.5 text-xs text-neutral-500">CID {job.accountId}</p>
          <p className={`mt-1 line-clamp-2 text-xs ${attention ? "text-amber-700" : "text-neutral-600"}`}>{job.status === "needs_retry" ? <><RotateCcwIcon className="mr-1 inline size-3" />Retry needed</> : job.stale ? "Worker update is delayed; open for recovery options" : job.stage}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${attention ? "bg-amber-500" : "bg-red-700"}`} style={{ width: `${percent}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-neutral-500">{job.completedRuns}/{job.plannedRuns || "—"} runs · {job.termsProcessed.toLocaleString("en-MY")} terms</p>
        </div>
      </div>
    </Link>
  );
}
