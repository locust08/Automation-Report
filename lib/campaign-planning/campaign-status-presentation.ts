import type { CampaignPlanStatus } from "./types";

export type CampaignStatusPresentation = {
  label: string;
  badgeClassName: string;
  dotClassName: string;
};

export const CAMPAIGN_STATUS_PRESENTATIONS = {
  draft: {
    label: "Draft",
    badgeClassName: "border-slate-300 bg-slate-50 text-slate-700",
    dotClassName: "size-2.5 bg-slate-500",
  },
  awaiting_approval: {
    label: "Awaiting approval",
    badgeClassName: "border-amber-300 bg-amber-50 text-amber-800",
    dotClassName: "size-2.5 bg-amber-500",
  },
  approved: {
    label: "Approved",
    badgeClassName: "border-blue-300 bg-blue-50 text-blue-800",
    dotClassName: "size-2.5 bg-blue-500",
  },
  launch_in_progress: {
    label: "Launch in progress",
    badgeClassName: "border-violet-300 bg-violet-50 text-violet-800",
    dotClassName: "size-2.5 bg-violet-500",
  },
  launched: {
    label: "Launched",
    badgeClassName: "border-emerald-300 bg-emerald-50 text-emerald-800",
    dotClassName: "size-2.5 bg-emerald-500",
  },
  cancelled: {
    label: "Cancelled",
    badgeClassName: "border-rose-300 bg-rose-50 text-rose-800",
    dotClassName: "size-2.5 bg-rose-500",
  },
} satisfies Record<CampaignPlanStatus, CampaignStatusPresentation>;
