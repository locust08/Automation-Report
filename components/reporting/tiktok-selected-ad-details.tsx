"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, PlayIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { PreviewAdNode, TikTokSelectedAdDetail, TikTokSelectedAdMetrics } from "@/lib/reporting/types";

type TrendMetric = "spend" | "impressions" | "reach" | "frequency" | "destinationClicks" | "allClicks" | "destinationCtr" | "cpm" | "videoViews";

const TREND_METRICS: Array<{ key: TrendMetric; label: string; color: string; format: "currency" | "number" | "percent" }> = [
  { key: "spend", label: "Spend", color: "#ef4444", format: "currency" },
  { key: "impressions", label: "Impressions", color: "#2563eb", format: "number" },
  { key: "reach", label: "Reach", color: "#7c3aed", format: "number" },
  { key: "frequency", label: "Frequency", color: "#9333ea", format: "number" },
  { key: "destinationClicks", label: "Clicks (destination)", color: "#0891b2", format: "number" },
  { key: "allClicks", label: "Clicks (all)", color: "#0284c7", format: "number" },
  { key: "destinationCtr", label: "CTR (destination)", color: "#0f766e", format: "percent" },
  { key: "cpm", label: "CPM", color: "#d97706", format: "currency" },
  { key: "videoViews", label: "Video views", color: "#db2777", format: "number" },
];

function detailValue(ad: PreviewAdNode, label: string): string | null {
  return ad.details.find((field) => field.label.toLowerCase() === label.toLowerCase())?.value ?? null;
}

function formatValue(value: number | null, format: "currency" | "number" | "percent", currency: string): string {
  if (value === null) return "—";
  if (format === "currency") {
    return new Intl.NumberFormat("en-MY", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  }
  if (format === "percent") return `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value)}%`;
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value);
}

function durationLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder}s`;
}

function MetadataItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value || "—"}</p>
    </div>
  );
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toIsoDate(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

function TrendDateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>({ from: parseLocalDate(startDate), to: parseLocalDate(endDate) });

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setRange({ from: parseLocalDate(startDate), to: parseLocalDate(endDate) });
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Open date range picker"
          className="h-11 w-full justify-start gap-2 rounded-xl border-slate-200 bg-white px-4 text-left font-medium text-slate-700 shadow-sm lg:w-auto"
        >
          <CalendarIcon className="size-4 text-slate-500" />
          {format(parseLocalDate(startDate), "MMM d, yyyy")} – {format(parseLocalDate(endDate), "MMM d, yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto rounded-2xl border-slate-200 p-0 shadow-xl">
        <Calendar
          mode="range"
          required
          defaultMonth={range.from}
          numberOfMonths={2}
          selected={range}
          onSelect={setRange}
          className="rounded-2xl"
        />
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            type="button"
            disabled={!range.from || !range.to}
            onClick={() => {
              if (!range.from || !range.to) return;
              onChange({ startDate: toIsoDate(range.from), endDate: toIsoDate(range.to) });
              setOpen(false);
            }}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TikTokSelectedAdDetailsPanel({
  campaignName,
  adGroupName,
  ad,
  detail,
  loading = false,
  startDate,
  endDate,
  onDateRangeChange,
}: {
  campaignName: string;
  adGroupName: string;
  ad: PreviewAdNode;
  detail: TikTokSelectedAdDetail | null | undefined;
  loading?: boolean;
  startDate?: string;
  endDate?: string;
  onDateRangeChange?: (next: { startDate: string; endDate: string }) => void;
}) {
  const [visibleMetrics, setVisibleMetrics] = useState<TrendMetric[]>(["impressions"]);
  const metrics = detail?.metrics ?? ({} as TikTokSelectedAdMetrics);
  const currency = detail?.currency || "MYR";
  const creativeType = detailValue(ad, "Creative type");
  const primaryText = detailValue(ad, "Primary text");
  const creativeUrl = ad.creative?.thumbnailUrl ?? ad.creative?.posterUrl ?? ad.creative?.imageUrl ?? null;
  const postUrl = ad.previewLinks?.[0]?.url ?? null;
  const chartConfig = useMemo(() => Object.fromEntries(
    TREND_METRICS.map((metric) => [metric.key, { label: metric.label, color: metric.color }]),
  ) as ChartConfig, []);

  function toggleMetric(metric: TrendMetric) {
    setVisibleMetrics((current) => current.includes(metric)
      ? (current.length === 1 ? current : current.filter((item) => item !== metric))
      : [...current, metric]);
  }

  if (loading) {
    return <TikTokSelectedAdSkeleton />;
  }

  return (
    <section className="space-y-5" aria-label="Selected TikTok ad details">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetadataItem label="Campaign" value={campaignName} />
          <MetadataItem label="Ad group" value={adGroupName} />
          <MetadataItem label="Ad" value={ad.name} />
          <MetadataItem label="Status" value={ad.status} />
          <MetadataItem label="Ad ID" value={ad.id} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetadataItem label="Creative type" value={creativeType} />
          <MetadataItem label="Identity" value={detail?.identityName ?? detail?.identityType} />
          <MetadataItem label="Source" value={detail?.source} />
          <MetadataItem label="Duration" value={durationLabel(detail?.durationSeconds)} />
        </div>
      </div>

      {detail?.warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {detail.warnings.join(" ")}
        </div>
      ) : null}

      <article
        data-tiktok-creative-copy="true"
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
      >
        <div className="grid lg:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)]">
          <section className="p-5 sm:p-7">
            <h3 className="text-left text-xl font-semibold text-slate-900">Creative preview</h3>
            {creativeUrl ? (
              <div className="relative mt-4 overflow-hidden rounded-2xl bg-[#17171b]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creativeUrl} alt={ad.name} className="aspect-[9/12] max-h-[560px] w-full object-contain" />
                {postUrl ? (
                  <a href={postUrl} target="_blank" rel="noreferrer" className="absolute inset-x-4 bottom-4 inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-white">
                    <PlayIcon className="size-4" /> Open TikTok post
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
                Creative media is unavailable for this TikTok ad.
              </div>
            )}
          </section>

          <section
            data-tiktok-primary-text="true"
            data-tiktok-creative-divider="true"
            className="flex min-h-72 flex-col justify-center border-t border-slate-200 p-5 text-left lg:border-l lg:border-t-0 sm:p-8 lg:p-10"
          >
            <h3 className="text-xl font-semibold text-slate-900">Primary text</h3>
            <p className="mt-5 max-w-[72ch] whitespace-pre-wrap break-words text-xl font-semibold leading-9 text-slate-700">
              {primaryText || "No primary text was returned for this TikTok ad."}
            </p>
          </section>
        </div>
      </article>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Daily performance trend</h3>
            <p className="mt-1 text-sm text-slate-500">Select one or more metrics to compare across the chosen date range.</p>
          </div>
          {startDate && endDate && onDateRangeChange ? (
            <div className="w-full lg:w-auto" data-tiktok-trend-date-filter="true">
              <TrendDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onChange={onDateRangeChange}
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 border-b bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TREND_METRICS.map((metric) => {
            const active = visibleMetrics.includes(metric.key);
            return (
              <Button key={metric.key} type="button" variant="outline" aria-pressed={active} onClick={() => toggleMetric(metric.key)} className={`h-auto min-h-28 justify-start rounded-xl p-4 text-left shadow-xs transition ${active ? "border-slate-300 bg-white ring-2 ring-slate-200" : "bg-white/70 opacity-60 hover:opacity-100"}`} style={active ? { borderTopColor: metric.color, borderTopWidth: 3 } : undefined}>
                <span className="block w-full">
                  <span className="block text-xs font-medium text-slate-500">{metric.label}</span>
                  <span className="mt-2 block text-xl font-semibold text-slate-900">{formatValue(metrics[metric.key] ?? null, metric.format, currency)}</span>
                  {metric.key === "allClicks" ? (
                    <span className="mt-1 block text-xs font-medium text-slate-600">CTR (all) {formatValue(metrics.allClickCtr ?? null, "percent", currency)}</span>
                  ) : null}
                  <span className="mt-2 block text-[11px] font-normal text-slate-500">{active ? "Visible on chart" : "Hidden from chart"}</span>
                </span>
              </Button>
            );
          })}
        </div>
        {detail?.daily.length ? (
          <div className="p-5 lg:p-8">
            <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full" role="img" aria-label="TikTok selected ad daily performance chart">
              <LineChart accessibilityLayer data={detail.daily} margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={32} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short" })} />
                {visibleMetrics.map((metric) => <YAxis key={metric} yAxisId={metric} hide domain={[0, "auto"]} />)}
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => String(payload?.[0]?.payload?.date ?? "")} />} />
                {TREND_METRICS.filter((metric) => visibleMetrics.includes(metric.key)).map((metric) => (
                  <Line key={metric.key} yAxisId={metric.key} dataKey={metric.key} type="monotone" stroke={`var(--color-${metric.key})`} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                ))}
              </LineChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="font-medium text-slate-700">No daily TikTok delivery data is available for this ad.</p>
            <p className="mt-1 text-sm text-slate-500">The selected-ad details and creative remain available above.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function TikTokSelectedAdSkeleton() {
  return (
    <section
      data-tiktok-selected-ad-skeleton="true"
      className="space-y-5"
      aria-label="Loading selected TikTok ad details"
      aria-busy="true"
    >
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-5 w-4/5" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-5 w-3/4" />
            </div>
          ))}
        </div>
      </div>

      <article data-tiktok-creative-copy="true" className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)]">
          <section className="p-6">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-4 aspect-[9/12] max-h-[560px] w-full rounded-2xl" />
          </section>
          <section
            data-tiktok-primary-text="true"
            data-tiktok-creative-divider="true"
            className="flex min-h-72 flex-col justify-center border-t border-slate-200 p-8 text-left lg:border-l lg:border-t-0 lg:p-10"
          >
            <Skeleton className="h-7 w-36" />
            <div className="mt-6 w-full max-w-[72ch] space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
          </section>
        </div>
      </article>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b px-6 py-5">
          <Skeleton className="h-7 w-60" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-3 border-b bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="p-5 lg:p-8">
          <Skeleton className="h-[320px] w-full rounded-2xl" />
        </div>
      </section>
    </section>
  );
}
