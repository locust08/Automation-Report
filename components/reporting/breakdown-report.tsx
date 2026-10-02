"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignNameFilterControl } from "./campaign-name-filter-control";
import { AdvancedLoadingPanel } from "./advanced-loading-panel";
import { useScreenshotMode } from "./use-screenshot-mode";
import { filterRowsByCampaignName, getCampaignNameOptions, type CampaignNameFilter } from "@/lib/reporting/campaign-name-filter";
import { levelTotals, matchesValueFilter, parseValueFilter, performanceValue, valueMetrics, type ValueFilter, type ValueMetric } from "@/lib/reporting/value-filter";
import type { CampaignGroup, CampaignRow, PreviewAdGroupNode, PreviewReportPayload, PreviewPerformanceSummary, PreviewAdNode } from "@/lib/reporting/types";

import { formatCpcRinggit } from "@/lib/reporting/format";

const tableMetrics = [...valueMetrics.slice(0, 4), "cpc", ...valueMetrics.slice(4)] as const;
type Stage = { rows: PreviewAdGroupNode[]; warnings: string[]; error?: string; complete: boolean };
const labels: Record<ValueMetric | "cpc", string> = { impressions: "Impressions", videoViews: "Views", clicks: "Clicks", ctr: "CTR (%)", cpc: "CPC", cpm: "CPM", results: "Results", costPerResult: "Cost/Results", spend: "Ads Spent" };
const cache = new Map<string, { data: Stage; expires: number }>();
const pending = new Map<string, Promise<Stage>>();

async function readStage(url: string, refresh = false): Promise<Stage> {
  const existing = cache.get(url);
  if (!refresh && existing && existing.expires > Date.now()) return structuredClone(existing.data);
  if (refresh) cache.delete(url);
  const load = pending.get(url) ?? fetch(refresh ? `${url}&refresh=${Date.now()}` : url, { cache: "no-store" }).then(async (response) => {
    const payload = await response.json() as PreviewReportPayload & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to retrieve hierarchy performance.");
    const rows = payload.sections.flatMap((section) => section.campaigns.flatMap((campaign) => campaign.children));
    const warnings = payload.warnings.filter((warning) => !warning.startsWith("Notion resolved "));
    const result = { rows, warnings, complete: warnings.length === 0 };
    if (result.complete) { cache.set(url, { data: result, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }); while (cache.size > 100) cache.delete(cache.keys().next().value!); }
    return result;
  }).finally(() => pending.delete(url));
  pending.set(url, load);
  return structuredClone(await load);
}

export function BreakdownReport({ groups, queryString, nameFilter, onNameFilter, onReady }: { groups: CampaignGroup[]; queryString: string; nameFilter: CampaignNameFilter | null; onNameFilter: (filter: CampaignNameFilter | null) => void; onReady: (ready: boolean) => void }) {
  const { screenshotMode } = useScreenshotMode();
  const params = useSearchParams(), router = useRouter();
  const initialFilter = parseValueFilter(params.get("valueFilter"));
  const [filter, setFilter] = useState<ValueFilter | null>(initialFilter);
  const [draft, setDraft] = useState<ValueFilter>(initialFilter ?? { metric: "spend", operator: "gt", value: 0, upper: 100 });
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const currentStages = useRef(stages); currentStages.current = stages;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [prepared, setPrepared] = useState(false);
  const campaigns = filterRowsByCampaignName(groups.flatMap((g) => g.rows), (c) => c.campaignName, nameFilter);
  const signature = campaigns.map((c) => c.id).join(",");
  const allRequired = Boolean(filter) || screenshotMode;
  const cancelled = useRef(false);
  useEffect(() => { cancelled.current = false; return () => { cancelled.current = true; }; }, []);

  async function load(campaign: CampaignRow, groupId?: string, refresh = false): Promise<Stage> {
    const key = groupId ? `g:${campaign.id}:${groupId}` : `c:${campaign.id}`;
    const saved = currentStages.current[key];
    if (saved?.complete && !refresh) return saved;
    const query = new URLSearchParams(queryString);
    query.set("platform", campaign.platform); query.set("performance", "1");
    if (campaign.resultActionType) query.set("resultActionType", campaign.resultActionType);
    if (groupId) query.set("campaignId", campaign.id);
    setLoading((state) => ({ ...state, [key]: true }));
    let result: Stage;
    try { result = await readStage(`/api/${groupId ? `ad-groups/${encodeURIComponent(groupId)}/ads` : `campaigns/${encodeURIComponent(campaign.id)}/ad-groups`}?${query}`, refresh); }
    catch (error) { result = { rows: saved?.rows ?? [], warnings: saved?.warnings ?? [], complete: false, error: error instanceof Error ? error.message : "Retrieval failed" }; }
    if (!cancelled.current) {
      currentStages.current = { ...currentStages.current, [key]: result };
      setStages(currentStages.current); setLoading((state) => ({ ...state, [key]: false }));
    }
    return result;
  }

  useEffect(() => {
    let obsolete = false;
    if (!allRequired) return;
    const prepare = async () => {
      setPrepared(false);
      for (let index = 0; index < campaigns.length; index++) {
        if (obsolete || cancelled.current) return;
        const campaign = campaigns[index];
        setProgress(`Campaign ${index + 1} of ${campaigns.length}: retrieving ad sets/groups and ads...`);
        const children = await load(campaign);
        for (const child of children.rows) {
          if (obsolete || cancelled.current) return;
          await load(campaign, child.id);
        }
      }
      if (!obsolete && !cancelled.current) { setProgress(null); setPrepared(true); }
    };
    void prepare();
    return () => { obsolete = true; };
    // Local presentation and progressive stage updates must not restart retrieval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRequired, signature, filter, queryString]);

  const errors = Object.values(stages).filter((stage) => !stage.complete);
  useEffect(() => { onReady(!screenshotMode || (prepared && errors.length === 0)); }, [screenshotMode, prepared, errors.length, onReady]);
  const apply = (next: ValueFilter | null) => {
    setFilter(next); setPrepared(false);
    const query = new URLSearchParams(params.toString());
    if (next) query.set("valueFilter", JSON.stringify(next)); else query.delete("valueFilter");
    router.replace(`/campaign-breakdown?${query}`, { scroll: false });
  };
  const status = (key: string, campaign: CampaignRow, groupId?: string) => {
    const stage = stages[key];
    return <>
      {loading[key] ? <p role="status" className="p-3 text-sm">Loading performance...</p> : null}
      {stage && !stage.complete ? <div className="m-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Incomplete coverage: {stage.error ?? stage.warnings.join(" · ")}</p><Button onClick={() => void load(campaign, groupId, true)} variant="outline" size="sm">Retry {groupId ? "ads" : "ad sets/groups"}</Button></div> : null}
      {stage?.complete && !stage.rows.length ? <p className="p-3 text-sm text-neutral-500">No {groupId ? "ads" : "ad sets/groups"} found.</p> : null}
    </>;
  };
  const childAds = (campaign: CampaignRow, child: PreviewAdGroupNode) => stages[`g:${campaign.id}:${child.id}`]?.rows.find((row) => row.id === child.id)?.ads ?? [];
  const matchingChildren = (campaign: CampaignRow) => (stages[`c:${campaign.id}`]?.rows ?? []).filter((child) => matchesValueFilter(child.performance, filter) || childAds(campaign, child).some((ad) => matchesValueFilter(ad.performance, filter)) || (filter && !stages[`g:${campaign.id}:${child.id}`]?.complete));
  const visibleCampaigns = campaigns.filter((campaign) => matchesValueFilter(campaign, filter) || matchingChildren(campaign).length || (filter && !stages[`c:${campaign.id}`]?.complete));
  const expanded = (key: string) => Boolean(allRequired || open[key]);
  const toggle = async (key: string, campaign: CampaignRow, groupId?: string) => { setOpen((state) => ({ ...state, [key]: !state[key] })); if (!open[key]) await load(campaign, groupId); };

  return <section className="space-y-5 rounded-[2rem] bg-[#e7e7e7] p-3 sm:p-6" data-export-error={screenshotMode && prepared && errors.length ? "Some branches could not be retrieved. Retry their data before downloading the PDF." : undefined}>
    <div className={screenshotMode ? "block w-full" : "flex flex-wrap items-center justify-between gap-3"}><h2 className="shrink-0 text-2xl font-semibold leading-normal">Campaign Breakdown</h2>{!screenshotMode ? <div data-report-export-exclude="true"><CampaignNameFilterControl campaignOptions={getCampaignNameOptions(groups.flatMap((g) => g.rows.map((c) => c.campaignName)))} filter={nameFilter} onChange={onNameFilter} /></div> : null}</div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4" data-report-export-exclude="true">
      <Select value={draft.metric} onValueChange={(metric) => setDraft({ ...draft, metric: metric as ValueMetric })}><SelectTrigger aria-label="Filter metric" className="w-44"><SelectValue /></SelectTrigger><SelectContent>{valueMetrics.map((metric) => <SelectItem key={metric} value={metric}>{labels[metric]}</SelectItem>)}</SelectContent></Select>
      <Select value={draft.operator} onValueChange={(operator) => setDraft({ ...draft, operator: operator as ValueFilter["operator"] })}><SelectTrigger aria-label="Filter comparison" className="w-44"><SelectValue /></SelectTrigger><SelectContent>{Object.entries({ gt: "Greater than", gte: "Greater or equal", lt: "Less than", lte: "Less or equal", eq: "Equal to", between: "Between", unavailable: "Unavailable" }).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      {draft.operator !== "unavailable" ? <Input className="w-32" type="number" aria-label="Filter value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} /> : null}
      {draft.operator === "between" ? <Input className="w-32" type="number" aria-label="Filter upper value" value={draft.upper} onChange={(e) => setDraft({ ...draft, upper: Number(e.target.value) })} /> : null}
      <Button disabled={!Number.isFinite(draft.value) || (draft.operator === "between" && (!Number.isFinite(draft.upper) || draft.upper < draft.value))} onClick={() => apply(draft)}>Apply value filter</Button><Button variant="outline" onClick={() => apply(null)}>Clear</Button>
    </div>
    {filter ? <p className="text-sm">Value filter: {labels[filter.metric]} {filter.operator} {filter.operator === "unavailable" ? "" : `${filter.value}${filter.operator === "between" ? `–${filter.upper}` : ""}`}. Ancestors of matching rows are retained for context.</p> : null}
    {progress ? <AdvancedLoadingPanel title={screenshotMode ? "Preparing PDF" : "Searching all branches"} message={progress} /> : null}
    {groups.map((group) => {
      const rows = visibleCampaigns.filter((campaign) => campaign.platform === group.platform && campaign.campaignType === group.campaignType);
      if (!rows.length) return null;
      return <div key={group.id} className="rounded-xl border bg-white"><h3 className="rounded-t-xl bg-[#f0adad] px-4 py-3 font-semibold">{group.platform === "meta" ? "Meta" : "TikTok"} · {group.campaignType}</h3>
        <PerformanceTable>{rows.map((campaign) => { const key = `c:${campaign.id}`; const children = matchingChildren(campaign); return <tbody key={campaign.id}>
          <MetricRow name={campaign.campaignName} row={campaign} toggle={() => void toggle(key, campaign)} open={expanded(key)} href={adsManagerLink(queryString, campaign.id)} />
          {expanded(key) ? <tr><td colSpan={11} className="bg-neutral-50 p-3">{status(key, campaign)}{children.length ? <div className="rounded-xl border bg-white"><h4 className="bg-red-50 px-4 py-3 font-semibold">{campaign.platform === "meta" ? "Ad Sets" : "Ad Groups"}</h4><PerformanceTable>{children.map((child) => { const gkey = `g:${campaign.id}:${child.id}`; const ads = childAds(campaign, child).filter((ad) => matchesValueFilter(ad.performance, filter)); return <tbody key={child.id}>
            <MetricRow name={child.name} row={child.performance} toggle={() => void toggle(gkey, campaign, child.id)} open={expanded(gkey)} href={adsManagerLink(queryString, campaign.id, child.id)} />
            {expanded(gkey) ? <tr><td colSpan={11} className="bg-neutral-50 p-3">{status(gkey, campaign, child.id)}{ads.length ? <div className="rounded-xl border bg-white"><h5 className="bg-red-50 px-4 py-3 font-semibold">Ads</h5><PerformanceTable creative><tbody>{ads.map((ad) => <MetricRow key={ad.id} name={ad.name} row={ad.performance} creative={ad} showCreative href={adsManagerLink(queryString, campaign.id, child.id, ad.id)} />)}<MetricRow showCreative name="Ads total" row={levelTotals(ads.map((ad) => ad.performance))} /></tbody></PerformanceTable></div> : null}</td></tr> : null}
          </tbody>; })}<tbody><MetricRow name="Ad sets/groups total" row={levelTotals(children.map((child) => child.performance))} /></tbody></PerformanceTable></div> : null}</td></tr> : null}
        </tbody>; })}<tbody><MetricRow name="Campaign total" row={levelTotals(rows)} /></tbody></PerformanceTable>
      </div>;
    })}
    {!visibleCampaigns.length && !progress ? <p>No rows match the selected filters.</p> : null}
  </section>;
}

function PerformanceTable({ children, creative = false }: { children: ReactNode; creative?: boolean }) {
  return <div role="region" aria-label="Performance table" className="max-w-full overflow-x-auto" data-report-full-width-table="true"><table className="w-full min-w-[1400px] table-fixed text-sm"><colgroup><col className="w-[360px]" />{creative ? <col className="w-[160px]" /> : null}{tableMetrics.map((metric) => <col key={metric} className="w-[120px]" />)}<col className="w-[100px]" /></colgroup><thead><tr className="border-b bg-neutral-50"><th className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 text-left">Name</th>{creative ? <th className="px-3 py-3 text-left">Creative</th> : null}{tableMetrics.map((metric) => <th className="px-3 py-3 text-right" key={metric} title={metric === "videoViews" ? "Meta: video plays (video_play_actions). TikTok: video starts (video_play_actions). Provider definitions differ." : undefined}>{labels[metric]}</th>)}<th className="px-3 py-3" data-report-export-exclude="true">Actions</th></tr></thead>{children}</table></div>;
}
function MetricRow({ name, row, toggle, open, href, creative, showCreative }: { name: string; row: CampaignRow | PreviewPerformanceSummary | null | undefined; toggle?: () => void; open?: boolean; href?: string; creative?: PreviewAdNode; showCreative?: boolean }) {
  return <tr data-pdf-summary-row={showCreative && !creative ? "true" : undefined} className="border-b"><td className="sticky left-0 z-10 bg-white px-4 py-4 text-left font-medium">{toggle ? <button className="flex items-start gap-2 text-left text-[#9f0019]" aria-label={`${open ? "Collapse" : "Expand"} ${name}`} aria-expanded={open} onClick={toggle}><span data-report-export-exclude="true">{open ? "⌄" : "›"}</span>{name}</button> : name}</td>{showCreative ? <td className="px-3 py-3"><CreativeImage ad={creative} /></td> : null}{tableMetrics.map((metric) => { const clicks = performanceValue(row, "clicks"), spend = performanceValue(row, "spend"); const value = metric === "cpc" ? (clicks != null && clicks > 0 && spend != null ? spend / clicks : null) : performanceValue(row, metric); return <td key={metric} className="px-3 py-4 text-right tabular-nums">{metric === "cpc" ? formatCpcRinggit(value) : value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>; })}<td className="px-3 py-4 text-center" data-report-export-exclude="true">{href ? <a className="text-[#9f0019] hover:underline" href={href} target="_blank" rel="noopener noreferrer">View ↗</a> : "—"}</td></tr>;
}
function CreativeImage({ ad }: { ad?: PreviewAdNode }) {
  const source = ad?.creative?.posterUrl || ad?.creative?.imageUrl || ad?.creative?.thumbnailUrl || ad?.images?.[0]?.url;
  const additional = [...new Set((ad?.images ?? []).map(image => image.url))].filter(url => url !== source);
  const extraSources = additional.map(url => <span key={url} hidden data-pdf-creative-source={url} data-pdf-creative-alt={`${ad?.name ?? "Ad"} creative`} />);
  const [failed, setFailed] = useState(false);
  if (!source || failed) return <><span data-pdf-creative-source={source} data-pdf-creative-alt={`${ad?.name ?? "Ad"} creative`} className="text-neutral-500">—</span>{extraSources}</>;
  // Provider creatives must retain their native URL; video ads use a poster image.
  // eslint-disable-next-line @next/next/no-img-element
  return <><img src={source} alt={`${ad?.name ?? "Ad"} creative`} className="h-24 w-32 rounded-md object-contain bg-neutral-50" onError={() => setFailed(true)} />{extraSources}</>;
}
function adsManagerLink(query: string, campaignId: string, groupId?: string, adId?: string) {
  const params = new URLSearchParams(query);
  if (params.get("platform") === "meta") {
    const accountId = (params.get("metaAccountId") || params.get("accountId") || "").replace(/^act_/, "");
    if (/^\d+$/.test(accountId)) {
      const target = new URLSearchParams({ act: accountId, selected_campaign_ids: campaignId });
      if (groupId) target.set("selected_adset_ids", groupId);
      if (adId) target.set("selected_ad_ids", adId);
      return `https://www.facebook.com/adsmanager/manage/${adId ? "ads" : groupId ? "adsets" : "campaigns"}?${target}`;
    }
  }
  if (params.get("platform") === "tiktok") {
    const accountId = params.get("tiktokAccountId") || params.get("accountId") || "";
    if (/^\d+$/.test(accountId)) {
      const target = new URLSearchParams({ aadvid: accountId, campaign_id: campaignId });
      if (groupId) target.set("adgroup_id", groupId);
      if (adId) target.set("ad_id", adId);
      return `https://ads.tiktok.com/i18n/perf/${adId ? "ad" : groupId ? "adgroup" : "campaign"}?${target}`;
    }
  }
  params.set("campaignId", campaignId); if (groupId) params.set("adGroupId", groupId); if (adId) params.set("adId", adId); return `/preview?${params}`;
}
