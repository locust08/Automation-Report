import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisRecoveryForMissingDashboard,
  analysisJobProgressPercent,
  analysisJobsPollDelay,
  dedupeLatestAnalysisJobsByAccount,
  isGloballyVisibleAnalysisJobStatus,
  isActiveAnalysisJobStatus,
  toSearchTermAnalysisJobSummary,
} from "./job-summary";

const baseJob = {
  id: "d1457610-727c-4de8-a01d-5e63b9963e1c",
  google_customer_id: "1234567890",
  account_name: "Example Account",
  status: "running" as const,
  stage: "Analyzing search terms",
  total_terms: 750,
  planned_runs: 3,
  current_run: 2,
  completed_runs: 1,
  terms_processed: 250,
  retry_count: 0,
  error: null,
  started_at: "2026-09-02T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-09-02T00:00:00.000Z",
  updated_at: "2026-09-02T00:04:00.000Z",
  last_worker_ping_at: "2026-09-02T00:04:00.000Z",
};

test("treats retry-needed jobs as visible but terminal jobs as inactive", () => {
  for (const status of ["queued", "fetching", "running", "stopping", "needs_retry"] as const) {
    assert.equal(isActiveAnalysisJobStatus(status), true, status);
  }
  for (const status of ["stopped", "completed", "failed"] as const) {
    assert.equal(isActiveAnalysisJobStatus(status), false, status);
  }
});

test("global tracker excludes retry-needed jobs that are no longer executing", () => {
  for (const status of ["queued", "fetching", "running", "stopping"] as const) {
    assert.equal(isGloballyVisibleAnalysisJobStatus(status), true, status);
  }
  for (const status of ["needs_retry", "stopped", "completed", "failed"] as const) {
    assert.equal(isGloballyVisibleAnalysisJobStatus(status), false, status);
  }
});

test("restores retry controls when an account has no dashboard but has a failed durable job", () => {
  const recovery = analysisRecoveryForMissingDashboard({
    ...toSearchTermAnalysisJobSummary({
      ...baseJob,
      status: "needs_retry",
      error: "Run 1 could not be committed atomically",
    }),
  });

  assert.deepEqual(recovery, {
    jobId: baseJob.id,
    error: "Run 1 could not be committed atomically",
  });
  assert.equal(analysisRecoveryForMissingDashboard(null), null);
});

test("normalizes durable jobs for the shared progress UI", () => {
  const summary = toSearchTermAnalysisJobSummary(baseJob, Date.parse("2026-09-02T00:05:00.000Z"));

  assert.deepEqual(summary, {
    jobId: baseJob.id,
    accountId: "1234567890",
    accountName: "Example Account",
    status: "running",
    stage: "Analyzing search terms",
    totalTerms: 750,
    plannedRuns: 3,
    currentRun: 2,
    completedRuns: 1,
    currentRunTerms: 250,
    termsProcessed: 250,
    retryCount: 0,
    error: null,
    startedAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:04:00.000Z",
    activityAt: "2026-09-02T00:04:00.000Z",
    stale: false,
    progressComplete: false,
  });
  assert.equal(analysisJobProgressPercent(summary), 33);
});

test("marks an executing job stale after ten minutes without worker activity", () => {
  const summary = toSearchTermAnalysisJobSummary(baseJob, Date.parse("2026-09-02T00:14:01.000Z"));
  assert.equal(summary.stale, true);
});

test("does not mark queued or retry-needed work stale", () => {
  for (const status of ["queued", "needs_retry"] as const) {
    const summary = toSearchTermAnalysisJobSummary({ ...baseJob, status }, Date.parse("2026-09-02T01:00:00.000Z"));
    assert.equal(summary.stale, false, status);
  }
});

test("polls rapidly with active work and backs off while idle", () => {
  assert.equal(analysisJobsPollDelay(2), 2_000);
  assert.equal(analysisJobsPollDelay(0), 30_000);
});

test("keeps only the newest visible job for each Google Ads account", () => {
  const newest = toSearchTermAnalysisJobSummary({ ...baseJob, id: "newest" });
  const duplicate = toSearchTermAnalysisJobSummary({ ...baseJob, id: "older", updated_at: "2026-09-01T23:00:00.000Z" });
  const other = toSearchTermAnalysisJobSummary({ ...baseJob, id: "other", google_customer_id: "9999999999" });

  assert.deepEqual(dedupeLatestAnalysisJobsByAccount([newest, duplicate, other]).map(job => job.jobId), ["newest", "other"]);
});
