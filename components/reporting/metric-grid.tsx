import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import Image from "next/image";

import { formatDelta, formatMetricValue } from "@/lib/reporting/format";
import { SummarySection } from "@/lib/reporting/types";

export function MetricSection({ section }: { section: SummarySection }) {
  const spendMetric = section.metrics.find((metric) => metric.key === "spend");
  if (spendMetric && (spendMetric.value ?? 0) <= 0) {
    return null;
  }
  const metricCount = section.metrics.length;

  return (
    <article className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-4">
        <Image
          src={section.logoPath}
          alt={`${section.title} logo`}
          width={140}
          height={44}
          className="h-11 w-auto object-contain"
        />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${metricCount}, minmax(0, 1fr))` }}>
        {section.metrics.map((metric) => {
          const deltaPositive = (metric.delta ?? 0) >= 0;
          const formattedValue = formatMetricValue(metric.value, metric.format);
          const baseValueSizeRem = metricCount >= 7 ? 2.45 : 2.7;
          const shrinkByLengthRem = Math.max(0, formattedValue.length - 4) * 0.16;
          const fittedValueSizeRem = Math.max(1.45, baseValueSizeRem - shrinkByLengthRem);

          return (
            <div key={metric.key} className="flex h-full flex-col gap-2">
              <p className="min-h-[2.4rem] text-center text-[1.2rem] leading-tight text-red-700 xl:text-[1.3rem]">
                {metric.label}
              </p>
              <div className="flex min-h-[120px] flex-1 flex-col justify-center rounded-xl border border-[#d0d0d0] bg-[#ded9e2] px-3 py-3 shadow-sm sm:min-h-[132px]">
                <p
                  className="w-full whitespace-nowrap text-center font-medium leading-none tabular-nums text-[#37363e]"
                  style={{ fontSize: `${fittedValueSizeRem}rem` }}
                >
                  {formattedValue}
                </p>
                <p
                  className={`mt-2 flex items-center justify-center gap-1 text-lg ${
                    metric.delta === null
                      ? "text-[#555]"
                      : deltaPositive
                        ? "text-emerald-600"
                        : "text-red-500"
                  }`}
                >
                  {metric.delta !== null ? (
                    deltaPositive ? (
                      <TrendingUpIcon className="size-4" />
                    ) : (
                      <TrendingDownIcon className="size-4" />
                    )
                  ) : null}
                  {formatDelta(metric.delta)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
