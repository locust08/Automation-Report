export const ACTIVE_ANALYSIS_JOB_STATUSES = ["queued", "fetching", "running", "stopping", "needs_retry"] as const;
export const GLOBALLY_VISIBLE_ANALYSIS_JOB_STATUSES = ["queued", "fetching", "running", "stopping"] as const;
export type ActiveAnalysisJobStatus = (typeof ACTIVE_ANALYSIS_JOB_STATUSES)[number];
export type AnalysisJobStatus = ActiveAnalysisJobStatus | "stopped" | "completed" | "failed";

export type SearchTermAnalysisJobSummary = {
  jobId: string;
  accountId: string;
  accountName: string;
  status: AnalysisJobStatus;
  stage: string;
  totalTerms: number;
  plannedRuns: number;
  currentRun: number;
  completedRuns: number;
  currentRunTerms: number;
  termsProcessed: number;
  retryCount: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  activityAt: string;
  stale: boolean;
  progressComplete: boolean;
};

export type SearchTermAnalysisJobRecord = {
  id: string;
  google_customer_id: string;
  account_name: string;
  status: AnalysisJobStatus;
  stage: string;
  total_terms: number;
  planned_runs: number;
  current_run: number;
  completed_runs: number;
  terms_processed: number;
  retry_count: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  last_worker_ping_at: string | null;
};

const STALE_AFTER_MS = 10 * 60 * 1_000;

export function isActiveAnalysisJobStatus(status: AnalysisJobStatus): status is ActiveAnalysisJobStatus {
  return (ACTIVE_ANALYSIS_JOB_STATUSES as readonly string[]).includes(status);
}

export function isGloballyVisibleAnalysisJobStatus(status: AnalysisJobStatus): boolean {
  return (GLOBALLY_VISIBLE_ANALYSIS_JOB_STATUSES as readonly string[]).includes(status);
}

export function analysisRecoveryForMissingDashboard(job: SearchTermAnalysisJobSummary | null) {
  if (!job || job.status !== "needs_retry") return null;
  return {
    jobId: job.jobId,
    error: job.error ?? "This analysis needs retry. Completed runs were kept.",
  };
}

export function toSearchTermAnalysisJobSummary(job: SearchTermAnalysisJobRecord, now = Date.now()): SearchTermAnalysisJobSummary {
  const activityAt = job.last_worker_ping_at ?? job.updated_at;
  const currentRunTerms = job.current_run > 0
    ? Math.min(250, Math.max(0, job.total_terms - (job.current_run - 1) * 250))
    : 0;
  const executing = job.status === "fetching" || job.status === "running" || job.status === "stopping";
  const activityTime = Date.parse(activityAt);
  return {
    jobId: job.id,
    accountId: job.google_customer_id,
    accountName: job.account_name || "Google Ads account",
    status: job.status,
    stage: job.stage,
    totalTerms: job.total_terms,
    plannedRuns: job.planned_runs,
    currentRun: job.current_run,
    completedRuns: job.completed_runs,
    currentRunTerms,
    termsProcessed: job.terms_processed,
    retryCount: job.retry_count,
    error: job.error,
    startedAt: job.started_at ?? job.created_at,
    updatedAt: job.updated_at,
    activityAt,
    stale: executing && Number.isFinite(activityTime) && now - activityTime > STALE_AFTER_MS,
    progressComplete: job.status === "completed",
  };
}

export function analysisJobProgressPercent(job: SearchTermAnalysisJobSummary): number {
  if (job.progressComplete) return 100;
  if (job.plannedRuns <= 0) return 0;
  return Math.max(0, Math.min(99, Math.round(100 * job.completedRuns / job.plannedRuns)));
}

export function analysisJobsPollDelay(activeJobCount: number): number {
  return activeJobCount > 0 ? 2_000 : 30_000;
}

export function dedupeLatestAnalysisJobsByAccount(jobs: SearchTermAnalysisJobSummary[]): SearchTermAnalysisJobSummary[] {
  const seen = new Set<string>();
  return jobs.filter(job => {
    const accountId = job.accountId.replace(/\D/g, "");
    if (seen.has(accountId)) return false;
    seen.add(accountId);
    return true;
  });
}
