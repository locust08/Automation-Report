"use client";

import { useMemo, useState } from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { getMetricExplanation } from "@/components/reporting/metric-explanation";
import { formatDelta, formatMetricValue } from "@/lib/reporting/format";
import { DateRangeConfig, SummaryMetric, SummarySection } from "@/lib/reporting/types";

type MetricDateRange = Pick<DateRangeConfig, "currentLabel" | "previousLabel">;

export function MetricSection({
  section,
  dateRange,
}: {
  section: SummarySection;
  dateRange?: MetricDateRange;
}) {
  const spendMetric = section.metrics.find((metric) => metric.key === "spend");
  if (spendMetric && (spendMetric.value ?? 0) <= 0) {
    return null;
  }

  if (section.metrics.length === 0) {
    return null;
  }

  return <MetricSectionContent section={section} dateRange={dateRange} />;
}

function MetricSectionContent({
  section,
  dateRange,
}: {
  section: SummarySection;
  dateRange?: MetricDateRange;
}) {
  const metrics = section.metrics;
  const metricCount = metrics.length;
  const [expandedMetricKey, setExpandedMetricKey] = useState<string | null>(null);
  const [hoveredMetricKey, setHoveredMetricKey] = useState<string | null>(null);
  const [focusedMetricKey, setFocusedMetricKey] = useState<string | null>(null);

  const formattedValues = useMemo(
    () => metrics.map((metric) => formatMetricValue(metric.value, metric.format, metric.displayValue)),
    [metrics]
  );

  const longestLabelLength = metrics.reduce((longest, metric) => Math.max(longest, metric.label.length), 0);
  const longestValueLength = formattedValues.reduce((longest, value) => Math.max(longest, value.length), 0);
  const baseLabelSizeRem = metricCount >= 7 ? 1.2 : 1.3;
  const shrinkLabelByLengthRem = Math.max(0, longestLabelLength - 10) * 0.035;
  const fittedLabelSizeRem = Math.max(0.92, baseLabelSizeRem - shrinkLabelByLengthRem);
  const baseValueSizeRem = metricCount >= 7 ? 2.2 : 2.55;
  const shrinkValueByLengthRem = Math.max(0, longestValueLength - 4) * 0.14;
  const fittedValueSizeRem = Math.max(1.35, baseValueSizeRem - shrinkValueByLengthRem);
  const metricSignature = `${section.platform}:${metrics.map((metric) => metric.key).join("|")}`;
  const [activeMetricState, setActiveMetricState] = useState({
    index: 0,
    signature: metricSignature,
  });
  const activeMetricIndex =
    activeMetricState.signature === metricSignature ? activeMetricState.index : 0;
  const safeActiveIndex = Math.min(activeMetricIndex, Math.max(0, metricCount - 1));
  const activeMetric = metrics[safeActiveIndex];
  const activeValue = formattedValues[safeActiveIndex] ?? "No Data";

  const toggleExplanation = (key: string) => {
    setExpandedMetricKey((current) => (current === key ? null : key));
  };

  return (
    <article className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={section.logoPath}
          alt={`${section.title} logo`}
          width={140}
          height={44}
          className="h-11 w-auto object-contain"
          loading="eager"
          decoding="sync"
        />
      </div>

      <div className="space-y-3 md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {metrics.map((metric, index) => (
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
          ))}
        </div>

        <MetricExplanationCard
          section={section}
          metric={activeMetric}
          formattedValue={activeValue}
          dateRange={dateRange}
          explanationVisible={
            expandedMetricKey === activeMetric.key ||
            hoveredMetricKey === activeMetric.key ||
            focusedMetricKey === activeMetric.key
          }
          onToggle={() => toggleExplanation(activeMetric.key)}
          onDismiss={() => {
            setExpandedMetricKey(null);
            setHoveredMetricKey(null);
            setFocusedMetricKey(null);
          }}
          onHoverChange={(hovered) => setHoveredMetricKey(hovered ? activeMetric.key : null)}
          onFocusChange={(focused) => setFocusedMetricKey(focused ? activeMetric.key : null)}
          labelClassName="text-sm"
          valueClassName="text-[clamp(1.75rem,8vw,2.4rem)]"
          deltaClassName="mt-2 text-base"
          cardClassName="min-h-[150px] px-3 py-4"
        />
      </div>

      <div className="hidden items-start gap-3 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {metrics.map((metric, index) => (
          <MetricExplanationCard
            key={metric.key}
            section={section}
            metric={metric}
            formattedValue={formattedValues[index] ?? "No Data"}
            dateRange={dateRange}
            explanationVisible={
              expandedMetricKey === metric.key ||
              hoveredMetricKey === metric.key ||
              focusedMetricKey === metric.key
            }
            onToggle={() => toggleExplanation(metric.key)}
            onDismiss={() => {
              setExpandedMetricKey(null);
              setHoveredMetricKey(null);
              setFocusedMetricKey(null);
            }}
            onHoverChange={(hovered) => setHoveredMetricKey(hovered ? metric.key : null)}
            onFocusChange={(focused) => setFocusedMetricKey(focused ? metric.key : null)}
            labelClassName="leading-tight"
            labelStyle={{ fontSize: `clamp(0.92rem, 1.45vw, ${fittedLabelSizeRem}rem)` }}
            valueClassName=""
            valueStyle={{ fontSize: `clamp(1.35rem, 2.2vw, ${fittedValueSizeRem}rem)` }}
            deltaClassName="mt-2 text-sm sm:text-base"
            cardClassName="min-h-[132px] px-2.5 py-3"
          />
        ))}
      </div>
    </article>
  );
}

function MetricExplanationCard({
  section,
  metric,
  formattedValue,
  dateRange,
  explanationVisible,
  onToggle,
  onDismiss,
  onHoverChange,
  onFocusChange,
  labelClassName,
  labelStyle,
  valueClassName,
  valueStyle,
  deltaClassName,
  cardClassName,
}: {
  section: SummarySection;
  metric: SummaryMetric;
  formattedValue: string;
  dateRange?: MetricDateRange;
  explanationVisible: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onHoverChange: (hovered: boolean) => void;
  onFocusChange: (focused: boolean) => void;
  labelClassName: string;
  labelStyle?: React.CSSProperties;
  valueClassName: string;
  valueStyle?: React.CSSProperties;
  deltaClassName: string;
  cardClassName: string;
}) {
  const explanation = getMetricExplanation(section.platform, metric);
  const previousValue = formatMetricValue(metric.previousValue ?? null, metric.format);
  const currentLabel = dateRange?.currentLabel ?? "Selected period";
  const previousLabel = dateRange?.previousLabel ?? "Previous period";
  const explanationId = `metric-explanation-${section.platform}-${metric.key}`;
  const showExplanation = explanationVisible
    ? "opacity-100 translate-y-0"
    : "pointer-events-none translate-y-2 opacity-0";

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <p className={`text-center text-red-700 ${labelClassName}`} style={labelStyle}>
        {metric.label}
      </p>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && explanationVisible) {
            event.preventDefault();
            event.currentTarget.blur();
            onDismiss();
          }
        }}
        aria-expanded={explanationVisible}
        aria-controls={explanationId}
        aria-label={`Show calculation details for ${metric.label}`}
        className={`group relative isolate flex w-full min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-xl border border-[#d0d0d0] bg-[#ded9e2] text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 focus-visible:outline-none ${cardClassName}`}
      >
        <span className={`w-full transition-opacity duration-150 ${explanationVisible ? "opacity-0" : "opacity-100"}`}>
          <span
            className={`block w-full text-center font-medium leading-none tracking-tight tabular-nums text-[#37363e] ${valueClassName}`}
            style={valueStyle}
          >
            {formattedValue}
          </span>
          <MetricDelta delta={metric.delta} className={deltaClassName} />
        </span>

        <span
          id={explanationId}
          aria-hidden={!explanationVisible}
          className={`absolute inset-0 flex flex-col justify-center bg-[#38363f] px-3 py-3 text-left text-white transition-all duration-200 ${showExplanation}`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#f7b7bd]">
            {explanation.source}
          </span>
          <span className="mt-1 text-xs leading-snug">{explanation.formula}</span>
          {explanation.mixedReason ? (
            <span className="mt-2 text-xs leading-snug text-[#f0d7da]">{explanation.mixedReason}</span>
          ) : (
            <>
              <span className="mt-2 text-[11px] leading-snug text-[#ded9e2]">
                {currentLabel}: {formattedValue}
              </span>
              <span className="text-[11px] leading-snug text-[#ded9e2]">
                {previousLabel}: {previousValue}
              </span>
              <span className="mt-1 text-[11px] leading-snug text-[#f7b7bd]">
                {metric.delta === null
                  ? "No baseline: a percentage cannot be calculated from a zero or unavailable prior value."
                  : `Change: (current − previous) ÷ previous × 100 = ${formatDelta(metric.delta)}`}
              </span>
            </>
          )}
        </span>
      </button>
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
