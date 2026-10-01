"use client";

import { AdvancedLoadingPanel } from "./advanced-loading-panel";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useScreenshotMode } from "./use-screenshot-mode";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3Icon, UsersIcon, LayoutGridIcon, ChevronDownIcon } from "lucide-react";
import { useReportSectionQuery } from "./use-report-data";
import { filterRowsByCampaignName, type CampaignNameFilter } from "@/lib/reporting/campaign-name-filter";
import { sumDemandValues, demandShare, demandMetrics, demandDevices, demandFormats, type DemandMetric, type DemandAudienceRow, type DemandGenPayload, type DemandCell } from "@/lib/reporting/demand-gen";

const labels: Record<DemandMetric, string> = { views: "Views", clicks: "Clicks", spend: "Spend", conversions: "Conversions", ctr: "CTR (%)", cpc: "CPC", cpm: "CPM" };
const valueLabel = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const panel = "[&>*]:shrink-0 gap-0 space-y-5 rounded-[1.5rem] border border-[#dedede] bg-white p-4 shadow-sm sm:p-6 text-[#111]";
const action = "border-red-200 bg-white text-[#9f0019] hover:bg-red-50 hover:text-[#9f0019]";

export function DemandGenSection({ queryString, campaignNameFilter, onContext }: { queryString: string; campaignNameFilter: CampaignNameFilter | null; onContext?: (data: DemandGenPayload | null, ready: boolean) => void }) {
  return <DemandGenScope key={queryString} queryString={queryString} campaignNameFilter={campaignNameFilter} onContext={onContext} />;
}

function DemandGenScope({ queryString, campaignNameFilter, onContext }: { queryString: string; campaignNameFilter: CampaignNameFilter | null; onContext?: (data: DemandGenPayload | null, ready: boolean) => void }) {
  const router = useRouter(), searchParams = useSearchParams();
  const options = useReportSectionQuery<DemandGenPayload>("/api/reporting/demand-gen", queryString, true, "Unable to list Demand Gen campaigns.", 7 * 24 * 60 * 60 * 1000);
  const campaigns = filterRowsByCampaignName(options.data?.campaigns ?? [], (campaign) => campaign.name, campaignNameFilter);
  const [selection, setSelection] = useState<string[] | null>(() => searchParams.getAll("campaignId").length ? searchParams.getAll("campaignId") : null);
  const campaignIds = selection === null ? campaigns.slice(0, 1).map((c) => c.id) : selection.filter((id) => campaigns.some((c) => c.id === id));
  const [metric, setMetric] = useState<DemandMetric>(() => demandMetrics.includes(searchParams.get("metric") as DemandMetric) ? searchParams.get("metric") as DemandMetric : "views");
  const [search, setSearch] = useState("");
  const persist = (ids: string[], nextMetric: DemandMetric) => {
    const url = new URLSearchParams(searchParams.toString()); url.delete("campaignId"); ids.forEach((id) => url.append("campaignId", id)); url.set("metric", nextMetric);
    router.replace(`/demand-gen?${url}`, { scroll: false });
  };
  const choose = (ids: string[]) => { setSelection(ids); persist(ids, metric); };
  const params = new URLSearchParams(queryString);
  campaignIds.slice().sort().forEach((id) => params.append("campaignId", id));
  const report = useReportSectionQuery<DemandGenPayload>("/api/reporting/demand-gen", params.toString(), Boolean(campaignIds.length), "Unable to load Demand Gen analysis.", 7 * 24 * 60 * 60 * 1000);
  const data = report.data;
  useEffect(() => { onContext?.(data ?? options.data, Boolean(data?.complete && !report.loading && !report.error && campaignIds.length)); }, [data, options.data, report.loading, report.error, campaignIds.length, onContext]);
  return <section className="space-y-5 rounded-[2rem] bg-[#e7e7e7] p-3 shadow-sm sm:p-6" aria-label="Demand Gen analysis">
    <Card className={panel}>
      <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e10600] text-white"><BarChart3Icon className="size-5" /></span><h2 className="text-2xl font-semibold sm:text-3xl">Demand Gen Analysis</h2></div>
      <div className="flex flex-wrap items-center gap-3" data-report-export-exclude="true">
        <DropdownMenu><DropdownMenuTrigger aria-label="Select campaigns" className="flex h-9 w-[420px] max-w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate">{campaignIds.length === 1 ? campaigns.find((c) => c.id === campaignIds[0])?.name : `${campaignIds.length} campaigns selected`}</span><ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[420px] max-w-[calc(100vw-32px)] p-2">
          <Input aria-label="Search campaigns" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(event) => { if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation(); }} className="mb-2" />
          <div className="max-h-72 overflow-y-auto">{campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => <DropdownMenuCheckboxItem key={c.id} checked={campaignIds.includes(c.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => choose(checked ? [...campaignIds, c.id] : campaignIds.filter((id) => id !== c.id))}>{c.name}</DropdownMenuCheckboxItem>)}{!campaigns.some((c) => c.name.toLowerCase().includes(search.toLowerCase())) ? <p className="px-2 py-3 text-sm text-muted-foreground">No matching campaigns.</p> : null}</div>
        </DropdownMenuContent></DropdownMenu>
        <Button variant="outline" className={action} onClick={() => choose(campaigns.map((c) => c.id))}>Show all</Button>
        <span id="demand-metric-label">Metric</span><Select value={metric} onValueChange={(value) => { setMetric(value as DemandMetric); persist(campaignIds, value as DemandMetric); }}><SelectTrigger aria-labelledby="demand-metric-label" className="w-[160px] bg-white"><SelectValue /></SelectTrigger><SelectContent>{demandMetrics.map((key) => <SelectItem key={key} value={key}>{labels[key]}</SelectItem>)}</SelectContent></Select>
      </div>
      <p className="text-sm text-[#777]">{campaigns.filter((c) => campaignIds.includes(c.id)).map((c) => c.name).join(" · ")} · {labels[metric]}</p>
      {options.data ? <p className="text-xs text-[#777]">{options.data.account.name} · {options.data.account.id} · {options.data.account.currency} · {options.data.account.timezone} · {options.data.startDate} – {options.data.endDate}</p> : null}
      {options.loading || report.loading ? <AdvancedLoadingPanel title="Loading Demand Gen analysis" message="Retrieving campaign, audience, and format performance..." /> : null}
      {options.error || report.error ? <p role="alert">{options.error ?? report.error} <Button variant="outline" className={action} onClick={options.error ? options.retry : report.retry}>Retry</Button></p> : null}
      {options.data && !campaigns.length ? <p>No Demand Gen campaigns match this account and campaign filter.</p> : null}
      {data?.warnings.filter((warning) => !warning.startsWith("Notion resolved ") && !/^\d+ non-interest criteria excluded;/.test(warning)).map((warning) => <p key={warning} role="alert" className="text-sm text-amber-800">{warning}</p>)}
      {data && !data.complete ? <Button variant="outline" className={action} onClick={report.retry}>Retry incomplete data</Button> : null}
    </Card>
    {data ? <div key={campaignIds.join(",")} className="space-y-4">
      <AudiencePanel title="In-market" rows={data.inMarket} metric={metric} />
      <AudiencePanel title="Affinity" rows={data.affinity} metric={metric} />
      <DemandAdsPanel ads={data.ads ?? []} />
      <MatrixPanel cells={data.cells} unmapped={data.unmapped} totals={data.totals} metric={metric} />

    </div> : null}
  </section>;
}

function AudiencePanel({ title, rows, metric }: { title: string; rows: DemandAudienceRow[]; metric: DemandMetric }) {
  const { screenshotMode } = useScreenshotMode();
  const [chart, setChart] = useState(false);
  const [sort, setSort] = useState<"name" | DemandMetric>(metric);
  const columns: DemandMetric[] = ["clicks", "ctr", "cpc", "views"];
  if (!columns.includes(metric)) columns.push(metric);
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return (ascending ? 1 : -1) * a.name.localeCompare(b.name);
    const av = a.metrics[sort], bv = b.metrics[sort];
    if (av == null) return bv == null ? a.name.localeCompare(b.name) : 1;
    if (bv == null) return -1;
    return (ascending ? 1 : -1) * (av - bv) || a.name.localeCompare(b.name);
  });
  const pages = Math.max(1, Math.ceil(rows.length / 10)), currentPage = Math.min(page, pages - 1);
  const visible = screenshotMode ? sorted : sorted.slice(currentPage * 10, currentPage * 10 + 10);
  const changeSort = (next: "name" | DemandMetric) => { setAscending(sort === next ? !ascending : next === "name"); setSort(next); setPage(0); };
  const max = Math.max(1, ...rows.map((row) => row.metrics[metric] ?? 0));
  return <section><Card className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e10600] text-white"><UsersIcon className="size-4" /></span><h3 className="text-xl font-semibold leading-normal sm:text-2xl">{title}</h3></div>{!screenshotMode ? <Button data-report-export-exclude="true" variant="outline" className={`${action} md:hidden`} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show table" : "Ranked chart"}</Button> : null}</div>
    <p className="text-xs text-[#777]">Measured interest observations may overlap. Missing categories are unavailable.</p>
    {!rows.length ? <p>No measured {title} interest observations available.</p> : <div className={`grid min-w-0 gap-6 ${screenshotMode ? "grid-cols-1" : "md:grid-cols-2"}`}><div className={`${screenshotMode || chart ? "block" : "hidden"} min-w-0 space-y-3 md:order-2 md:block`}>{[...rows].sort((a, b) => (b.metrics[metric] ?? -1) - (a.metrics[metric] ?? -1)).map((row) => <div key={row.id}><div data-demand-chart-label-row="true" className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 text-sm"><span className="min-w-0 break-words">{row.name}</span><span className="whitespace-nowrap">{valueLabel(row.metrics[metric])}</span></div><div className="mt-2 h-3 rounded bg-gray-100"><div className="h-3 rounded bg-[#e10600]" style={{ width: `${(row.metrics[metric] ?? 0) / max * 100}%` }} /></div></div>)}</div><div className={`${screenshotMode || !chart ? "block" : "hidden"} min-w-0 space-y-4 md:order-1 md:block`}>
      <div data-report-full-width-table="true" className="overflow-x-auto rounded-xl border border-[#dedede]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fff1f2] text-[#9f0019]"><tr className="border-b"><th className="px-4 py-3"><Button variant="ghost" className="px-0 hover:bg-transparent text-[#9f0019]" onClick={() => changeSort("name")}>Audience {sort === "name" ? ascending ? "↑" : "↓" : ""}</Button></th>{columns.map((column) => <th key={column} className="px-4 text-right whitespace-nowrap"><Button variant="ghost" className="px-0 hover:bg-transparent text-[#9f0019]" onClick={() => changeSort(column)}>{labels[column]} {sort === column ? ascending ? "↑" : "↓" : ""}</Button></th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-b"><td className="px-4 py-4">{row.name}</td>{columns.map((column) => <td key={column} className="px-4 py-4 text-right font-medium tabular-nums">{valueLabel(row.metrics[column])}</td>)}</tr>)}</tbody></table></div>
      <div data-report-export-exclude="true" className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" className={action} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage + 1} of {pages}</span><Button variant="outline" className={action} disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </div></div>}
  </Card></section>;
}

function MatrixPanel({ cells, unmapped, totals, metric }: { cells: DemandCell[]; unmapped: DemandCell[]; totals?: import("@/lib/reporting/demand-gen").DemandValues; metric: DemandMetric }) {
  const { screenshotMode } = useScreenshotMode();
  const [chart, setChart] = useState(false);
  const overall = totals ?? sumDemandValues([...cells, ...unmapped].filter((cell) => cell.observed !== false && Object.values(cell.metrics).some((v) => v != null)).map((c) => c.metrics));
  const additive = ["views", "clicks", "spend", "conversions"].includes(metric);
  const display = (value: number | null | undefined) => {
    const percentage = demandShare(value, overall[metric]);
    return <span className="whitespace-nowrap">{additive ? <><span className="font-semibold text-[#9f0019]">{valueLabel(percentage)}{percentage == null ? "" : "%"}</span><span className="text-muted-foreground"> / </span></> : null}{valueLabel(value)}</span>;
  };
  const sum = (entries: DemandCell[]) => sumDemandValues(entries.filter((c) => c.observed !== false && Object.values(c.metrics).some((v) => v != null)).map((c) => c.metrics))[metric];
  const rows: { label: string; entries: DemandCell[] }[] = demandFormats.map((format) => ({ label: format, entries: cells.filter((c) => c.format === format) }));
  if (unmapped.length) rows.push({ label: "Other / unknown", entries: unmapped });
  const max = Math.max(1, ...cells.map((c) => c.metrics[metric] ?? 0));
  return <section><Card className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e10600] text-white"><LayoutGridIcon className="size-4" /></span><h3 className="text-xl font-semibold leading-normal sm:text-2xl">Ad format × Device</h3></div>{!screenshotMode ? <Button data-report-export-exclude="true" variant="outline" className={`${action} md:hidden`} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show matrix" : "Grouped chart"}</Button> : null}</div>
    <p className="text-xs text-[#777]">{additive ? "Percent / value. Percent = current value ÷ overall total × 100. " : "Totals use weighted calculations. "}Unavailable values are shown as —.</p>
    <div className="grid min-w-0 grid-cols-1 gap-6"><div className={`${screenshotMode || !chart ? "block" : "hidden"} min-w-0 overflow-x-auto rounded-xl border border-[#dedede] md:block`} data-report-full-width-table="true"><table className="w-full min-w-[950px] text-sm"><thead className="bg-[#fff1f2] text-[#9f0019]"><tr><th className="px-4 py-3 text-left">{labels[metric]}</th>{[...demandDevices, "Total"].map((d) => <th key={d} className="px-4 text-right">{d}</th>)}</tr></thead><tbody>{rows.map(({ label, entries }) => <tr key={label} className="border-t"><th className="px-4 py-4 text-left">{label}</th>{demandDevices.map((d) => <td key={d} className="px-4 py-4 text-right tabular-nums">{display(sum(entries.filter((c) => c.device === d)))}</td>)}<td className="px-4 py-4 text-right tabular-nums bg-red-50">{display(sum(entries))}</td></tr>)}<tr className="border-t bg-red-50 font-semibold"><th className="px-4 py-4 text-left">Overall total</th>{demandDevices.map((d) => <td key={d} className="px-4 py-4 text-right">{display(sum([...cells, ...unmapped].filter((c) => c.device === d)))}</td>)}<td className="px-4 py-4 text-right">{display(overall[metric])}</td></tr></tbody></table></div><div className={`${screenshotMode || chart ? "block" : "hidden"} min-w-0 space-y-4 md:block`}>{cells.map((c) => <div key={`${c.format}:${c.device}`}><div data-demand-chart-label-row="true" className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 text-sm"><span className="min-w-0 break-words">{c.format} · {c.device}</span><span className="whitespace-nowrap">{display(c.metrics[metric])}</span></div><div className="mt-2 h-3 rounded bg-gray-100"><div className="h-3 rounded bg-[#e10600]" style={{ width: `${(c.metrics[metric] ?? 0) / max * 100}%` }} /></div></div>)}</div></div>
    {unmapped.length ? <details open={screenshotMode || undefined}><summary>Unknown format/device references</summary>{unmapped.map((c) => <p key={`${c.format}:${c.device}`}>{c.format} × {c.device}: {valueLabel(c.metrics[metric])}</p>)}</details> : null}
  </Card></section>;
}

function DemandAdsPanel({ ads }: { ads: NonNullable<DemandGenPayload["ads"]> }) {
  return <Card className={panel}><h3 className="text-xl font-semibold">Ads</h3><div className="overflow-x-auto rounded-xl border" data-report-full-width-table="true"><table className="w-full min-w-[900px] text-sm"><thead className="bg-red-50 text-[#9f0019]"><tr>{["Ad", "Campaign", "Creative", "Clicks", "CTR (%)", "CPC", "Views"].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{ads.map((ad) => <tr key={ad.id} className="border-t"><td className="px-4 py-3">{ad.name}</td><td className="px-4 py-3">{ad.campaignName}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{ad.imageUrls.length ? ad.imageUrls.map((url) => <AdCreativeImage key={url} url={url} name={ad.name} />) : "—"}</div></td>{(["clicks", "ctr", "cpc", "views"] as const).map((metric) => <td key={metric} className="px-4 py-3 tabular-nums">{valueLabel(ad.metrics[metric])}</td>)}</tr>)}</tbody></table></div>{!ads.length ? <p>No ad creatives available for these campaigns.</p> : null}</Card>;
}
function AdCreativeImage({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span>—</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`${name} creative`} className="h-24 w-32 rounded-md object-contain" onError={() => setFailed(true)} />;
}
