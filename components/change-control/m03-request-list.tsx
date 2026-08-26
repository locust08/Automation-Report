import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { M03_STATUSES, type M03ChangeRequestSummary, type M03Platform, type M03RequestListPayload, type M03Status } from "@/lib/change-control/types";
import { shouldShowM03NewRequestAction } from "@/lib/change-control/workspace";

export const M03_STATUS_LABELS: Record<M03Status, string> = {
  draft: "Draft",
  validation_in_progress: "Validation in progress",
  validation_failed: "Validation failed",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  conflict_detected: "Conflict detected",
  ready_to_publish: "Ready to publish",
  publishing: "Publishing",
  published: "Published",
  verification_in_progress: "Verification in progress",
  verified: "Verified",
  partially_completed: "Partially completed",
  failed: "Failed",
  reverted: "Reverted",
  cancelled: "Cancelled",
  provider_execution_locked: "Provider execution locked",
};

export type M03RequestListProps = {
  payload: M03RequestListPayload | null;
  selectedRequestId?: string;
  platform: M03Platform | "all";
  status: M03Status | "all";
  page: number;
  pageSize: 10 | 25 | 50;
  navigationBlocked?: boolean;
  showNewRequestAction?: boolean;
  allowPlatformFilter?: boolean;
  allowCampaignFilter?: boolean;
  campaignIdentity?: string;
  onPlatformChange: (platform: M03Platform | "all") => void;
  onStatusChange: (status: M03Status | "all") => void;
  onCampaignIdentityChange?: (campaignIdentity: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: 10 | 25 | 50) => void;
  onRefresh: () => void;
  onNewRequest: () => void;
  onSelectRequest: (request: M03ChangeRequestSummary) => void;
  renderSelectedDetail?: (request: M03ChangeRequestSummary) => ReactNode;
};

export function M03RequestList({
  payload,
  selectedRequestId,
  platform,
  status,
  page,
  pageSize,
  navigationBlocked = false,
  showNewRequestAction,
  allowPlatformFilter = true,
  allowCampaignFilter = false,
  campaignIdentity = "",
  onPlatformChange,
  onStatusChange,
  onCampaignIdentityChange,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onNewRequest,
  onSelectRequest,
  renderSelectedDetail,
}: M03RequestListProps) {
  return (
    <Card className="gap-4 bg-white">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Change requests</CardTitle>
            <CardDescription>Review cross-platform post-launch changes. Provider execution remains locked.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowPlatformFilter ? (
              <Select value={platform} onValueChange={(value) => onPlatformChange(value as M03Platform | "all")}>
                <SelectTrigger aria-label="Platform filter" className="w-40 bg-white"><SelectValue placeholder="All platforms" /></SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="all">All platforms</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Select value={status} onValueChange={(value) => onStatusChange(value as M03Status | "all")}>
              <SelectTrigger aria-label="Status filter" className="w-56 bg-white"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                <SelectItem value="all">All statuses</SelectItem>
                {M03_STATUSES.map((value) => <SelectItem key={value} value={value}>{M03_STATUS_LABELS[value]}</SelectItem>)}
              </SelectContent>
            </Select>
            {allowCampaignFilter ? (
              <input
                aria-label="Campaign filter"
                className="h-9 w-56 rounded-md border bg-white px-3 text-sm"
                placeholder="All campaigns"
                value={campaignIdentity}
                onChange={(event) => onCampaignIdentityChange?.(event.target.value)}
              />
            ) : null}
            <Button variant="outline" onClick={onRefresh}><RefreshCwIcon /> Refresh</Button>
            {shouldShowM03NewRequestAction(showNewRequestAction) ? <Button disabled={navigationBlocked} title={navigationBlocked ? "Reload the latest conflicted request or close its editor first." : undefined} onClick={onNewRequest}><PlusIcon /> New change request</Button> : null}
          </div>
        </div>
        {navigationBlocked ? <p className="mt-3 text-sm font-medium text-amber-800">Request selection and new/edit actions are paused until the open version conflict is reloaded or closed. Filters and pagination remain available.</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {payload?.requests.length ? payload.requests.map((request) => (
          <div key={request.id} className="space-y-3">
            <button
              type="button"
              disabled={navigationBlocked}
              title={navigationBlocked ? "Resolve or close the open version conflict before selecting another request." : undefined}
              onClick={() => onSelectRequest(request)}
              className={`grid w-full gap-3 rounded-xl border p-4 text-left transition enabled:hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-[1fr_auto] ${selectedRequestId === request.id ? "border-red-400 bg-red-50/30" : "bg-white"}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.title}</span><Badge variant="outline">{request.platform.toUpperCase()}</Badge><M03StatusBadge status={request.status} /></div>
                <p className="mt-1 text-sm text-muted-foreground">{request.account_identity} · {request.campaign_identity}</p>
                <p className="mt-2 line-clamp-2 text-sm">{request.reason}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground"><p>Version {request.lock_version}</p><p>{formatM03Time(request.updated_at)}</p></div>
            </button>
            {selectedRequestId === request.id ? renderSelectedDetail?.(request) : null}
          </div>
        )) : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No change requests match these filters.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span>{requestRange(payload)} of {payload?.pagination.total ?? 0} requests</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as 10 | 25 | 50)}>
              <SelectTrigger aria-label="Requests per page" className="h-8 w-[118px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!payload || page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeftIcon /> Previous</Button>
            <span>Page {payload?.pagination.page ?? 1} of {payload?.pagination.total_pages ?? 1}</span>
            <Button size="sm" variant="outline" disabled={!payload || page >= payload.pagination.total_pages} onClick={() => onPageChange(page + 1)}>Next <ChevronRightIcon /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function requestRange(payload: M03RequestListPayload | null) {
  if (!payload || payload.pagination.total === 0) return "0";
  const start = (payload.pagination.page - 1) * payload.pagination.page_size + 1;
  const end = Math.min(start + payload.requests.length - 1, payload.pagination.total);
  return `${start}–${end}`;
}

export function M03StatusBadge({ status }: { status: M03Status }) {
  const variant = status === "approved" ? "default" : status === "validation_failed" || status === "failed" ? "destructive" : "outline";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

export function formatM03Time(value: string) {
  return value ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}
