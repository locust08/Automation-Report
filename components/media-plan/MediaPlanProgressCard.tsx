import { ClockIcon, ImageIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MediaPlanOperationProgress } from "@/lib/media-plan/schema";

export function MediaPlanProgressCard({ progress }: { progress: MediaPlanOperationProgress }) {
  return (
    <section className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ed0017] text-white shadow-sm">
          <ImageIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-tight text-[#111827]">{progress.title}</h2>
            <Badge className="gap-1.5 border border-[#fecdd3] bg-[#fff1f2] text-[#d4001a] hover:bg-[#fff1f2]">
              <Loader2Icon className="size-3.5 animate-spin" />
              {progress.statusLabel}
            </Badge>
          </div>
          {progress.message ? (
            <p className="mt-1 text-sm font-medium text-[#667085]">{progress.message}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-[#667085]">
            <span className="flex items-center gap-1.5">
              <ClockIcon className="size-4" />
              Elapsed: {formatDuration(progress.elapsedMs)}
            </span>
            <span>
              {progress.estimatedRemainingMs === null
                ? "Timing unavailable"
                : `${formatDuration(progress.estimatedRemainingMs)} remaining`}
            </span>
          </div>
          <p className="text-xl font-bold text-[#d4001a]">{progress.percent}%</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[#ededed]">
          <div
            className="h-full rounded-full bg-[#ed0017] transition-all duration-700"
            style={{ width: `${progress.percent}%` }}
          />
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
