"use client";

import { useMemo, useState } from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { formatDelta, formatMetricValue } from "@/lib/reporting/format";
import { SummarySection } from "@/lib/reporting/types";

export function MetricSection({ section }: { section: SummarySection }) {
  const spendMetric = section.metrics.find((metric) => metric.key === "spend");
  if (spendMetric && (spendMetric.value ?? 0) <= 0) {
    return null;
  }

  if (section.metrics.length === 0) {
    return null;
  }

  return <MetricSectionContent section={section} />;
}

function MetricSectionContent({ section }: { section: SummarySection }) {
  const metrics = section.metrics;
  const metricCount = metrics.length;

  const formattedValues = useMemo(
    () => metrics.map((metric) => formatMetricValue(metric.value, metric.format)),
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
              title={metric.label}
            >
              {metric.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#d0d0d0] bg-[#ded9e2] px-3 py-4 shadow-sm">
          <p className="text-center text-sm font-semibold text-red-700">{activeMetric.label}</p>
          <p className="mt-2 text-center font-medium leading-none tracking-tight tabular-nums text-[#37363e] text-[clamp(1.75rem,8vw,2.4rem)]">
            {activeValue}
          </p>
          <MetricDelta delta={activeMetric.delta} className="mt-2 text-base" />
        </div>
      </div>

      <div className="hidden items-start gap-3 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {metrics.map((metric, index) => (
          <div key={metric.key} className="flex h-full min-w-0 flex-col gap-2">
            <p
              className="text-center leading-tight text-red-700"
              style={{ fontSize: `clamp(0.92rem, 1.45vw, ${fittedLabelSizeRem}rem)` }}
              title={metric.label}
            >
              {metric.label}
            </p>
            <div className="flex min-h-[132px] min-w-0 flex-1 flex-col justify-center rounded-xl border border-[#d0d0d0] bg-[#ded9e2] px-2.5 py-3 shadow-sm">
              <p
                className="w-full text-center font-medium leading-none tracking-tight tabular-nums text-[#37363e]"
                style={{ fontSize: `clamp(1.35rem, 2.2vw, ${fittedValueSizeRem}rem)` }}
                title={formattedValues[index]}
              >
                {formattedValues[index]}
              </p>
              <MetricDelta delta={metric.delta} className="mt-2 text-sm sm:text-base" />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function MetricDelta({ delta, className }: { delta: number | null; className?: string }) {
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <p
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
    </p>
  );
}
