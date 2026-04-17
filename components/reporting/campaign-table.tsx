"use client";

import { useEffect, useMemo, useState } from "react";
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
          <details key={group.id} open className="overflow-hidden rounded-xl border border-[#d7d7d7] bg-white shadow-sm">
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
                  previewHref={buildPreviewHref(row, queryString)}
                />
              ))}
              <CampaignMobileCard row={group.totals} forceTitle="Grand Total" />
            </div>
            <div className="hidden px-2 pb-2 md:block">
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border/60 text-[11px] text-[#454545] sm:text-xs">
                    <th className="px-1.5 py-2 font-semibold leading-tight whitespace-normal break-words">Campaign</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Impression</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Clicks</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">CTR (%)</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">CPM (RM)</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Results</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Cost/Results</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Ads Spent (RM)</th>
                    <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-1.5 py-2 align-top whitespace-normal break-words leading-5">
                        {buildPreviewHref(row, queryString) ? (
                          <Link
                            className="font-medium text-[#9f0019] hover:underline"
                            href={buildPreviewHref(row, queryString)!}
                          >
                            {row.campaignName}
                          </Link>
                        ) : (
                          row.campaignName
                        )}
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.impressions)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.clicks)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.ctr)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.cpm)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.results)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.costPerResult)}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.spend)}</td>
                      <td className="px-1.5 py-2 text-center whitespace-nowrap">
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
                    <td className="px-1.5 py-2 align-top whitespace-normal break-words leading-5">Grand Total</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.impressions)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.clicks)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.ctr)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.cpm)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.results)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.costPerResult)}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(group.totals.spend)}</td>
                    <td className="px-1.5 py-2 text-center whitespace-nowrap">-</td>
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
  const rowsSignature = useMemo(() => rowsWithSpend.map((row) => row.id).join("|"), [rowsWithSpend]);
  const safePage = Math.min(page, totalPages);
  const startIndex = showAllRows ? 0 : (safePage - 1) * ROWS_PER_PAGE;
  const visibleRows = showAllRows
    ? rowsWithSpend
    : rowsWithSpend.slice(startIndex, startIndex + ROWS_PER_PAGE);

  const fromCount = rowsWithSpend.length === 0 ? 0 : startIndex + 1;
  const toCount =
    rowsWithSpend.length === 0 ? 0 : Math.min(startIndex + visibleRows.length, rowsWithSpend.length);

  useEffect(() => {
    setPage(1);
  }, [heading, rowsSignature]);

  if (rowsWithSpend.length === 0) {
    return null;
  }

  return (
    <details open className="overflow-hidden rounded-xl border border-[#d7d7d7] bg-white shadow-sm">
      <summary className="cursor-pointer rounded-xl bg-[#f0adad] px-4 py-3 text-lg font-semibold sm:text-xl">
        {heading}
      </summary>
      <div className="space-y-2 px-2 pb-2 md:hidden">
        {visibleRows.map((row) => (
          <CampaignMobileCard key={row.id} row={row} />
        ))}
        <CampaignMobileCard row={totalsWithSpend} forceTitle="Grand Total" />
      </div>
      <div className="hidden px-2 pb-2 md:block">
        <table className="w-full table-fixed text-left text-xs sm:text-sm">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/60 text-[11px] text-[#454545] sm:text-xs">
              <th className="px-1.5 py-2 font-semibold leading-tight whitespace-normal break-words">Campaign</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Impression</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Clicks</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">CTR (%)</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">CPM (RM)</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Results</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Cost/Results</th>
              <th className="px-1.5 py-2 text-center font-semibold leading-tight whitespace-normal break-words">Ads Spent (RM)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-1.5 py-2 align-top whitespace-normal break-words leading-5">
                  {row.campaignName}
                </td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.impressions)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.clicks)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.ctr)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.cpm)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.results)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.costPerResult)}</td>
                <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(row.spend)}</td>
              </tr>
            ))}
            <tr className="bg-[#f9f9f9] font-semibold">
              <td className="px-1.5 py-2 align-top whitespace-normal break-words leading-5">Grand Total</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.impressions)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.clicks)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.ctr)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.cpm)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.results)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.costPerResult)}</td>
              <td className="px-1.5 py-2 text-center tabular-nums whitespace-nowrap">{formatCompactNumber(totalsWithSpend.spend)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!showAllRows ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground sm:justify-end">
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
  previewHref,
}: {
  row: CampaignRow;
  forceTitle?: string;
  actionHref?: string;
  previewHref?: string | null;
}) {
  return (
    <article className="rounded-lg border border-border/50 bg-[#f9f9f9] p-3 shadow-sm">
      {previewHref && !forceTitle ? (
        <Link className="text-sm font-semibold text-[#9f0019] hover:underline" href={previewHref}>
          {row.campaignName}
        </Link>
      ) : (
        <p className="text-sm font-semibold text-[#454545]">{forceTitle ?? row.campaignName}</p>
      )}
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

function buildPreviewHref(row: CampaignRow, queryString: string): string | null {
  if (row.platform !== "meta" && row.platform !== "google") {
    return null;
  }

  const params = new URLSearchParams(queryString.startsWith("&") ? queryString.slice(1) : queryString);
  params.set("platform", row.platform);
  params.set("campaignName", row.campaignName);
  const query = params.toString();
  return query ? `/preview?${query}` : "/preview";
}
