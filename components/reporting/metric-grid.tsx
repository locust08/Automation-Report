"use client";

import { useMemo, useState } from "react";
import { CircleHelpIcon, Music2Icon, TrendingDownIcon, TrendingUpIcon, XIcon } from "lucide-react";

import { getMetricExplanation } from "@/components/reporting/metric-explanation";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatDelta, formatMetricValue } from "@/lib/reporting/format";
import { DateRangeConfig, SummaryMetric, SummarySection } from "@/lib/reporting/types";

type MetricDateRange = Pick<DateRangeConfig, "currentLabel" | "previousLabel">;

export function MetricSection({
  section,
  dateRange,
  compact = false,
}: {
  section: SummarySection;
  dateRange?: MetricDateRange;
  compact?: boolean;
}) {
  const spendMetric = section.metrics.find((metric) => metric.key === "spend");
  if (spendMetric && (spendMetric.value ?? 0) <= 0) {
    return null;
  }

  if (section.metrics.length === 0) {
    return null;
  }

  return <MetricSectionContent section={section} dateRange={dateRange} compact={compact} />;
}

function MetricSectionContent({
  section,
  dateRange,
  compact,
}: {
  section: SummarySection;
  dateRange?: MetricDateRange;
  compact: boolean;
}) {
  const metrics = section.metrics;
  const metricCount = metrics.length;
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  const metricSignature = `${section.platform}:${metrics.map((metric) => metric.key).join("|")}`;
  const [activeMetricState, setActiveMetricState] = useState({ index: 0, signature: metricSignature });

  const formattedValues = useMemo(
    () => metrics.map((metric) => formatMetricValue(metric.value, metric.format, metric.displayValue)),
    [metrics]
  );
  const longestLabelLength = metrics.reduce((longest, metric) => Math.max(longest, metric.label.length), 0);
  const longestValueLength = formattedValues.reduce((longest, value) => Math.max(longest, value.length), 0);
  const baseLabelSizeRem = metricCount >= 7 ? 1 : 1.1;
  const shrinkLabelByLengthRem = Math.max(0, longestLabelLength - 10) * 0.03;
  const fittedLabelSizeRem = Math.max(0.82, baseLabelSizeRem - shrinkLabelByLengthRem);
  const baseValueSizeRem = metricCount >= 7 ? 1.55 : 1.85;
  const shrinkValueByLengthRem = Math.max(0, longestValueLength - 4) * 0.1;
  const fittedValueSizeRem = Math.max(1.05, baseValueSizeRem - shrinkValueByLengthRem);
  const activeMetricIndex = activeMetricState.signature === metricSignature ? activeMetricState.index : 0;
  const safeActiveIndex = Math.min(activeMetricIndex, Math.max(0, metricCount - 1));
  const activeMetric = metrics[safeActiveIndex];
  const selectedMetric = metrics.find((metric) => metric.key === selectedMetricKey) ?? null;
  const metricTabs = metrics.map((metric, index) => (
    <button
      key={`metric-tab-${metric.key}`}
      type="button"
      onClick={() => setActiveMetricState({ index, signature: metricSignature })}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        index === safeActiveIndex
          ? "border-red-700 bg-red-700 text-white"
          : "border-[#c9c9c9] bg-white text-[#555]"
      }`}
      aria-pressed={index === safeActiveIndex}
    >
      {metric.label}
    </button>
  ));

  return (
    <article className={compact ? "rounded-[1.25rem] bg-[#e7e7e7] p-3 shadow-sm sm:p-3.5 lg:p-4" : "rounded-[1.5rem] bg-[#e7e7e7] p-3 shadow-sm sm:p-4"}>
      <div className="mb-3 flex items-center gap-3">
        <PlatformBadge section={section} />
      </div>

      <div className="space-y-3 md:hidden">
        {compact ? (
          <ScrollArea type="always" className="w-full whitespace-nowrap">
            <div className="flex w-max gap-2 pb-2.5">{metricTabs}</div>
            <ScrollBar
              orientation="horizontal"
              className="h-2 rounded-full bg-black/10 [&_[data-slot=scroll-area-thumb]]:bg-red-700/70"
            />
          </ScrollArea>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {metricTabs}
          </div>
        )}

        <MetricCard
          metric={activeMetric}
          formattedValue={formattedValues[safeActiveIndex] ?? "No Data"}
          onOpen={() => setSelectedMetricKey(activeMetric.key)}
          labelClassName="text-sm"
          valueClassName="text-[clamp(1.75rem,8vw,2.4rem)]"
          deltaClassName="mt-2 text-base"
          cardClassName={compact ? "min-h-[128px] px-3 py-3" : "min-h-[150px] px-3 py-4"}
        />
      </div>

      <div className="hidden items-start gap-2 md:grid md:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            formattedValue={formattedValues[index] ?? "No Data"}
            onOpen={() => setSelectedMetricKey(metric.key)}
            labelClassName="leading-tight"
            labelStyle={{ fontSize: `clamp(0.82rem, 1.2vw, ${fittedLabelSizeRem}rem)` }}
            valueStyle={{ fontSize: `clamp(1.05rem, 1.55vw, ${fittedValueSizeRem}rem)` }}
            deltaClassName="mt-1.5 text-xs sm:text-sm"
            cardClassName={compact ? "min-h-[92px] px-2 py-2" : "min-h-[104px] px-2 py-2.5"}
          />
        ))}
      </div>

      {selectedMetric ? (
        <MetricExplanationDialog
          section={section}
          metric={selectedMetric}
          dateRange={dateRange}
          onClose={() => setSelectedMetricKey(null)}
        />
      ) : null}
    </article>
  );
}

function PlatformBadge({ section }: { section: SummarySection }) {
  if (section.platform === "tiktok") {
    return (
      <div className="inline-flex h-9 items-center gap-2 rounded-full bg-[#17171b] px-3 text-sm font-semibold text-white" aria-label="TikTok Ads">
        <span className="relative grid size-5 place-items-center rounded-full bg-white text-[#17171b]">
          <Music2Icon className="size-3.5" aria-hidden="true" />
          <span className="absolute -left-0.5 top-0.5 size-1.5 rounded-full bg-[#25f4ee]" aria-hidden="true" />
          <span className="absolute -right-0.5 bottom-0.5 size-1.5 rounded-full bg-[#fe2c55]" aria-hidden="true" />
        </span>
        TikTok Ads
      </div>
    );
  }

  if (section.platform === "meta") {
    return (
      <div className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0866FF] px-3 text-sm font-semibold text-white" aria-label="Meta Ads">
        <span className="grid size-5 place-items-center rounded-full bg-white/15 text-xl font-semibold leading-none" aria-hidden="true">
          ∞
        </span>
        Meta Ads
      </div>
    );
  }

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-full bg-[#34A853] px-3 text-sm font-semibold text-white" aria-label="Google Ads">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/google-ads-logo.svg"
        alt=""
        width={20}
        height={20}
        className="size-5 rounded-full object-cover"
        aria-hidden="true"
      />
      Google Ads
    </div>
  );
}

function MetricCard({
  metric,
  formattedValue,
  onOpen,
  labelClassName,
  labelStyle,
  valueClassName = "",
  valueStyle,
  deltaClassName,
  cardClassName,
}: {
  metric: SummaryMetric;
  formattedValue: string;
  onOpen: () => void;
  labelClassName: string;
  labelStyle?: React.CSSProperties;
  valueClassName?: string;
  valueStyle?: React.CSSProperties;
  deltaClassName: string;
  cardClassName: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-1.5">
      <p className={`text-center text-red-700 ${labelClassName}`} style={labelStyle}>
        {metric.label}
      </p>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`Show calculation details for ${metric.label}`}
        className={`group relative flex w-full min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-lg border border-[#d0d0d0] bg-[#ded9e2] px-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c2aeb8] hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 focus-visible:outline-none ${cardClassName}`}
      >
        <CircleHelpIcon
          aria-hidden="true"
          className="absolute right-2 top-2 size-3.5 text-[#9f0019]/70 transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110"
        />
        <span
          className={`block w-full text-center font-medium leading-none tracking-tight tabular-nums text-[#37363e] ${valueClassName}`}
          style={valueStyle}
        >
          {formattedValue}
        </span>
        <MetricDelta delta={metric.delta} className={deltaClassName} />
        <span className="mt-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-[#6f5f67] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          View calculation
        </span>
      </button>
    </div>
  );
}

function MetricExplanationDialog({
  section,
  metric,
  dateRange,
  onClose,
}: {
  section: SummarySection;
  metric: SummaryMetric;
  dateRange?: MetricDateRange;
  onClose: () => void;
}) {
  const explanation = getMetricExplanation(section.platform, metric);
  const currentValue = formatMetricValue(metric.value, metric.format, metric.displayValue);
  const previousValue = formatMetricValue(metric.previousValue ?? null, metric.format);
  const currentLabel = dateRange?.currentLabel ?? "Selected period";
  const previousLabel = dateRange?.previousLabel ?? "Previous period";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1c20]/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`metric-dialog-title-${section.platform}-${metric.key}`}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/30 bg-[#f8f6f7] p-5 shadow-2xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9f0019]">
              {explanation.source}
            </p>
            <h3
              id={`metric-dialog-title-${section.platform}-${metric.key}`}
              className="mt-1 break-words text-2xl font-semibold text-[#37363e]"
            >
              {metric.label} calculation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="shrink-0 rounded-full p-2 text-[#555] transition-colors hover:bg-[#ebe5e8] hover:text-[#9f0019] focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:outline-none"
            aria-label="Close calculation details"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-[#e3dbe0] bg-white p-4">
          <p className="text-sm font-semibold text-[#37363e]">How this value is calculated</p>
          <p className="mt-1 break-words text-sm leading-6 text-[#555]">{explanation.formula}</p>
          {explanation.mixedReason ? (
            <p className="mt-3 break-words rounded-lg bg-[#fff0f2] p-3 text-sm leading-6 text-[#8d1730]">
              {explanation.mixedReason}
            </p>
          ) : null}
        </div>

        {explanation.mixedReason ? null : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricPeriodValue label={currentLabel} value={currentValue} tone="current" />
              <MetricPeriodValue label={previousLabel} value={previousValue} tone="previous" />
            </div>
            <div className="mt-4 rounded-xl bg-[#38363f] p-4 text-white">
              <p className="text-sm font-semibold">Period comparison</p>
              <p className="mt-1 break-words text-sm leading-6 text-[#e4dce1]">
                {metric.delta === null
                  ? "No baseline: a percentage cannot be calculated from a zero or unavailable prior value."
                  : `Change = (current - previous) / previous * 100 = ${formatDelta(metric.delta)}`}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MetricPeriodValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "current" | "previous";
}) {
  return (
    <div className={`min-w-0 rounded-xl p-3 ${tone === "current" ? "bg-[#fff0f2]" : "bg-[#efecef]"}`}>
      <p className="break-words text-xs font-semibold leading-5 text-[#695d63]">{label}</p>
      <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-[#37363e]">{value}</p>
    </div>
  );
}

function MetricDelta({ delta, className }: { delta: number | null; className?: string }) {
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <span
      className={`flex items-center justify-center gap-1 whitespace-nowrap ${
        delta === null ? "text-[#555]" : deltaPositive ? "text-emerald-600" : "text-red-500"
      } ${className ?? ""}`}
    >
      {delta !== null ? (
        deltaPositive ? (
          <TrendingUpIcon className="size-4" />
        ) : (
          <TrendingDownIcon className="size-4" />
        )
      ) : null}
      {formatDelta(delta)}
    </span>
  );
}
