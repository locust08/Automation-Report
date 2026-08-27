"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addManagementCostPerResult,
  formatManagementCostPerResult,
  summarizeManagementPerformance,
  type ManagementPerformancePoint,
} from "@/lib/ads-management/management-performance";

type MetricKey = "cost" | "results" | "clicks" | "costPerResult";

export type ManagementPerformanceLabels = {
  cost: string;
  results: string;
  clicks?: string;
  costPerResult: string;
};

export function ManagementPerformancePanel({
  points,
  title,
  subtitle,
  headerControl,
  labels,
  emptyTitle,
  emptyDescription,
  chartAriaLabel = "Management performance line chart",
  authoritativeCostPerResult,
  currencyCode = "MYR",
}: {
  points: readonly ManagementPerformancePoint[];
  title: string;
  subtitle?: string;
  headerControl?: ReactNode;
  labels: ManagementPerformanceLabels;
  emptyTitle: string;
  emptyDescription: string;
  chartAriaLabel?: string;
  authoritativeCostPerResult?: number;
  currencyCode?: string;
}) {
  const metrics = useMemo<Array<{ key: MetricKey; label: string; color: string }>>(() => [
    { key: "cost", label: labels.cost, color: "#b91c1c" },
    { key: "results", label: labels.results, color: "#188038" },
    { key: "clicks", label: labels.clicks ?? "Clicks", color: "#d93025" },
    { key: "costPerResult", label: labels.costPerResult, color: "#57534e" },
  ], [labels.clicks, labels.cost, labels.costPerResult, labels.results]);
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(["cost", "results", "clicks"]);
  const sortedPoints = useMemo(() => [...points].sort((left, right) => left.date.localeCompare(right.date)), [points]);
  const totals = useMemo(
    () => summarizeManagementPerformance(sortedPoints, { costPerResult: authoritativeCostPerResult }),
    [authoritativeCostPerResult, sortedPoints],
  );
  const currency = useMemo(() => new Intl.NumberFormat("en-MY", { style: "currency", currency: currencyCode, minimumFractionDigits: 2 }), [currencyCode]);
  const number = useMemo(() => new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }), []);
  const chartConfig = Object.fromEntries(metrics.map((metric) => [metric.key, { label: metric.label, color: metric.color }])) as ChartConfig;
  const chartPoints = useMemo(
    () => addManagementCostPerResult(sortedPoints, authoritativeCostPerResult),
    [authoritativeCostPerResult, sortedPoints],
  );
  const firstDate = sortedPoints[0]?.date;
  const lastDate = sortedPoints.at(-1)?.date;
  const formatDate = (date?: string) => date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "—";

  function toggle(metric: MetricKey) {
    setVisibleMetrics((current) => current.includes(metric)
      ? current.length === 1 ? current : current.filter((item) => item !== metric)
      : [...current, metric]);
  }

  function metricValue(metric: MetricKey) {
    if (metric === "cost") return currency.format(totals.cost);
    if (metric === "costPerResult") return formatManagementCostPerResult(totals.costPerResult, currencyCode);
    return number.format(totals[metric]);
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {headerControl ?? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{formatDate(firstDate)} – {formatDate(lastDate)}</span>}
      </div>
      <div className="grid gap-3 border-b bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const active = visibleMetrics.includes(metric.key);
          return <Button key={metric.key} type="button" variant="outline" aria-pressed={active} onClick={() => toggle(metric.key)} className={`h-auto min-h-28 justify-start rounded-xl p-4 text-left shadow-xs transition ${active ? "border-slate-300 bg-white ring-2 ring-slate-200" : "bg-white/70 opacity-60 hover:bg-white hover:opacity-100"}`} style={active ? { borderTopColor: metric.color, borderTopWidth: 3 } : undefined}><span className="block w-full"><span className="block text-xs font-medium text-slate-500">{metric.label}</span><span className="mt-2 block text-2xl font-semibold text-slate-900">{metricValue(metric.key)}</span><span className="mt-2 block text-[11px] font-normal text-slate-500">{active ? "Visible on chart" : "Hidden from chart"}</span></span></Button>;
        })}
      </div>
      {chartPoints.length ? <div className="border-t bg-white p-6 lg:p-8">
        <ChartContainer config={chartConfig} className="aspect-auto h-[290px] w-full" role="img" aria-label={`${chartAriaLabel} from ${formatDate(firstDate)} to ${formatDate(lastDate)}`}>
          <LineChart accessibilityLayer data={chartPoints} margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={32} tickFormatter={(value) => formatDate(String(value)).replace(/ \d{4}$/, "")} />
            {visibleMetrics.map((metric) => <YAxis key={metric} yAxisId={metric} hide domain={[0, "auto"]} />)}
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => formatDate(String(payload?.[0]?.payload?.date ?? ""))} />} />
            {metrics.filter((metric) => visibleMetrics.includes(metric.key)).map((metric) => <Line key={metric.key} yAxisId={metric.key} dataKey={metric.key} type="monotone" stroke={`var(--color-${metric.key})`} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />)}
          </LineChart>
        </ChartContainer>
        <div className="mt-4 flex flex-wrap gap-4 px-2">{metrics.filter((metric) => visibleMetrics.includes(metric.key)).map((metric) => <span key={metric.key} className="flex items-center gap-2 text-xs text-slate-600"><span className="size-2.5 rounded-full" style={{ backgroundColor: metric.color }} />{metric.label}</span>)}</div>
      </div> : <div className="p-10 text-center"><p className="font-medium text-slate-700">{emptyTitle}</p><p className="mt-1 text-sm text-slate-500">{emptyDescription}</p></div>}
    </section>
  );
}

export function ManagementPerformanceSkeleton() {
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" role="status" aria-label="Loading performance"><div className="flex items-center justify-between border-b px-6 py-5"><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-3 w-64 max-w-full" /></div><Skeleton className="h-9 w-56" /></div><div className="grid gap-3 border-b bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="min-h-28 rounded-xl border bg-white p-4"><Skeleton className="h-3 w-20" /><Skeleton className="mt-4 h-7 w-28" /><Skeleton className="mt-3 h-3 w-20" /></div>)}</div><div className="p-6 lg:p-8"><Skeleton className="h-[290px] w-full" /></div></section>;
}
