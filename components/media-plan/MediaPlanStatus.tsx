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

import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-wrap items-center gap-2">
      {STATUS_STEPS.map((step) => {
        const Icon = step.icon;
        const active = activeStatuses.includes(step.status);
        const error = step.status === "Validation Error" && issueCount > 0;
        return (
          <Badge
            key={step.status}
            variant={active || error ? "default" : "secondary"}
            className={
              active
                ? "gap-1.5 bg-[#9f0019] text-white hover:bg-[#9f0019]"
                : error
                  ? "gap-1.5 bg-[#fff1f2] text-[#be123c] hover:bg-[#fff1f2]"
                  : "gap-1.5 bg-white text-[#59606c] hover:bg-white"
            }
          >
            <Icon className="size-3.5" />
            {step.status}
          </Badge>
        );
      })}
      {issueCount > 0 ? (
        <span className="text-xs font-medium text-[#be123c]">
          {issueCount} validation {issueCount === 1 ? "issue" : "issues"}
        </span>
      ) : null}
    </div>
  );
}
