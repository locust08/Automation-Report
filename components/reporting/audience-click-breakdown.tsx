"use client";

import { useMemo, useState } from "react";
import { BarChart3Icon, PieChartIcon } from "lucide-react";

import { summarizeAudienceItemsForChart } from "@/lib/reporting/audience-breakdown";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCompactNumber } from "@/lib/reporting/format";
import { AudienceBreakdownRow, AudienceClickBreakdownResponse } from "@/lib/reporting/types";
import { cn } from "@/lib/utils";

const LOCATION_TABS = [
  { key: "country", label: "Country" },
  { key: "region", label: "State / Region" },
  { key: "city", label: "City" },
] as const;

type LocationTabKey = (typeof LOCATION_TABS)[number]["key"];
type ChartType = "bar" | "pie";
type UnknownFilterMode = "include" | "exclude";

const EMPTY_STATE_MESSAGE = "No audience click data available for this breakdown.";
const PIE_COLORS = ["#f30707", "#ff4d4d", "#b91c1c", "#ef4444", "#991b1b", "#f87171", "#7f1d1d"];

export function AudienceClickBreakdownSection({
  breakdown,
}: {
  breakdown: AudienceClickBreakdownResponse;
}) {
  const [selectedLocationTab, setSelectedLocationTab] = useState<LocationTabKey | null>(null);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [unknownFilterMode, setUnknownFilterMode] = useState<UnknownFilterMode>("include");
  const includeUnknown = unknownFilterMode === "include";

  const ageRows = useMemo(
    () => summarizeAudienceItemsForChart(filterUnknownRows(breakdown.age, includeUnknown), "age"),
    [breakdown.age, includeUnknown]
  );
  const genderRows = useMemo(
    () => summarizeAudienceItemsForChart(filterUnknownRows(breakdown.gender, includeUnknown), "gender"),
    [breakdown.gender, includeUnknown]
  );
  const countryRows = useMemo(
    () =>
      summarizeAudienceItemsForChart(
        filterUnknownRows(breakdown.location.country, includeUnknown),
        "country"
      ),
    [breakdown.location.country, includeUnknown]
  );
  const regionRows = useMemo(
    () =>
      summarizeAudienceItemsForChart(
        filterUnknownRows(breakdown.location.region, includeUnknown),
        "region"
      ),
    [breakdown.location.region, includeUnknown]
  );
  const cityRows = useMemo(
    () =>
      summarizeAudienceItemsForChart(
        filterUnknownRows(breakdown.location.city, includeUnknown),
        "city"
      ),
    [breakdown.location.city, includeUnknown]
  );

  const locationRowCounts: Record<LocationTabKey, number> = {
    country: countryRows.length,
    region: regionRows.length,
    city: cityRows.length,
  };
  const hasGoogleCityData = breakdown.location.city.some((item) => item.platform === "google");
  const defaultLocationTab = getDefaultLocationTab(
    countryRows,
    regionRows,
    cityRows,
    hasGoogleCityData
  );
  const activeLocationTab =
    selectedLocationTab && locationRowCounts[selectedLocationTab] > 0
      ? selectedLocationTab
      : defaultLocationTab;

  const locationRows = useMemo(() => {
    if (activeLocationTab === "country") {
      return countryRows;
    }
    if (activeLocationTab === "city") {
      return cityRows;
    }
    return regionRows;
  }, [activeLocationTab, cityRows, countryRows, regionRows]);

  return (
    <section className="space-y-4 rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold text-[#555] sm:text-3xl md:text-4xl">
            Audience Click Breakdown
          </h2>
          <p className="max-w-4xl text-sm leading-6 text-[#5f5f5f] sm:text-base">
            Clicks by age, gender, and location for audience optimisation.
          </p>
        </div>
        <AudienceChartControls
          chartType={chartType}
          onChartTypeChange={setChartType}
          unknownFilterMode={unknownFilterMode}
          onUnknownFilterModeChange={setUnknownFilterMode}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AudienceChartCard title="Age Breakdown" chartType={chartType}>
          <AudienceChart rows={ageRows} chartType={chartType} />
        </AudienceChartCard>
        <AudienceChartCard title="Gender Breakdown" chartType={chartType}>
          <AudienceChart rows={genderRows} chartType={chartType} />
        </AudienceChartCard>
      </div>

      <AudienceChartCard
        title="Location Breakdown"
        chartType={chartType}
        headerRight={
          <div className="flex flex-wrap gap-2">
            {LOCATION_TABS.map((tab) => {
              const active = activeLocationTab === tab.key;
              const disabled = locationRowCounts[tab.key] === 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      setSelectedLocationTab(tab.key);
                    }
                  }}
                  disabled={disabled}
                  className={cn(
                    "rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors",
                    disabled
                      ? "cursor-not-allowed border-[#dedede] bg-[#eeeeee] text-[#aaaaaa] opacity-70"
                      : active
                        ? "border-[#e10600] bg-[#e10600] text-white"
                        : "border-[#dadada] bg-white text-[#444] hover:border-[#e10600]/40 hover:text-[#e10600]"
                  )}
                  aria-pressed={active && !disabled}
                  title={disabled ? `${tab.label} data is not available for this report` : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        }
      >
        <AudienceChart rows={locationRows} chartType={chartType} minBarHeightPx={10} />
      </AudienceChartCard>
    </section>
  );
}

function AudienceChartControls({
  chartType,
  onChartTypeChange,
  unknownFilterMode,
  onUnknownFilterModeChange,
}: {
  chartType: ChartType;
  onChartTypeChange: (next: ChartType) => void;
  unknownFilterMode: UnknownFilterMode;
  onUnknownFilterModeChange: (next: UnknownFilterMode) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-[#d8d8d8] bg-white/80 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center lg:justify-end"
      data-report-export-exclude="true"
    >
      <div className="inline-flex rounded-xl border border-[#dedede] bg-white p-1">
        <button
          type="button"
          onClick={() => onChartTypeChange("bar")}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
            chartType === "bar" ? "bg-[#e10600] text-white" : "text-[#444] hover:bg-[#f3f3f3]"
          )}
          aria-pressed={chartType === "bar"}
        >
          <BarChart3Icon className="size-4" />
          Bar
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange("pie")}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
            chartType === "pie" ? "bg-[#e10600] text-white" : "text-[#444] hover:bg-[#f3f3f3]"
          )}
          aria-pressed={chartType === "pie"}
        >
          <PieChartIcon className="size-4" />
          Pie
        </button>
      </div>

      <div className="flex h-12 items-center justify-between gap-4 rounded-xl border border-[#dedede] bg-white px-4 text-[#444]">
        <Label htmlFor="audience-hide-unknown" className="text-sm font-medium">
          Hide unknown
        </Label>
        <Switch
          id="audience-hide-unknown"
          checked={unknownFilterMode === "exclude"}
          onCheckedChange={(checked) =>
            onUnknownFilterModeChange(checked ? "exclude" : "include")
          }
          className="data-[state=checked]:bg-[#e10600]"
        />
      </div>
    </div>
  );
}

function AudienceChartCard({
  title,
  chartType,
  headerRight,
  children,
}: {
  title: string;
  chartType: ChartType;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.4rem] border border-[#dadada] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-[#2f2f2f] sm:text-[1.85rem]">{title}</h3>
          <p className="mt-1 text-sm text-[#666]">
            {chartType === "pie" ? "Percentage of clicks" : "Clicks"}
          </p>
        </div>
        {headerRight ? <div className="sm:pt-1">{headerRight}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function AudienceChart({
  rows,
  chartType,
  minBarHeightPx,
}: {
  rows: AudienceBreakdownRow[];
  chartType: ChartType;
  minBarHeightPx?: number;
}) {
  return chartType === "pie" ? (
    <PieChart rows={rows} />
  ) : (
    <VerticalBarChart rows={rows} minBarHeightPx={minBarHeightPx} />
  );
}

function VerticalBarChart({
  rows,
  minBarHeightPx = 8,
}: {
  rows: AudienceBreakdownRow[];
  minBarHeightPx?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[17rem] items-center justify-center rounded-xl border border-dashed border-[#dddddd] bg-[#fafafa] px-4 text-center text-sm text-[#6a6a6a]">
        {EMPTY_STATE_MESSAGE}
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((row) => row.clicks), 1);
  const tickValues = [1, 0.75, 0.5, 0.25, 0].map((step) => Math.round(maxValue * step));
  const compactSpacing = rows.length > 8;

  const columnGapClass = compactSpacing ? "gap-x-1.5 sm:gap-x-2" : "gap-x-2 sm:gap-x-3";
  const gridColumns = { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` };
  const chartMinWidth = compactSpacing ? `${rows.length * 5.5}rem` : undefined;

  return (
    <div className="overflow-x-auto pb-1" onMouseLeave={() => setActiveIndex(null)}>
      <div
        className="grid min-h-[17rem] grid-cols-[2.25rem_minmax(0,1fr)] grid-rows-[14rem_auto] gap-x-2 gap-y-2 sm:gap-x-3"
        style={{ minWidth: chartMinWidth }}
      >
        <div className="row-start-1 flex h-full flex-col justify-between pt-8 text-xs text-[#6f6f6f]">
          {tickValues.map((value, index) => (
            <span key={`${value}-${index}`}>{formatCompactNumber(value)}</span>
          ))}
        </div>

        <div className="relative row-start-1 pl-3">
          <div className="pointer-events-none absolute bottom-0 left-3 right-0 top-8 border-l border-b border-[#e3e3e3]">
            <div className="grid h-full grid-rows-4">
              {[0, 1, 2, 3].map((line) => (
                <div key={line} className="border-b border-dashed border-[#efefef]" />
              ))}
            </div>
          </div>

          <div className={`relative z-10 grid h-full ${columnGapClass}`} style={gridColumns}>
            {rows.map((row, index) => {
              const percent = maxValue > 0 ? (row.clicks / maxValue) * 100 : 0;
              const active = activeIndex === index;
              return (
                <div
                  key={`${row.label}-${index}`}
                  className="relative min-w-0 outline-none"
                  tabIndex={0}
                  aria-label={`${row.label}: ${formatCompactNumber(row.clicks)} clicks`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                >
                  {active ? (
                    <div className="absolute bottom-0 left-0 right-0 top-8 rounded-t-md bg-[#eeeeee]" />
                  ) : null}
                  <div className="absolute bottom-0 left-0 right-0 top-8 flex items-end justify-center">
                    <div
                      className="relative w-full max-w-[2.7rem] rounded-t-[2px] bg-[#f30707] transition-all duration-150"
                      style={{
                        height:
                          row.clicks > 0
                            ? `max(${percent.toFixed(2)}%, ${minBarHeightPx}px)`
                            : "0%",
                      }}
                    >
                      <span
                        className="absolute bottom-[calc(100%+0.35rem)] left-1/2 -translate-x-1/2 text-sm font-medium text-[#1f1f1f] transition-colors sm:text-base"
                      >
                        {formatCompactNumber(row.clicks)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`col-start-2 row-start-2 grid pl-3 ${columnGapClass}`} style={gridColumns}>
          {rows.map((row, index) => (
            <span
              key={`${row.label}-${index}`}
              className="min-w-0 break-words text-center text-[11px] leading-4 text-[#333] transition-colors sm:text-sm sm:leading-5"
            >
              {row.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PieChart({ rows }: { rows: AudienceBreakdownRow[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[17rem] items-center justify-center rounded-xl border border-dashed border-[#dddddd] bg-[#fafafa] px-4 text-center text-sm text-[#6a6a6a]">
        {EMPTY_STATE_MESSAGE}
      </div>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.clicks, 0);
  const segments = buildPieSegments(rows, total);
  const activeRow = activeIndex !== null ? rows[activeIndex] : null;
  const activePercent = activeRow ? formatPercent(activeRow.clicks, total) : null;

  return (
    <div
      className="grid min-h-[17rem] gap-4 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] lg:items-center"
      onMouseLeave={() => setActiveIndex(null)}
    >
      <div className="flex justify-center">
        <svg
          viewBox="0 0 220 220"
          role="img"
          aria-label="Audience click percentage pie chart"
          className="h-[14rem] w-[14rem] max-w-full"
        >
          {segments.map((segment, index) => {
            const active = activeIndex === index;
            const fill = active ? "#b80000" : PIE_COLORS[index % PIE_COLORS.length];
            const commonProps = {
              fill,
              stroke: "#ffffff",
              strokeWidth: 2,
              className: "cursor-pointer transition-opacity duration-150",
              opacity: 1,
              tabIndex: 0,
              onMouseEnter: () => setActiveIndex(index),
              onFocus: () => setActiveIndex(index),
              onBlur: () => setActiveIndex(null),
            };

            if (segment.fullCircle) {
              return (
                <circle key={`${segment.label}-${index}`} cx="110" cy="110" r="92" {...commonProps}>
                  <title>
                    {segment.label}: {formatPercent(segment.clicks, total)}
                  </title>
                </circle>
              );
            }

            return (
              <path key={`${segment.label}-${index}`} d={segment.path} {...commonProps}>
                <title>
                  {segment.label}: {formatPercent(segment.clicks, total)}
                </title>
              </path>
            );
          })}
        </svg>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#777]">
            {activeRow ? activeRow.label : "Total clicks"}
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#222]">
            {activeRow ? activePercent : formatCompactNumber(total)}
          </p>
        </div>

        <div className="grid max-h-[12rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {rows.map((row, index) => {
            const active = activeIndex === index;
            return (
              <button
                key={`${row.label}-${index}`}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                className={cn(
                  "flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-[#f1b0b0] bg-[#fff5f5] text-[#b80000]"
                    : "border-[#ededed] bg-white text-[#333]"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        active ? "#b80000" : PIE_COLORS[index % PIE_COLORS.length],
                    }}
                  />
                  <span className="min-w-0 truncate text-sm font-medium">{row.label}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">{formatPercent(row.clicks, total)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function filterUnknownRows<T extends { label: string }>(rows: T[], includeUnknown: boolean): T[] {
  if (includeUnknown) {
    return rows;
  }
  return rows.filter((row) => !isUnknownAudienceLabel(row.label));
}

function isUnknownAudienceLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/[()_\-]+/g, " ").replace(/\s+/g, " ");
  return ["unknown", "not set", "unset", "undetermined", "unspecified", "n/a", "na"].includes(
    normalized
  );
}

function getDefaultLocationTab(
  countryRows: AudienceBreakdownRow[],
  regionRows: AudienceBreakdownRow[],
  cityRows: AudienceBreakdownRow[],
  hasGoogleCityData: boolean
): LocationTabKey {
  if (shouldUseCityLocationTab(regionRows, cityRows, hasGoogleCityData)) {
    return "city";
  }

  if (regionRows.length > 0) {
    return "region";
  }

  if (countryRows.length > 0) {
    return "country";
  }

  if (cityRows.length > 0) {
    return "city";
  }

  return "region";
}

function shouldUseCityLocationTab(
  regionRows: AudienceBreakdownRow[],
  cityRows: AudienceBreakdownRow[],
  hasGoogleCityData: boolean
): boolean {
  return hasGoogleCityData && regionRows.length < 3 && cityRows.length > 0;
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  const percent = (value / total) * 100;
  return `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

interface PieSegment {
  label: string;
  clicks: number;
  path: string;
  fullCircle: boolean;
}

function buildPieSegments(rows: AudienceBreakdownRow[], total: number): PieSegment[] {
  if (total <= 0) {
    return [];
  }

  let startAngle = -90;
  return rows.map((row) => {
    const sliceAngle = (row.clicks / total) * 360;
    const endAngle = startAngle + sliceAngle;
    const fullCircle = sliceAngle >= 359.99;
    const segment = {
      label: row.label,
      clicks: row.clicks,
      path: fullCircle ? "" : describePieSlice(110, 110, 92, startAngle, endAngle),
      fullCircle,
    };
    startAngle = endAngle;
    return segment;
  });
}

function describePieSlice(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
