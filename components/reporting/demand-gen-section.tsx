"use client";

import { AdvancedLoadingPanel } from "./advanced-loading-panel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3Icon, UsersIcon, LayoutGridIcon } from "lucide-react";
import { useReportSectionQuery } from "./use-report-data";
import { filterRowsByCampaignName, type CampaignNameFilter } from "@/lib/reporting/campaign-name-filter";
import { demandMetrics, demandDevices, demandFormats, type DemandMetric, type DemandAudienceRow, type DemandGenPayload, type DemandCell } from "@/lib/reporting/demand-gen";

const labels: Record<DemandMetric, string> = { impressions: "Impressions", clicks: "Clicks", spend: "Spend", conversions: "Conversions", ctr: "CTR (%)", cpc: "CPC", cpm: "CPM" };
const valueLabel = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const panel = "gap-0 space-y-5 rounded-[1.5rem] border border-[#dedede] bg-white p-4 shadow-sm sm:p-6 text-[#111]";
const action = "border-red-200 bg-white text-[#9f0019] hover:bg-red-50 hover:text-[#9f0019]";

export function DemandGenSection({ queryString, campaignNameFilter }: { queryString: string; campaignNameFilter: CampaignNameFilter | null }) {
  // Scope replacement unmounts presentation state and pending old-scope requests.
  return <DemandGenScope key={queryString} queryString={queryString} campaignNameFilter={campaignNameFilter} />;
}

function DemandGenScope({ queryString, campaignNameFilter }: { queryString: string; campaignNameFilter: CampaignNameFilter | null }) {
  const options = useReportSectionQuery<DemandGenPayload>("/api/reporting/demand-gen", queryString, true, "Unable to list Demand Gen campaigns.");
  const campaigns = filterRowsByCampaignName(options.data?.campaigns ?? [], (campaign) => campaign.name, campaignNameFilter);
  const [selection, setSelection] = useState<string | null>(null);
  const campaignId = campaigns.some((campaign) => campaign.id === selection) ? selection : campaigns[0]?.id ?? null;
  const [metric, setMetric] = useState<DemandMetric>("impressions");
  const params = new URLSearchParams(queryString);
  if (campaignId) params.set("campaignId", campaignId);
  const report = useReportSectionQuery<DemandGenPayload>("/api/reporting/demand-gen", params.toString(), Boolean(campaignId), "Unable to load Demand Gen analysis.");
  const data = report.data;
  return <section className="space-y-5 rounded-[2rem] bg-[#e7e7e7] p-3 shadow-sm sm:p-6" aria-label="Demand Gen analysis">
    <Card className={panel}>
      <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e10600] text-white"><BarChart3Icon className="size-5" /></span><h2 className="text-2xl font-semibold sm:text-3xl">Demand Gen Analysis</h2></div>
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-0 w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center"><span id="demand-campaign-label">Campaign</span><Select value={campaignId ?? ""} onValueChange={setSelection} disabled={!campaigns.length}>
          <SelectTrigger aria-labelledby="demand-campaign-label" className="w-full min-w-0 bg-white sm:w-[420px]"><SelectValue placeholder="No matching Demand Gen campaigns" /></SelectTrigger>
          <SelectContent>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent>
        </Select></div>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center"><span id="demand-metric-label">Metric</span><Select value={metric} onValueChange={(value) => setMetric(value as DemandMetric)}><SelectTrigger aria-labelledby="demand-metric-label" className="w-[160px] bg-white"><SelectValue /></SelectTrigger><SelectContent>{demandMetrics.map((key) => <SelectItem key={key} value={key}>{labels[key]}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {options.data ? <p className="text-xs text-[#777]">{options.data.account.name} · {options.data.account.id} · {options.data.account.currency} · {options.data.account.timezone} · {options.data.startDate} – {options.data.endDate}</p> : null}
      {options.loading || report.loading ? <AdvancedLoadingPanel title="Loading Demand Gen analysis" message="Retrieving campaign, audience, and format performance..." /> : null}
      {options.error || report.error ? <p role="alert">{options.error ?? report.error} <Button variant="outline" className={action} onClick={options.error ? options.retry : report.retry}>Retry</Button></p> : null}
      {options.data && !campaigns.length ? <p>No Demand Gen campaigns match this account and campaign filter.</p> : null}
      {data?.warnings.filter((warning) => !warning.startsWith("Notion resolved ") && !/^\d+ non-interest criteria excluded;/.test(warning)).map((warning) => <p key={warning} role="alert" className="text-sm text-amber-800">{warning}</p>)}
      {data && !data.complete ? <Button variant="outline" className={action} onClick={report.retry}>Retry incomplete data</Button> : null}
    </Card>
    {data ? <div key={campaignId} className="space-y-4">
      <AudiencePanel title="In-market" rows={data.inMarket} metric={metric} />
      <AudiencePanel title="Affinity" rows={data.affinity} metric={metric} />
      <MatrixPanel cells={data.cells} unmapped={data.unmapped} metric={metric} />

    </div> : null}
  </section>;
}

function AudiencePanel({ title, rows, metric }: { title: string; rows: DemandAudienceRow[]; metric: DemandMetric }) {
  const [chart, setChart] = useState(false);
  const [sort, setSort] = useState<"name" | "value">("value");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return (ascending ? 1 : -1) * a.name.localeCompare(b.name);
    const av = a.metrics[metric], bv = b.metrics[metric];
    if (av == null) return bv == null ? a.name.localeCompare(b.name) : 1;
    if (bv == null) return -1;
    return (ascending ? 1 : -1) * (av - bv) || a.name.localeCompare(b.name);
  });
  const pages = Math.max(1, Math.ceil(rows.length / 10)), currentPage = Math.min(page, pages - 1);
  const visible = sorted.slice(currentPage * 10, currentPage * 10 + 10);
  const changeSort = (next: "name" | "value") => { setAscending(sort === next ? !ascending : next === "name"); setSort(next); setPage(0); };
  const max = Math.max(1, ...rows.map((row) => row.metrics[metric] ?? 0));
  return <section><Card className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e10600] text-white"><UsersIcon className="size-4" /></span><h3 className="text-xl font-semibold sm:text-2xl">{title}</h3></div><Button variant="outline" className={action} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show table" : "Ranked chart"}</Button></div>
    <p className="text-xs text-[#777]">Measured interest observations may overlap. Missing categories are unavailable.</p>
    {!rows.length ? <p>No measured {title} interest observations available.</p> : chart ? <div className="space-y-3">{[...rows].sort((a, b) => (b.metrics[metric] ?? -1) - (a.metrics[metric] ?? -1)).map((row) => <div key={row.id}><div className="flex justify-between gap-4 text-sm"><span>{row.name}</span><span>{valueLabel(row.metrics[metric])}</span></div><div className="mt-1 h-3 rounded bg-gray-100"><div className="h-3 rounded bg-[#e10600]" style={{ width: `${(row.metrics[metric] ?? 0) / max * 100}%` }} /></div></div>)}</div> : <>
      <div className="overflow-x-auto rounded-xl border border-[#dedede]"><table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-[#fff1f2] text-[#9f0019]"><tr className="border-b"><th className="px-4 py-3"><Button variant="ghost" className="px-0 hover:bg-transparent text-[#9f0019]" onClick={() => changeSort("name")}>Audience {sort === "name" ? ascending ? "↑" : "↓" : ""}</Button></th><th className="px-4 text-right"><Button variant="ghost" className="px-0 hover:bg-transparent text-[#9f0019]" onClick={() => changeSort("value")}>{labels[metric]} {sort === "value" ? ascending ? "↑" : "↓" : ""}</Button></th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-b"><td className="px-4 py-4">{row.name}</td><td className="px-4 py-4 text-right font-medium tabular-nums">{valueLabel(row.metrics[metric])}</td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" className={action} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage + 1} of {pages}</span><Button variant="outline" className={action} disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </>}
  </Card></section>;
}

function MatrixPanel({ cells, unmapped, metric }: { cells: DemandCell[]; unmapped: DemandCell[]; metric: DemandMetric }) {
  const [chart, setChart] = useState(false);
  const max = Math.max(1, ...cells.map((cell) => cell.metrics[metric] ?? 0));
  const colors = ["#e10600", "#9f0019", "#db7787", "#555555"];
  return <section><Card className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e10600] text-white"><LayoutGridIcon className="size-4" /></span><h3 className="text-xl font-semibold sm:text-2xl">Ad format × Device</h3></div><Button variant="outline" className={action} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show matrix" : "Grouped chart"}</Button></div>
    <p className="text-xs text-[#777]">Unavailable intersections are shown as —. {unmapped.length ? `${unmapped.length} unknown format/device groups are outside this matrix.` : ""}</p>
    {chart ? <div className="space-y-6">{demandFormats.map((format) => <div key={format}><h4 className="mb-2 font-medium">{format}</h4>{demandDevices.map((device, index) => { const value = cells.find((cell) => cell.format === format && cell.device === device)?.metrics[metric]; return <div key={device} className="my-2 grid grid-cols-[65px_1fr_70px] items-center gap-2 text-xs"><span>{device}</span><div className="h-4 rounded bg-gray-100"><div className="h-4 rounded" style={{ width: `${(value ?? 0) / max * 100}%`, backgroundColor: colors[index] }} /></div><span className="px-4 text-right">{valueLabel(value)}</span></div>; })}</div>)}</div> : <div className="overflow-x-auto rounded-xl border border-[#dedede]"><table className="w-full min-w-[550px] text-sm"><thead className="bg-[#fff1f2] text-[#9f0019]"><tr><th className="px-4 py-3 text-left">{labels[metric]}</th>{demandDevices.map((device) => <th key={device} className="px-4 text-right">{device}</th>)}</tr></thead><tbody>{demandFormats.map((format) => <tr key={format} className="border-t"><th className="px-4 py-4 text-left">{format}</th>{demandDevices.map((device) => <td key={device} className="px-4 py-4 text-right font-medium tabular-nums">{valueLabel(cells.find((cell) => cell.format === format && cell.device === device)?.metrics[metric])}</td>)}</tr>)}</tbody></table></div>}
    {unmapped.length ? <details><summary className="cursor-pointer text-sm">Unknown format/device references</summary>{unmapped.map((cell) => <p key={`${cell.format}:${cell.device}`} className="py-1 text-xs">{cell.format} × {cell.device}: {valueLabel(cell.metrics[metric])}</p>)}</details> : null}
  </Card></section>;
}
