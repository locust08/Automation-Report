"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCompactNumber } from "@/lib/reporting/format";
import { emptyCampaignRow, mergeCampaignRows } from "@/lib/reporting/metrics";
import { CampaignGroup, CampaignRow, Platform } from "@/lib/reporting/types";

const ROWS_PER_PAGE = 8;

export function OverallCampaignGroupsTable({
  groups,
  queryString,
}: {
  groups: CampaignGroup[];
  queryString: string;
}) {
  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => {
        const rows = withPositiveSpend(group.rows);
        if (rows.length === 0) {
          return null;
        }
        return {
          ...group,
          rows,
          totals: buildTotalsFromRows(rows, group.totals),
        };
      })
      .filter((group): group is CampaignGroup => Boolean(group));
  }, [groups]);

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <h2 className="text-2xl font-semibold text-[#555] sm:text-3xl md:text-4xl">Campaign Breakdown</h2>
      <div className="space-y-4">
        {visibleGroups.map((group) => (
          <details key={group.id} open className="rounded-xl bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between rounded-xl bg-[#f0adad] px-4 py-3 text-base font-semibold sm:text-lg">
              <span>
                {platformLabel(group.platform)} - {group.campaignType}
              </span>
              <ChevronDownIcon className="size-5" />
            </summary>
            <div className="space-y-2 px-2 pb-2 md:hidden">
              {group.rows.map((row) => (
                <CampaignMobileCard
                  key={row.id}
                  row={row}
                  actionHref={`/campaign/${encodeURIComponent(group.campaignType)}?platform=${group.platform}${queryString}`}
                />
              ))}
              <CampaignMobileCard row={group.totals} forceTitle="Grand Total" />
            </div>
            <div className="hidden overflow-x-auto px-2 pb-2 md:block">
              <table className="min-w-[920px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[#454545]">
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Campaign</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Impression</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Clicks</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">CTR (%)</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">CPM (RM)</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Results</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Cost/Results</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Ads Spent (RM)</th>
                    <th className="px-2 py-3 font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-2 py-2 whitespace-nowrap">{row.campaignName}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.impressions)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.clicks)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.ctr)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.cpm)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.results)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.costPerResult)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.spend)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Link
                          className="inline-flex items-center gap-1 text-red-700 hover:underline"
                          href={`/campaign/${encodeURIComponent(group.campaignType)}?platform=${group.platform}${queryString}`}
                        >
                          View
                          <ExternalLinkIcon className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#f9f9f9] font-semibold">
                    <td className="px-2 py-2 whitespace-nowrap">Grand Total</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.impressions)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.clicks)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.ctr)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.cpm)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.results)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.costPerResult)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(group.totals.spend)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CampaignComparisonTable({
  heading,
  rows,
  totals,
  showAllRows = false,
}: {
  heading: string;
  rows: CampaignRow[];
  totals: CampaignRow;
  showAllRows?: boolean;
}) {
  const [page, setPage] = useState(1);
  const rowsWithSpend = useMemo(() => withPositiveSpend(rows), [rows]);
  const totalsWithSpend = useMemo(() => buildTotalsFromRows(rowsWithSpend, totals), [rowsWithSpend, totals]);
  const totalPages = showAllRows ? 1 : Math.max(1, Math.ceil(rowsWithSpend.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = showAllRows ? 0 : (safePage - 1) * ROWS_PER_PAGE;
  const visibleRows = showAllRows
    ? rowsWithSpend
    : rowsWithSpend.slice(startIndex, startIndex + ROWS_PER_PAGE);

  const fromCount = rowsWithSpend.length === 0 ? 0 : startIndex + 1;
  const toCount =
    rowsWithSpend.length === 0 ? 0 : Math.min(startIndex + visibleRows.length, rowsWithSpend.length);

  if (rowsWithSpend.length === 0) {
    return null;
  }

  return (
    <details open className="rounded-xl bg-white shadow-sm">
      <summary className="cursor-pointer rounded-xl bg-[#f0adad] px-4 py-3 text-lg font-semibold sm:text-xl">
        {heading}
      </summary>
      <div className="space-y-2 px-2 pb-2 md:hidden">
        {visibleRows.map((row) => (
          <CampaignMobileCard key={row.id} row={row} />
        ))}
        <CampaignMobileCard row={totalsWithSpend} forceTitle="Grand Total" />
      </div>
      <div className="hidden overflow-x-auto px-2 pb-2 md:block">
        <table className="min-w-[920px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[#454545]">
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Campaign</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Impression</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Clicks</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">CTR (%)</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">CPM (RM)</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Results</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Cost/Results</th>
              <th className="px-2 py-3 font-semibold whitespace-nowrap">Ads Spent (RM)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-2 py-2 whitespace-nowrap">{row.campaignName}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.impressions)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.clicks)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.ctr)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.cpm)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.results)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.costPerResult)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(row.spend)}</td>
              </tr>
            ))}
            <tr className="bg-[#f9f9f9] font-semibold">
              <td className="px-2 py-2 whitespace-nowrap">Grand Total</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.impressions)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.clicks)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.ctr)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.cpm)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.results)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.costPerResult)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatCompactNumber(totalsWithSpend.spend)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!showAllRows ? (
        <div className="flex items-center justify-between gap-2 px-3 pb-3 text-xs text-muted-foreground sm:justify-end">
          <span>
            {fromCount} - {toCount} / {rowsWithSpend.length || 0}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-6 w-6"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage <= 1}
            aria-label="Previous table page"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-6 w-6"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
            aria-label="Next table page"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </details>
  );
}

function platformLabel(platform: Platform): string {
  if (platform === "meta") {
    return "Meta";
  }
  if (platform === "googleYoutube") {
    return "Google YouTube";
  }
  return "Google Ads";
}

const CAMPAIGN_MOBILE_METRICS: Array<{
  key: string;
  label: string;
  value: (row: CampaignRow) => number;
}> = [
  { key: "impressions", label: "Impression", value: (row) => row.impressions },
  { key: "clicks", label: "Clicks", value: (row) => row.clicks },
  { key: "ctr", label: "CTR (%)", value: (row) => row.ctr },
  { key: "cpm", label: "CPM (RM)", value: (row) => row.cpm },
  { key: "results", label: "Results", value: (row) => row.results },
  { key: "costPerResult", label: "Cost/Results", value: (row) => row.costPerResult },
  { key: "spend", label: "Ads Spent (RM)", value: (row) => row.spend },
];

function CampaignMobileCard({
  row,
  forceTitle,
  actionHref,
}: {
  row: CampaignRow;
  forceTitle?: string;
  actionHref?: string;
}) {
  return (
    <article className="rounded-lg border border-border/50 bg-[#f9f9f9] p-3 shadow-sm">
      <p className="text-sm font-semibold text-[#454545]">{forceTitle ?? row.campaignName}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {CAMPAIGN_MOBILE_METRICS.map((metric) => (
          <div key={`${row.id}-${metric.key}`} className="space-y-0.5">
            <dt className="text-[#7a7a7a]">{metric.label}</dt>
            <dd className="font-semibold text-[#37363e]">{formatCompactNumber(metric.value(row))}</dd>
          </div>
        ))}
      </dl>
      {actionHref ? (
        <Link className="mt-3 inline-flex items-center gap-1 text-sm text-red-700 hover:underline" href={actionHref}>
          View
          <ExternalLinkIcon className="size-3.5" />
        </Link>
      ) : null}
    </article>
  );
}

function withPositiveSpend(rows: CampaignRow[]): CampaignRow[] {
  return rows.filter((row) => row.spend > 0);
}

function buildTotalsFromRows(rows: CampaignRow[], fallback: CampaignRow): CampaignRow {
  return rows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow(
      `${fallback.id}-filtered`,
      fallback.platform,
      fallback.campaignType,
      "Grand Total"
    )
  );
}
