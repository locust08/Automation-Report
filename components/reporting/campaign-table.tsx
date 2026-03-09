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
    <section className="space-y-4 rounded-[2rem] bg-[#e7e7e7] p-6 shadow-sm">
      <h2 className="text-4xl font-semibold text-[#555]">Campaign Breakdown</h2>
      <div className="space-y-4">
        {visibleGroups.map((group) => (
          <details key={group.id} open className="rounded-xl bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between rounded-xl bg-[#f0adad] px-4 py-3 text-lg font-semibold">
              <span>
                {platformLabel(group.platform)} - {group.campaignType}
              </span>
              <ChevronDownIcon className="size-5" />
            </summary>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[#454545]">
                    <th className="px-2 py-3 font-semibold">Campaign</th>
                    <th className="px-2 py-3 font-semibold">Impression</th>
                    <th className="px-2 py-3 font-semibold">Clicks</th>
                    <th className="px-2 py-3 font-semibold">CTR (%)</th>
                    <th className="px-2 py-3 font-semibold">CPM (RM)</th>
                    <th className="px-2 py-3 font-semibold">Results</th>
                    <th className="px-2 py-3 font-semibold">Cost/Results</th>
                    <th className="px-2 py-3 font-semibold">Ads Spent (RM)</th>
                    <th className="px-2 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-2 py-2">{row.campaignName}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.impressions)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.clicks)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.ctr)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.cpm)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.results)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.costPerResult)}</td>
                      <td className="px-2 py-2">{formatCompactNumber(row.spend)}</td>
                      <td className="px-2 py-2">
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
                    <td className="px-2 py-2">Grand Total</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.impressions)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.clicks)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.ctr)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.cpm)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.results)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.costPerResult)}</td>
                    <td className="px-2 py-2">{formatCompactNumber(group.totals.spend)}</td>
                    <td className="px-2 py-2">-</td>
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
      <summary className="cursor-pointer rounded-xl bg-[#f0adad] px-4 py-3 text-xl font-semibold">
        {heading}
      </summary>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[#454545]">
              <th className="px-2 py-3 font-semibold">Campaign</th>
              <th className="px-2 py-3 font-semibold">Impression</th>
              <th className="px-2 py-3 font-semibold">Clicks</th>
              <th className="px-2 py-3 font-semibold">CTR (%)</th>
              <th className="px-2 py-3 font-semibold">CPM (RM)</th>
              <th className="px-2 py-3 font-semibold">Results</th>
              <th className="px-2 py-3 font-semibold">Cost/Results</th>
              <th className="px-2 py-3 font-semibold">Ads Spent (RM)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-2 py-2">{row.campaignName}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.impressions)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.clicks)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.ctr)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.cpm)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.results)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.costPerResult)}</td>
                <td className="px-2 py-2">{formatCompactNumber(row.spend)}</td>
              </tr>
            ))}
            <tr className="bg-[#f9f9f9] font-semibold">
              <td className="px-2 py-2">Grand Total</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.impressions)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.clicks)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.ctr)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.cpm)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.results)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.costPerResult)}</td>
              <td className="px-2 py-2">{formatCompactNumber(totalsWithSpend.spend)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!showAllRows ? (
        <div className="flex items-center justify-end gap-2 px-3 pb-3 text-xs text-muted-foreground">
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
