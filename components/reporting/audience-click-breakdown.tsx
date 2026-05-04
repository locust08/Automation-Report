"use client";

import { useMemo, useState } from "react";

import { summarizeAudienceItemsForChart } from "@/lib/reporting/audience-breakdown";
import { formatCompactNumber } from "@/lib/reporting/format";
import { AudienceBreakdownRow, AudienceClickBreakdownResponse } from "@/lib/reporting/types";

const LOCATION_TABS = [
  { key: "country", label: "Country" },
  { key: "region", label: "State / Region" },
  { key: "city", label: "City" },
] as const;

type LocationTabKey = (typeof LOCATION_TABS)[number]["key"];

const EMPTY_STATE_MESSAGE = "No audience click data available for this breakdown.";

export function AudienceClickBreakdownSection({
  breakdown,
}: {
  breakdown: AudienceClickBreakdownResponse;
}) {
  const [activeLocationTab, setActiveLocationTab] = useState<LocationTabKey>("region");

  const ageRows = useMemo(() => summarizeAudienceItemsForChart(breakdown.age, "age"), [breakdown.age]);
  const genderRows = useMemo(
    () => summarizeAudienceItemsForChart(breakdown.gender, "gender"),
    [breakdown.gender]
  );
  const countryRows = useMemo(
    () => summarizeAudienceItemsForChart(breakdown.location.country, "country"),
    [breakdown.location.country]
  );
  const regionRows = useMemo(
    () => summarizeAudienceItemsForChart(breakdown.location.region, "region"),
    [breakdown.location.region]
  );
  const cityRows = useMemo(
    () => summarizeAudienceItemsForChart(breakdown.location.city, "city"),
    [breakdown.location.city]
  );

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
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold text-[#555] sm:text-3xl md:text-4xl">
          Audience Click Breakdown
        </h2>
        <p className="max-w-4xl text-sm leading-6 text-[#5f5f5f] sm:text-base">
          This section shows where the ad clicks came from based on audience age, gender, and
          location. It helps identify the strongest audience segments for future optimisation.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AudienceChartCard title="Age Breakdown">
          <VerticalBarChart rows={ageRows} />
        </AudienceChartCard>
        <AudienceChartCard title="Gender Breakdown">
          <VerticalBarChart rows={genderRows} />
        </AudienceChartCard>
      </div>

      <AudienceChartCard
        title="Location Breakdown"
        headerRight={
          <div className="flex flex-wrap gap-2">
            {LOCATION_TABS.map((tab) => {
              const active = activeLocationTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveLocationTab(tab.key)}
                  className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-[#e10600] bg-[#e10600] text-white"
                      : "border-[#dadada] bg-white text-[#444]"
                  }`}
                  aria-pressed={active}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        }
      >
        <VerticalBarChart rows={locationRows} minBarHeightPx={10} />
      </AudienceChartCard>
    </section>
  );
}

function AudienceChartCard({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.4rem] border border-[#dadada] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-[#2f2f2f] sm:text-[1.85rem]">{title}</h3>
          <p className="mt-1 text-sm text-[#666]">Clicks</p>
        </div>
        {headerRight ? <div className="sm:pt-1">{headerRight}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function VerticalBarChart({
  rows,
  minBarHeightPx = 8,
}: {
  rows: AudienceBreakdownRow[];
  minBarHeightPx?: number;
}) {
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

  return (
    <div className="grid min-h-[17rem] grid-cols-[2.25rem_minmax(0,1fr)] gap-2 sm:gap-3">
      <div className="flex flex-col justify-between pb-7 text-xs text-[#6f6f6f]">
        {tickValues.map((value, index) => (
          <span key={`${value}-${index}`}>{formatCompactNumber(value)}</span>
        ))}
      </div>

      <div className="relative border-l border-b border-[#e3e3e3] pl-3">
        <div className="pointer-events-none absolute inset-0 left-3 grid grid-rows-4">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-b border-dashed border-[#efefef]" />
          ))}
        </div>

        <div
          className={`relative z-10 grid h-full items-end pb-1 ${
            compactSpacing ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3"
          }`}
          style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
        >
          {rows.map((row) => {
            const percent = maxValue > 0 ? (row.clicks / maxValue) * 100 : 0;
            return (
              <div
                key={row.label}
                className="flex min-w-0 flex-col items-center gap-2"
              >
                <span className="text-sm font-medium text-[#1f1f1f] sm:text-base">
                  {formatCompactNumber(row.clicks)}
                </span>
                <div className="flex h-[11.5rem] w-full items-end justify-center">
                  <div
                    className="w-full max-w-[2.7rem] rounded-t-[2px] bg-[#f30707]"
                    style={{
                      height:
                        row.clicks > 0
                          ? `max(${percent.toFixed(2)}%, ${minBarHeightPx}px)`
                          : "0%",
                    }}
                  />
                </div>
                <span className="break-words text-center text-[11px] leading-4 text-[#333] sm:text-sm sm:leading-5">
                  {row.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
