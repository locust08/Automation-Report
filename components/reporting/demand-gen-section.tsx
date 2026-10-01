"use client";

import { AdvancedLoadingPanel } from "./advanced-loading-panel";
import { useState } from "react";
import { useReportSectionQuery } from "./use-report-data";
import { filterRowsByCampaignName, type CampaignNameFilter } from "@/lib/reporting/campaign-name-filter";
import { demandMetrics, demandDevices, demandFormats, type DemandMetric, type DemandAudienceRow, type DemandGenPayload, type DemandCell } from "@/lib/reporting/demand-gen";

const labels: Record<DemandMetric, string> = { impressions: "Impressions", clicks: "Clicks", spend: "Spend", conversions: "Conversions", ctr: "CTR (%)", cpc: "CPC", cpm: "CPM" };
const valueLabel = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const panel = "space-y-4 rounded-2xl border border-[#ddd] bg-white p-4 sm:p-6 text-[#333]";
const control = "rounded-lg border border-[#ddd] bg-white px-3 py-2 text-sm";

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
  return <section className="space-y-4" aria-label="Demand Gen analysis">
    <div className={panel}>
      <h2 className="text-2xl font-semibold">Demand Gen Analysis</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">Campaign<select className={control} value={campaignId ?? ""} onChange={(event) => setSelection(event.target.value)} disabled={!campaigns.length}>
          {!campaigns.length ? <option value="">No matching Demand Gen campaigns</option> : null}
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select></label>
        <label className="flex items-center gap-2 text-sm">Metric<select className={control} value={metric} onChange={(event) => setMetric(event.target.value as DemandMetric)}>{demandMetrics.map((key) => <option key={key} value={key}>{labels[key]}</option>)}</select></label>
      </div>
      {options.data ? <p className="text-xs text-[#777]">{options.data.account.name} · {options.data.account.id} · {options.data.account.currency} · {options.data.account.timezone} · {options.data.startDate} – {options.data.endDate}</p> : null}
      {options.loading || report.loading ? <AdvancedLoadingPanel title="Loading Demand Gen analysis" message="Retrieving campaign, audience, and format performance..." /> : null}
      {options.error || report.error ? <p role="alert">{options.error ?? report.error} <button className={control} onClick={options.error ? options.retry : report.retry}>Retry</button></p> : null}
      {options.data && !campaigns.length ? <p>No Demand Gen campaigns match this account and campaign filter.</p> : null}
      {data?.warnings.filter((warning) => !warning.startsWith("Notion resolved ") && !/^\d+ non-interest criteria excluded;/.test(warning)).map((warning) => <p key={warning} role="alert" className="text-sm text-amber-800">{warning}</p>)}
      {data && !data.complete ? <button className={control} onClick={report.retry}>Retry incomplete data</button> : null}
    </div>
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
  return <section className={panel}>
    <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">{title}</h3><button className={control} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show table" : "Ranked chart"}</button></div>
    <p className="text-xs text-[#777]">Measured interest observations may overlap. Missing categories are unavailable.</p>
    {!rows.length ? <p>No measured {title} interest observations available.</p> : chart ? <div className="space-y-3">{[...rows].sort((a, b) => (b.metrics[metric] ?? -1) - (a.metrics[metric] ?? -1)).map((row) => <div key={row.id}><div className="flex justify-between gap-4 text-sm"><span>{row.name}</span><span>{valueLabel(row.metrics[metric])}</span></div><div className="mt-1 h-3 rounded bg-gray-100"><div className="h-3 rounded bg-[#b71227]" style={{ width: `${(row.metrics[metric] ?? 0) / max * 100}%` }} /></div></div>)}</div> : <>
      <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b"><th className="py-2"><button onClick={() => changeSort("name")}>Audience {sort === "name" ? ascending ? "↑" : "↓" : ""}</button></th><th className="text-right"><button onClick={() => changeSort("value")}>{labels[metric]} {sort === "value" ? ascending ? "↑" : "↓" : ""}</button></th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-b"><td className="py-3 pr-4">{row.name}</td><td className="text-right tabular-nums">{valueLabel(row.metrics[metric])}</td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-end gap-3 text-sm"><button className={control} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages}</span><button className={control} disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </>}
  </section>;
}

function MatrixPanel({ cells, unmapped, metric }: { cells: DemandCell[]; unmapped: DemandCell[]; metric: DemandMetric }) {
  const [chart, setChart] = useState(false);
  const max = Math.max(1, ...cells.map((cell) => cell.metrics[metric] ?? 0));
  const colors = ["#b71227", "#db7787", "#64748b", "#c6b383"];
  return <section className={panel}><div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">Ad format × Device</h3><button className={control} aria-pressed={chart} onClick={() => setChart(!chart)}>{chart ? "Show matrix" : "Grouped chart"}</button></div>
    <p className="text-xs text-[#777]">Unavailable intersections are shown as —. {unmapped.length ? `${unmapped.length} unknown format/device groups are outside this matrix.` : ""}</p>
    {chart ? <div className="space-y-6">{demandFormats.map((format) => <div key={format}><h4 className="mb-2 font-medium">{format}</h4>{demandDevices.map((device, index) => { const value = cells.find((cell) => cell.format === format && cell.device === device)?.metrics[metric]; return <div key={device} className="my-2 grid grid-cols-[65px_1fr_70px] items-center gap-2 text-xs"><span>{device}</span><div className="h-4 rounded bg-gray-100"><div className="h-4 rounded" style={{ width: `${(value ?? 0) / max * 100}%`, backgroundColor: colors[index] }} /></div><span className="text-right">{valueLabel(value)}</span></div>; })}</div>)}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead><tr><th className="py-2 text-left">{labels[metric]}</th>{demandDevices.map((device) => <th key={device} className="text-right">{device}</th>)}</tr></thead><tbody>{demandFormats.map((format) => <tr key={format} className="border-t"><th className="py-4 text-left">{format}</th>{demandDevices.map((device) => <td key={device} className="text-right tabular-nums">{valueLabel(cells.find((cell) => cell.format === format && cell.device === device)?.metrics[metric])}</td>)}</tr>)}</tbody></table></div>}
    {unmapped.length ? <details><summary className="cursor-pointer text-sm">Unknown format/device references</summary>{unmapped.map((cell) => <p key={`${cell.format}:${cell.device}`} className="py-1 text-xs">{cell.format} × {cell.device}: {valueLabel(cell.metrics[metric])}</p>)}</details> : null}
  </section>;
}
