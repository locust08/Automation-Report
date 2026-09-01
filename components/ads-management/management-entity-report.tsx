"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { META_PAGE_SIZE_OPTIONS, type MetaPageSize } from "@/lib/ads-management/pagination";

export function ManagementEntityName({ text, multiline = false }: { text: string; multiline?: boolean }) {
  return <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={text} className={`${multiline ? "line-clamp-2 min-h-10 py-1" : "inline-flex h-6 items-center truncate"} min-w-0 w-full cursor-default rounded-sm font-medium leading-normal text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2`}>{text}</span></TooltipTrigger><TooltipContent side="top" align="center" sideOffset={8} className="max-w-sm border border-white/15 bg-[#211114] px-3 py-2 text-center text-sm font-medium leading-relaxed text-white shadow-xl">{text}</TooltipContent></Tooltip></TooltipProvider>;
}

export function ManagementStatusDot({ status }: { status: string }) {
  const normalized = status.trim().toUpperCase();
  const color = normalized === "ENABLED" || normalized === "ENABLE" || normalized === "ACTIVE"
    ? "bg-green-600"
    : normalized === "PAUSED" || normalized === "DISABLE" || normalized === "DISABLED" || normalized === "INACTIVE"
      ? "bg-slate-500"
      : normalized === "REMOVED" || normalized === "DELETED"
        ? "bg-red-600"
        : "bg-amber-500";
  const label = status ? status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${color}`} role="img" aria-label={label} title={label} />;
}

export function ManagementDetailGrid({ details }: { details: Array<{ label: string; value: string; wide?: boolean }> }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{details.map((detail) => <div key={detail.label} className={`rounded-lg border bg-white p-3 shadow-xs ${detail.wide ? "sm:col-span-2 lg:col-span-4 xl:col-span-5" : ""}`}><span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">{detail.label}</span><strong className="mt-1 block break-words text-sm font-semibold text-slate-800">{detail.value}</strong></div>)}</div>;
}

export type ManagementPaginationModel = {
  start: number;
  end: number;
  total: number;
  page: number;
  pageSize: MetaPageSize;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: MetaPageSize) => void;
};

export function ManagementPaginationFooter({ model }: { model: ManagementPaginationModel }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-4 py-3 text-xs text-slate-500"><span>{model.start}–{model.end} of {model.total}</span><div className="flex flex-wrap items-center gap-2"><Select value={String(model.pageSize)} onValueChange={(value) => model.setPageSize(Number(value) as MetaPageSize)}><SelectTrigger aria-label="Rows per page" className="h-8 w-28 bg-white"><SelectValue /></SelectTrigger><SelectContent>{META_PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} per page</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={model.page <= 1} onClick={() => model.setPage(model.page - 1)}>Previous</Button><span>Page {model.page} of {model.totalPages}</span><Button size="sm" variant="outline" disabled={model.page >= model.totalPages} onClick={() => model.setPage(model.page + 1)}>Next</Button></div></div>;
}

export function ManagementEntityReportSkeleton() {
  return <section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm" role="status" aria-label="Loading resource report"><div className="border-b px-5 py-5"><Skeleton className="h-5 w-36" /><Skeleton className="mt-2 h-3 w-72 max-w-full" /></div><div className="divide-y">{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_180px_190px_128px]"><div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-56 max-w-full" /></div><Skeleton className="size-8" /><Skeleton className="h-5 w-28" /><Skeleton className="h-5 w-28" /><Skeleton className="h-9 w-32" /></div>)}</div></section>;
}
