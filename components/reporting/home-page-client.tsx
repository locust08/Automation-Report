"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  EyeIcon,
  ListChecksIcon,
  Loader2Icon,
  LogOutIcon,
  MegaphoneIcon,
  SearchIcon,
  SendIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
type ManualReportType = "monthly" | "advanced" | "biweekly";
type ManualSendDeliveryMode = "test" | "live" | "dryRun";

interface ManualSendDetail {
  accountName: string;
  email: string | null;
  status: "sent" | "skipped" | "failed";
  notes: string | null;
}

interface ManualSendSummary {
  message: string;
  reportTypeLabel: string;
  totalCheckedAccounts: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  testMode: boolean;
  dryRun: boolean;
  deliveryMode: ManualSendDeliveryMode;
  actualRecipientBehavior: string;
  confirmationCheckboxProperty: string;
  checkedCount: number;
  resolvedAccountCount: number;
  notionRowsFetched: number;
  targetSource: string;
  warning: string | null;
  details: ManualSendDetail[];
  jobId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  reusedActiveJob?: boolean;
}

interface WorkerJobProgress {
  id: string;
  status: string;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  summary: Record<string, number>;
}

const MANUAL_REPORT_OPTIONS: Array<{
  value: ManualReportType;
  label: string;
  description: string;
  icon: typeof CalendarDaysIcon;
}> = [
  {
    value: "monthly",
    label: "Monthly Report",
    description: "Send the standard monthly performance report.",
    icon: CalendarDaysIcon,
  },
  {
    value: "advanced",
    label: "Advanced Report",
    description: "Send a detailed advanced performance report.",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "biweekly",
    label: "Bi-weekly Report",
    description: "Send the two-week performance report.",
    icon: CalendarDaysIcon,
  },
];

type HomePageClientProps = {
  displayName?: string;
  role?: string;
};

export function HomePageClient({ displayName, role }: HomePageClientProps) {
  const isBasicUser = role === "user";
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<ManualReportType>("monthly");
  const [isSending, setIsSending] = useState(false);
  const [sendSummary, setSendSummary] = useState<ManualSendSummary | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [workerJobId, setWorkerJobId] = useState<string | null>(null);
  const [workerProgress, setWorkerProgress] = useState<WorkerJobProgress | null>(null);
  const [workerClock, setWorkerClock] = useState(Date.now());

  const workerJobActive = Boolean(workerProgress && !isTerminalWorkerStatus(workerProgress.status));
  const sendControlsLocked = isSending || workerJobActive;
  const selectedReportAlreadyHandled = Boolean(
    sendSummary && !sendSummary.jobId && isTerminalWorkerStatus(sendSummary.status ?? "")
  );
  const sendActionDisabled = sendControlsLocked || selectedReportAlreadyHandled;

  useEffect(() => {
    if (!workerJobActive) return;
    const timer = window.setInterval(() => setWorkerClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [workerJobActive]);

  useEffect(() => {
    if (!workerJobId) return;
    let cancelled = false;

    async function refreshWorkerJob() {
      try {
        const response = await fetch(`/api/reports/manual-send?jobId=${encodeURIComponent(workerJobId ?? "")}`, {
          cache: "no-store",
        });
        const payload = await response.json() as {
          success?: boolean;
          error?: string;
          job?: Record<string, unknown>;
          summary?: Record<string, number>;
        };
        if (!response.ok || !payload.job) throw new Error(payload.error ?? "Unable to read Worker progress.");
        if (cancelled) return;
        const progress = normalizeWorkerProgress(payload.job, payload.summary);
        setWorkerProgress(progress);
        setWorkerClock(Date.now());
        if (isTerminalWorkerStatus(progress.status)) {
          setIsSending(false);
          setWorkerJobId(null);
        }
      } catch (error) {
        if (!cancelled) setSendError(error instanceof Error ? error.message : "Unable to read Worker progress.");
      }
    }

    void refreshWorkerJob();
    const timer = window.setInterval(refreshWorkerJob, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workerJobId]);

  useEffect(() => {
    if (workerJobId || isSending) return;
    let cancelled = false;
    void fetch(`/api/reports/manual-send?reportType=${encodeURIComponent(selectedReportType)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { job?: { id?: string } | null }) => {
        if (!cancelled && payload.job?.id) {
          setWorkerJobId(payload.job.id);
          setIsSending(true);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedReportType, workerJobId, isSending]);

  const overallHref = "/overall";
  const previewHref = "/preview";
  const advancedHref = "/advanced";
  const mediaPlanHref = "/dashboard/media-plan";
  const billingHref = "/billing";
  const googleOptimizationHref = "/google-optimization";

  async function handleManualSend() {
    setIsSending(true);
    setSendError(null);
    setSendSummary(null);

    let queuedWorkerJob = false;
    try {
      const response = await fetch("/api/reports/manual-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType: selectedReportType,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ManualSendSummary & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? `Manual send failed with HTTP ${response.status}.`);
      }

      setSendSummary({
        message: payload.message,
        reportTypeLabel: payload.reportTypeLabel,
        totalCheckedAccounts: payload.totalCheckedAccounts,
        sentCount: payload.sentCount,
        skippedCount: payload.skippedCount,
        failedCount: payload.failedCount,
        testMode: Boolean(payload.testMode),
        dryRun: Boolean(payload.dryRun),
        deliveryMode: payload.deliveryMode,
        actualRecipientBehavior: payload.actualRecipientBehavior,
        confirmationCheckboxProperty: payload.confirmationCheckboxProperty,
        checkedCount: payload.checkedCount,
        resolvedAccountCount: payload.resolvedAccountCount,
        notionRowsFetched: payload.notionRowsFetched,
        targetSource: payload.targetSource,
        warning: payload.warning ?? null,
        details: Array.isArray(payload.details) ? payload.details : [],
        jobId: payload.jobId ?? null,
        status: payload.status ?? null,
        createdAt: payload.createdAt ?? null,
        reusedActiveJob: Boolean(payload.reusedActiveJob),
      });
      if (payload.jobId) {
        queuedWorkerJob = true;
        setWorkerJobId(payload.jobId);
        setWorkerProgress({
          id: payload.jobId,
          status: payload.status ?? "queued",
          totalItems: payload.totalCheckedAccounts,
          createdAt: payload.createdAt ?? new Date().toISOString(),
          updatedAt: payload.createdAt ?? new Date().toISOString(),
          summary: { queued: payload.totalCheckedAccounts },
        });
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Manual send failed.");
    } finally {
      if (!queuedWorkerJob) setIsSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-4 py-8">
      <div className="w-full max-w-4xl space-y-3">
        {displayName && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/25 bg-black/40 px-5 py-3 text-white backdrop-blur-sm">
            <p className="min-w-0 truncate text-sm font-medium sm:text-base">
              Welcome, <span className="font-semibold">{displayName}</span>
            </p>
            <form action="/api/auth/logout" method="post">
              <Button
                type="submit"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <LogOutIcon className="size-4" />
                Logout
              </Button>
            </form>
          </div>
        )}
        <div className="rounded-3xl border border-white/25 bg-black/40 p-6 text-white backdrop-blur-sm sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl md:text-5xl">
          Ads Reporting Dashboard
        </h1>

        <section
          className="mt-8 rounded-2xl border border-white/20 bg-white/[0.06] p-4 sm:p-5"
          aria-labelledby="reports-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="reports-heading" className="text-lg font-semibold">Reports</h2>
              <p className="mt-1 text-sm text-white/65">Open a report, then search for its advertising account there.</p>
            </div>
            <span className="w-fit shrink-0 whitespace-nowrap rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              Choose account inside
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Button asChild className="h-auto min-h-14 whitespace-normal bg-red-600 px-4 py-3 text-center font-semibold leading-snug hover:bg-red-700">
              <Link href={overallHref}>
                View Monthly Performance
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto min-h-14 whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center text-white hover:bg-white/20 hover:text-white">
              <Link href={previewHref}>
                Campaign Preview
                <EyeIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto min-h-14 whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center text-white hover:bg-white/20 hover:text-white">
              <Link href={advancedHref}>
                Open Advanced Report
                <SlidersHorizontalIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>

        {!isBasicUser ? <section
          className="mt-5 rounded-2xl border border-white/20 bg-white/[0.06] p-4 sm:p-5"
          aria-labelledby="dashboard-tools-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="dashboard-tools-heading" className="text-lg font-semibold">Dashboard tools</h2>
              <p className="mt-1 text-sm text-white/65">Open these workflows directly. Select their account inside the destination page when needed.</p>
            </div>
            <span className="w-fit shrink-0 whitespace-nowrap rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              No account required here
            </span>
          </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Button
            type="button"
            onClick={() => {
              setIsSendModalOpen(true);
              setSendError(null);
            }}
            disabled={sendControlsLocked}
            className="h-auto min-h-14 w-full whitespace-normal bg-red-600 px-4 py-3 text-center font-semibold leading-snug shadow-lg shadow-red-950/25 hover:bg-red-700"
          >
            Send Report
            <SendIcon data-icon="inline-end" />
          </Button>
          <a
            href={mediaPlanHref}
            className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <ClipboardListIcon className="size-5" />
              Create Media Plan
            </span>
          </a>
          <a
            href={billingHref}
            className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <ListChecksIcon className="size-5" />
              Daily Billing
            </span>
          </a>
        </div>

        <section className="mt-5" aria-labelledby="campaigns-heading">
          <h2 id="campaigns-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">Campaigns</h2>
          <Link
            href="/campaigns"
            className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <MegaphoneIcon className="size-5" />
              Campaign Planning &amp; Launch
            </span>
          </Link>
        </section>

        <section className="mt-5" aria-labelledby="google-tools-heading">
          <h2 id="google-tools-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">Google</h2>
          <div className={`grid gap-3 ${role === "admin" ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
            <Link
              href="/manage/google"
              className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <SlidersHorizontalIcon className="size-5" />
                Edit Google Ads
              </span>
            </Link>
            {role === "admin" ? <a
              href={googleOptimizationHref}
              className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <SearchIcon className="size-5" />
                Google Optimization
              </span>
            </a> : null}
            {role === "admin" ? <a
              href="/optimization-scheduling"
              className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <CalendarDaysIcon className="size-5" />
                Optimization Scheduling
              </span>
            </a> : null}
          </div>
        </section>

        </section> : null}
        </div>
      </div>

      {isSendModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/25 bg-black/70 p-5 text-white shadow-2xl backdrop-blur-md sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10">
                  <SendIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Send Report Manually</h2>
                  <p className="mt-1 text-sm text-white/70">Only checked accounts in Notion will be sent.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSendModalOpen(false)}
                disabled={sendControlsLocked}
                className="rounded-md p-1 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Close send report modal"
              >
                <XIcon className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {MANUAL_REPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedReportType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedReportType(option.value);
                      setSendSummary(null);
                      setSendError(null);
                      setWorkerProgress(null);
                    }}
                    disabled={sendControlsLocked}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                      isSelected
                        ? "border-white/35 bg-white/15"
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                        isSelected ? "border-red-500 bg-red-600" : "border-white/35"
                      }`}
                    >
                      {isSelected ? <span className="size-2 rounded-full bg-white" /> : null}
                    </span>
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-600/80">
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-sm text-white/70">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {sendError ? (
              <div className="mt-4 rounded-lg border border-red-300/30 bg-red-950/45 p-3 text-sm text-red-100">
                {sendError}
              </div>
            ) : null}

            {workerProgress && sendControlsLocked ? (
              <WorkerSendProgress progress={workerProgress} now={workerClock} />
            ) : null}

            {sendSummary ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                  <p className="text-sm font-semibold">{sendSummary.message}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {sendSummary.actualRecipientBehavior}
                  </p>
                  {sendSummary.failedCount > 0 && sendSummary.warning ? (
                    <div className="mt-3 rounded-md border border-red-300/25 bg-red-950/35 p-3 text-sm text-red-100">
                      {sendSummary.warning}
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <SummaryStat label="Report" value={sendSummary.reportTypeLabel} />
                    <SummaryStat label="Mode" value={formatDeliveryMode(sendSummary.deliveryMode)} />
                    <SummaryStat label="Checked" value={String(sendSummary.totalCheckedAccounts)} />
                    <SummaryStat label="Sent" value={String(sendSummary.sentCount)} />
                    <SummaryStat label="Skipped" value={String(sendSummary.skippedCount)} />
                    <SummaryStat label="Failed" value={String(sendSummary.failedCount)} />
                    <SummaryStat label="Source" value={formatTargetSource(sendSummary.targetSource)} />
                    <SummaryStat label="Notion Rows" value={String(sendSummary.notionRowsFetched)} />
                  </div>
                </div>

                {sendSummary.details.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-white/15">
                    <div className="max-h-60 overflow-auto">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                        <thead className="sticky top-0 bg-red-950/90 text-white">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Account</th>
                            <th className="px-3 py-2 font-semibold">Email</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                            <th className="px-3 py-2 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {sendSummary.details.map((detail, index) => (
                            <tr key={`${detail.accountName}-${index}`} className="bg-white/[0.03]">
                              <td className="px-3 py-2 font-medium">{detail.accountName}</td>
                              <td className="px-3 py-2 text-white/75">{detail.email || "-"}</td>
                              <td className="px-3 py-2 capitalize">{detail.status}</td>
                              <td className="px-3 py-2 text-white/75">{detail.notes || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3 border-t border-white/15 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSendModalOpen(false)}
                disabled={sendControlsLocked}
                className="border-white/25 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleManualSend}
                disabled={sendActionDisabled}
                className="bg-red-600 hover:bg-red-700"
              >
                {sendControlsLocked ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    Sending
                  </>
                ) : selectedReportAlreadyHandled ? (
                  <>Already handled</>
                ) : (
                  <>
                    Send Now
                    <SendIcon data-icon="inline-end" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function formatDeliveryMode(value: ManualSendDeliveryMode): string {
  if (value === "dryRun") {
    return "Dry run";
  }
  if (value === "test") {
    return "Test delivery";
  }
  return "Live delivery";
}

function normalizeWorkerProgress(
  job: Record<string, unknown>,
  summary: Record<string, number> | undefined
): WorkerJobProgress {
  return {
    id: String(job.id ?? ""),
    status: String(job.status ?? "queued"),
    totalItems: Number(job.total_items ?? 0),
    createdAt: String(job.created_at ?? new Date().toISOString()),
    updatedAt: String(job.updated_at ?? job.created_at ?? new Date().toISOString()),
    summary: summary ?? {},
  };
}

function isTerminalWorkerStatus(status: string): boolean {
  return status === "completed" || status === "completed_with_failures" || status === "empty" || status === "skipped";
}

function formatWorkerDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

function WorkerSendProgress({ progress, now }: { progress: WorkerJobProgress; now: number }) {
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(progress.createdAt)) / 1_000));
  const activitySeconds = Math.max(0, Math.floor((now - Date.parse(progress.updatedAt)) / 1_000));
  const completed = progress.summary.completed ?? 0;
  const failed = progress.summary.failed ?? 0;
  const terminal = completed + failed;
  const percent = progress.totalItems > 0 ? Math.min(100, Math.round((terminal / progress.totalItems) * 100)) : 0;
  const stage = progress.status === "queued" ? "Worker queued" : "Generating PDFs and sending reports";

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-white/20 bg-black/25" role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-4 py-4">
        <Loader2Icon className="size-5 animate-spin text-red-300" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{stage}</p>
          <p className="mt-1 text-sm text-white/65">Keep this window open; progress also resumes after refresh.</p>
        </div>
      </div>
      <div className="border-t border-white/10 bg-white/5 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
          <span>Elapsed {formatWorkerDuration(elapsedSeconds)}</span>
          <span className={activitySeconds < 30 ? "text-emerald-300" : "text-amber-300"}>
            {activitySeconds < 30 ? `Worker active · ${activitySeconds}s ago` : `No update for ${activitySeconds}s · checking...`}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-red-300 transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
          <SummaryStat label="Queued" value={String(progress.summary.queued ?? 0)} />
          <SummaryStat label="Processing" value={String(progress.summary.processing ?? 0)} />
          <SummaryStat label="Retrying" value={String(progress.summary.retrying ?? 0)} />
          <SummaryStat label="Completed" value={String(completed)} />
          <SummaryStat label="Failed" value={String(failed)} />
          <SummaryStat label="Progress" value={`${percent}%`} />
        </div>
      </div>
    </div>
  );
}

function formatTargetSource(value: string): string {
  if (value === "notion") {
    return "Notion";
  }
  if (value === "configured") {
    return "Configured";
  }
  if (value === "override") {
    return "Override";
  }
  return "Unknown";
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase text-white/55">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
    </div>
  );
}
