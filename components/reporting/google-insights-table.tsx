"use client";

import { AuctionInsightRow, TopKeywordRow } from "@/lib/reporting/types";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatPercentValue(value: number, label?: string): string {
  if (typeof label === "string" && label.trim().length > 0) {
    return label;
  }
  return formatPercent(value);
}

export function TopKeywordTable({
  rows,
  totals,
  screenshotMode = false,
}: {
  rows: TopKeywordRow[];
  totals: TopKeywordRow;
  screenshotMode?: boolean;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-2xl font-semibold text-[#555] sm:text-3xl">Top 10 Performing Keywords</h2>
      <div
        className={[
          "rounded-2xl border border-[#d1d1d1] bg-white shadow-sm",
          screenshotMode ? "overflow-visible" : "overflow-x-auto",
        ].join(" ")}
      >
        <table
          className={[
            "w-full text-left",
            screenshotMode ? "table-fixed text-[11px] sm:text-xs" : "min-w-[980px] text-xs sm:text-sm",
          ].join(" ")}
        >
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[26%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#f1bba9] text-[#444]">
              <th className="px-3 py-3 font-semibold leading-tight">#</th>
              <th className="px-3 py-3 font-semibold leading-tight whitespace-normal break-words">Search keyword</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Impressions</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Clicks</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Avg. CPC</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">CTR</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Conversions</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Conv. rate</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Cost / conv.</th>
              <th className="px-3 py-3 text-right font-semibold leading-tight whitespace-normal break-words">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2 align-top tabular-nums whitespace-nowrap">{index + 1}.</td>
                <td className="px-3 py-2 align-top whitespace-normal break-words leading-5">{row.keyword}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.impressions)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.clicks)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.avgCpc)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatPercent(row.ctr)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.conversions)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatPercent(row.conversionRate)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.costPerConversion)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums whitespace-nowrap">{formatNumber(row.cost)}</td>
              </tr>
            ))}
            <tr className="bg-[#f7f7f7] font-semibold">
              <td className="px-3 py-3" />
              <td className="px-3 py-3">Grand total</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.impressions)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.clicks)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.avgCpc)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(totals.ctr)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.conversions)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(totals.conversionRate)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.costPerConversion)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(totals.cost)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AuctionInsightsTable({
  rows,
  averages,
}: {
  rows: AuctionInsightRow[];
  averages: Omit<AuctionInsightRow, "id" | "displayDomain" | "observations">;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-2xl font-semibold text-[#555] sm:text-3xl">Auction Insights</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#d1d1d1] bg-white shadow-sm">
        <table className="w-full min-w-[1040px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#f1bba9] text-[#444]">
              <th className="px-3 py-3 font-semibold">Display domain</th>
              <th className="px-3 py-3 text-right font-semibold">Impr. share</th>
              <th className="px-3 py-3 text-right font-semibold">Overlap rate</th>
              <th className="px-3 py-3 text-right font-semibold">Position above rate</th>
              <th className="px-3 py-3 text-right font-semibold">Top of page rate</th>
              <th className="px-3 py-3 text-right font-semibold">Abs. top of page rate</th>
              <th className="px-3 py-3 text-right font-semibold">Outranking share</th>
              <th className="px-3 py-3 text-right font-semibold">Rows</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2">{row.displayDomain}</td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(row.impressionShare, row.impressionShareLabel)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(row.overlapRate, row.overlapRateLabel)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(row.positionAboveRate, row.positionAboveRateLabel)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(row.topOfPageRate, row.topOfPageRateLabel)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(
                    row.absoluteTopOfPageRate,
                    row.absoluteTopOfPageRateLabel
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPercentValue(row.outrankingShare, row.outrankingShareLabel)}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(row.observations)}</td>
              </tr>
            ))}
            <tr className="bg-[#f7f7f7] font-semibold">
              <td className="px-3 py-3">Average</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.impressionShare)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.overlapRate)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.positionAboveRate)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.topOfPageRate)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.absoluteTopOfPageRate)}</td>
              <td className="px-3 py-3 text-right">{formatPercent(averages.outrankingShare)}</td>
              <td className="px-3 py-3 text-right">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
