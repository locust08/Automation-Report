import { BarChart3Icon, ClockIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MediaPlanOperationProgress } from "@/lib/media-plan/schema";

export function MediaPlanProgressCard({ progress }: { progress: MediaPlanOperationProgress }) {
  if (progress.status !== "running") {
    return null;
  }

  const activeStep = progress.steps.find((step) => step.status === "in_progress");
  const completedSteps = progress.steps.filter((step) => step.status === "completed").length;
  const operationLabel =
    progress.operation === "approve_create" ? "Approve & Create Paused Campaign" : "Generating Media Plan";
  const remainingLabel =
    progress.estimatedRemainingMs === null
      ? "Timing unavailable"
      : `${formatDuration(progress.estimatedRemainingMs)} left`;

  return (
    <section
      role="status"
      aria-live="polite"
      className="media-plan-progress-float report-loading-enter pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-[min(calc(100vw-2rem),22rem)] rounded-3xl border border-white/75 bg-white/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl md:inset-x-auto md:bottom-auto md:right-6 md:top-52 md:mx-0 md:w-72 xl:right-10"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1f2] text-[#d4001a] shadow-sm">
          <BarChart3Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-[#111827]">Media Plan Progress</h2>
          <p className="truncate text-sm font-medium text-[#667085]">{operationLabel}</p>
        </div>
        <Badge className="shrink-0 gap-1 border border-[#fecdd3] bg-[#fff1f2] px-2 py-1 text-[#d4001a] hover:bg-[#fff1f2]">
          <Loader2Icon className="size-3 animate-spin" />
          {progress.statusLabel}
        </Badge>
      </div>

      <div className="relative mx-auto mt-6 flex size-40 items-center justify-center">
        <div className="report-loading-dots absolute inset-0 rounded-full border-[3px] border-dotted border-[#ff7a87]/55" />
        <div className="report-loading-arc-reverse absolute inset-3 rounded-full border-[8px] border-transparent border-r-[#ffe1e5] border-t-[#ffe1e5]" />
        <div
          className="relative flex size-[8.5rem] items-center justify-center rounded-full p-2 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)] transition-all duration-700"
          style={{
            background: `conic-gradient(#ed0017 ${progress.percent * 3.6}deg, #eef0f3 ${progress.percent * 3.6}deg 360deg)`,
          }}
        >
          <div className="report-loading-core flex size-full flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_18px_36px_rgba(15,23,42,0.10)]">
            <span className="text-4xl font-black leading-none tracking-normal text-[#111827]">
              {progress.percent}%
            </span>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-normal text-[#d4001a]">
              In progress
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 text-center">
        <p className="text-xs font-medium text-[#667085]">Current Step</p>
        <p className="mt-1 text-base font-extrabold leading-snug text-[#111827]">
          {activeStep?.label ?? progress.statusLabel}
        </p>
        {progress.message ? (
          <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-[#667085]">{progress.message}</p>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-[#eceff3] bg-[#fafafa] px-3 py-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8a94a6]">Elapsed</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-[#344054]">
            <ClockIcon className="size-3.5" />
            {formatDuration(progress.elapsedMs)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#eceff3] bg-[#fafafa] px-3 py-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8a94a6]">Remaining</p>
          <p className="mt-1 text-sm font-bold text-[#344054]">{remainingLabel}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-[#edf0f4] pt-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[#667085]">
          <span>
            Step {Math.min(completedSteps + 1, progress.steps.length)} of {progress.steps.length}
          </span>
          <span>{progress.percent}%</span>
        </div>
      </div>
    </section>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds} sec`;
  }
  return `${minutes} min ${String(remainingSeconds).padStart(2, "0")} sec`;
}
