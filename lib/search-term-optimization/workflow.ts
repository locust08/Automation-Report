import { randomUUID } from "node:crypto";

import { getSearchTermReviewReport } from "@/lib/reporting/service";
import { analyzeSearchTerms } from "@/lib/search-term-optimization/analyzer";
import { publishExactNegative, undoExactNegative } from "@/lib/search-term-optimization/google-mutation";
import {
  getSearchTermOptimizationRepository,
  searchTermPersistenceMode,
} from "@/lib/search-term-optimization/repository";
import type {
  SearchTermAnalysisRun,
  SearchTermDashboardPayload,
  SearchTermOptimizationRecord,
} from "@/lib/search-term-optimization/types";

export async function loadSearchTermDashboard(input: {
  accountId: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<SearchTermDashboardPayload> {
  const repository = getSearchTermOptimizationRepository();
  const [settings, latestRun, rows] = await Promise.all([
    repository.getSettings(input.accountId),
    repository.getLatestRun(input.accountId),
    repository.listRecords(input.accountId),
  ]);
  return {
    companyName: latestRun?.companyName ?? `Account ${formatCid(input.accountId)}`,
    accountId: input.accountId,
    startDate: latestRun?.startDate ?? input.startDate ?? "",
    endDate: latestRun?.endDate ?? input.endDate ?? "",
    settings,
    latestRun,
    rows,
    warnings:
      searchTermPersistenceMode() === "memory"
        ? ["Supabase is not configured. Results are stored in temporary server memory and automatic publishing remains server-gated."]
        : [],
  };
}

export async function runSearchTermAnalysis(input: {
  accountId: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<SearchTermDashboardPayload> {
  const repository = getSearchTermOptimizationRepository();
  const settings = await repository.getSettings(input.accountId);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const running: SearchTermAnalysisRun = {
    id: runId,
    accountId: input.accountId,
    companyName: `Account ${formatCid(input.accountId)}`,
    status: "running",
    startedAt,
    completedAt: null,
    startDate: input.startDate ?? "",
    endDate: input.endDate ?? "",
    totalReviewed: 0,
    error: null,
  };
  await repository.saveRun(running);
  try {
    const report = await getSearchTermReviewReport({
      accountId: input.accountId,
      googleAccountId: input.accountId,
      metaAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const analysis = await analyzeSearchTerms({ report, settings, runId });
    const rows = await executeEligibleRows(analysis.rows);
    const completed: SearchTermAnalysisRun = {
      ...running,
      companyName: report.companyName,
      status: "completed",
      completedAt: new Date().toISOString(),
      startDate: report.dateRange.startDate,
      endDate: report.dateRange.endDate,
      totalReviewed: rows.length,
    };
    await Promise.all([repository.saveRun(completed), repository.saveRecords(rows)]);
    if (settings.cadence !== "off") {
      await repository.saveSettings({
        ...settings,
        nextRunAt: calculateNextRun(settings.cadence),
        updatedAt: new Date().toISOString(),
      });
    }
    const dashboard = await loadSearchTermDashboard({
      accountId: input.accountId,
      startDate: completed.startDate,
      endDate: completed.endDate,
    });
    dashboard.companyName = report.companyName;
    dashboard.warnings.push(...report.warnings, ...analysis.warnings);
    return dashboard;
  } catch (error) {
    await repository.saveRun({
      ...running,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runDueSearchTermAnalyses() {
  const repository = getSearchTermOptimizationRepository();
  const due = await repository.listDueSettings(new Date().toISOString());
  const results: Array<{ accountId: string; status: "completed" | "failed"; error?: string }> = [];
  for (const settings of due) {
    try {
      await runSearchTermAnalysis({ accountId: settings.accountId, startDate: null, endDate: null });
      results.push({ accountId: settings.accountId, status: "completed" });
    } catch (error) {
      results.push({ accountId: settings.accountId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checkedAt: new Date().toISOString(), dueCount: due.length, results };
}

export async function updateSearchTermSettings(input: {
  accountId: string;
  automationEnabled: boolean;
  cadence: "off" | "weekly" | "biweekly" | "monthly";
}) {
  const repository = getSearchTermOptimizationRepository();
  const settings = {
    ...input,
    nextRunAt: calculateNextRun(input.cadence),
    updatedAt: new Date().toISOString(),
  };
  await repository.saveSettings(settings);
  return settings;
}

export async function undoSearchTermRecord(id: string): Promise<SearchTermOptimizationRecord> {
  const repository = getSearchTermOptimizationRepository();
  const record = await repository.getRecord(id);
  if (!record) throw new Error("Search-term history record was not found.");
  if (record.executionStatus !== "verified") throw new Error("Only verified automatic exclusions can be undone.");
  const result = await undoExactNegative(record);
  if (result.status === "failed") throw new Error(result.message);
  const updated: SearchTermOptimizationRecord = {
    ...record,
    executionStatus: result.status === "verified" ? "undone" : record.executionStatus,
    verificationStatus: result.status === "verified" ? "verified" : record.verificationStatus,
    googleResourceName: result.resourceName,
    undoneAt: result.status === "verified" ? new Date().toISOString() : record.undoneAt,
    reason: `${record.reason} Undo: ${result.message}`,
  };
  await repository.saveRecord(updated);
  return updated;
}

async function executeEligibleRows(rows: SearchTermOptimizationRecord[]) {
  const results: SearchTermOptimizationRecord[] = [];
  for (const row of rows) {
    if (!row.executionEligibility) {
      results.push(row);
      continue;
    }
    const mutation = await publishExactNegative(row).catch((error) => ({
      status: "failed" as const,
      resourceName: null,
      message: error instanceof Error ? error.message : String(error),
    }));
    results.push({
      ...row,
      executionStatus:
        mutation.status === "verified"
          ? "verified"
          : mutation.status === "failed"
            ? "failed"
            : "pending",
      verificationStatus: mutation.status === "verified" ? "verified" : mutation.status === "failed" ? "failed" : "not_started",
      googleResourceName: mutation.resourceName,
      executedAt: mutation.status !== "skipped" ? new Date().toISOString() : null,
      verifiedAt: mutation.status === "verified" ? new Date().toISOString() : null,
      reason: `${row.reason} Publishing: ${mutation.message}`,
    });
  }
  return results;
}

function calculateNextRun(cadence: "off" | "weekly" | "biweekly" | "monthly") {
  if (cadence === "off") return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + (cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : 30));
  return date.toISOString();
}

function formatCid(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : value;
}
