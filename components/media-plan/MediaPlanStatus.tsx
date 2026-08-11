import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  SendIcon,
  XCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { MediaPlanStatus } from "@/lib/media-plan/schema";

const STATUS_STEPS: Array<{
  status: MediaPlanStatus;
  icon: ComponentType<{ className?: string }>;
}> = [
  { status: "Draft", icon: CircleDashedIcon },
  { status: "Generating", icon: Loader2Icon },
  { status: "Generated", icon: CheckCircle2Icon },
  { status: "Edited", icon: PencilIcon },
  { status: "Validation Error", icon: TriangleAlertIcon },
  { status: "Ready for Approval", icon: CircleIcon },
  { status: "Saving to Notion", icon: Loader2Icon },
  { status: "Saved to Notion", icon: SaveIcon },
  { status: "Creating Google Ads Campaign", icon: Loader2Icon },
  { status: "Created Paused", icon: SendIcon },
  { status: "Failed", icon: XCircleIcon },
];

export function MediaPlanStatusBar({
  currentStatus,
  issueCount,
  activeStatuses = [currentStatus],
}: {
  currentStatus: MediaPlanStatus;
  issueCount: number;
  activeStatuses?: MediaPlanStatus[];
}) {
  return (
    <div
      className="w-full rounded-2xl border border-white/10 bg-[#76000c]/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_45px_rgba(70,0,0,0.16)] backdrop-blur-sm sm:p-4"
      aria-label="Media plan validation status"
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {STATUS_STEPS.map((step) => {
          const Icon = step.icon;
          const active = activeStatuses.includes(step.status);
          const error = step.status === "Validation Error" && issueCount > 0;
          const loading =
            active &&
            (step.status === "Generating" ||
              step.status === "Saving to Notion" ||
              step.status === "Creating Google Ads Campaign");

          return (
            <span
              key={step.status}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold leading-none text-white shadow-sm transition-colors sm:px-4 sm:text-base",
                active || error
                  ? "border-[#d91f34] bg-[#d30b25] shadow-[0_10px_24px_rgba(92,0,13,0.24)]"
                  : "border-white/30 bg-white/[0.04] hover:bg-white/[0.08]"
              )}
            >
              <Icon className={cn("size-4 shrink-0", loading ? "animate-spin" : "")} />
              {step.status}
            </span>
          );
        })}
      </div>
      {issueCount > 0 ? (
        <p className="sr-only">
          {issueCount} validation {issueCount === 1 ? "issue" : "issues"} found.
        </p>
      ) : null}
    </div>
  );
}
