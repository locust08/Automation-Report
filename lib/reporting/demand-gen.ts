// Semantics ported from DigitalBee's structured-reporting/demand-gen collector.
import type { DemandCreative, SelectedDemandCreative } from "./demand-gen-creatives";
export const demandMetrics = ["impressions", "clicks", "spend", "conversions", "ctr", "cpc", "cpm"] as const;
export type DemandMetric = typeof demandMetrics[number];
export type DemandValues = Record<DemandMetric | "views", number | null>;
export function resolveDemandMetric(value: string | null): DemandMetric { return demandMetrics.includes(value as DemandMetric) ? value as DemandMetric : "impressions"; }
export type DemandNativeRow = {
  metrics?: Record<string, unknown>;
  segments?: { adFormatType?: string; device?: string };
  adGroupCriterion?: { type?: string; criterionId?: string; userInterest?: { userInterestCategory?: string } };
};
export interface DemandAudienceRow { id: string; name: string; metrics: DemandValues }
export const demandFormats = ["In-feed", "In-stream", "Shorts"] as const;
export const demandDevices = ["Desktop", "Mobile", "Tablet", "TV"] as const;
export interface DemandCell { observed?: boolean; format: string; device: string; metrics: DemandValues }
export interface DemandGenPayload {
  account: { id: string; name: string; currency: string; timezone: string };
  startDate: string; endDate: string;
  campaigns: { id: string; name: string }[];
  campaignId: string | null;
  campaignIds?: string[];
  totals?: DemandValues;
  ads?: { id: string; name: string; campaignName: string; imageUrls: string[]; metrics: DemandValues; adResource?: string; creatives?: DemandCreative[]; selectedCreative?: SelectedDemandCreative | null }[];
  creativeCoverageComplete?: boolean;
  inMarket: DemandAudienceRow[]; affinity: DemandAudienceRow[];
  cells: DemandCell[]; unmapped: DemandCell[];
  unresolved: DemandAudienceRow[];
  warnings: string[];
  complete: boolean;
}

export function aggregateDemandMetrics(rows: DemandNativeRow[]): DemandValues {
  const sum = (field: string) => {
    const values = rows.map((row) => row.metrics?.[field]);
    if (!rows.length || values.some((v) => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)))) return null;
    return values.reduce<number>((total, value) => total + Number(value), 0);
  };
  const impressions = sum("impressions"), clicks = sum("clicks"), conversions = sum("conversions"), micros = sum("costMicros");
  const spend = micros === null ? null : micros / 1e6;
  const ratio = (a: number | null, b: number | null, scale = 1) => a === null || b === null || b === 0 ? null : a / b * scale;
  return { impressions, views: sum("videoTrueviewViews"), clicks, conversions, spend, ctr: ratio(clicks, impressions, 100), cpc: ratio(spend, clicks), cpm: ratio(spend, impressions, 1000) };
}

export function buildDemandMatrix(rows: DemandNativeRow[]) {
  const formats: Record<string, string> = { INFEED: "In-feed", INSTREAM_SKIPPABLE: "In-stream", INSTREAM_NON_SKIPPABLE: "In-stream", BUMPER: "In-stream", SHORTS: "Shorts" };
  const devices: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobile", TABLET: "Tablet", CONNECTED_TV: "TV" };
  const groups = new Map<string, DemandNativeRow[]>();
  for (const row of rows) {
    const format = formats[row.segments?.adFormatType ?? ""] ?? row.segments?.adFormatType ?? "UNKNOWN";
    const device = devices[row.segments?.device ?? ""] ?? row.segments?.device ?? "UNKNOWN";
    const key = `${format}|${device}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const cells = demandFormats.flatMap((format) => demandDevices.map((device) => ({ format, device, observed: Boolean(groups.get(`${format}|${device}`)?.length), metrics: aggregateDemandMetrics(groups.get(`${format}|${device}`) ?? []) })));
  const unmapped = [...groups].filter(([key]) => !cells.some((cell) => key === `${cell.format}|${cell.device}`)).map(([key, data]) => ({ format: key.split("|")[0], device: key.split("|")[1], metrics: aggregateDemandMetrics(data) }));
  return { cells, unmapped };
}

export function buildDemandAudiences(rows: DemandNativeRow[], taxonomy: Map<string, { name: string; type: string }>) {
  const groups = new Map<string, DemandNativeRow[]>();
  let excluded = 0;
  for (const row of rows) {
    if (row.adGroupCriterion?.type !== "USER_INTEREST") { excluded++; continue; }
    const ref = row.adGroupCriterion.userInterest?.userInterestCategory ?? "UNKNOWN";
    groups.set(ref, [...(groups.get(ref) ?? []), row]);
  }
  const inMarket: DemandAudienceRow[] = [], affinity: DemandAudienceRow[] = [], unresolved: DemandAudienceRow[] = [];
  for (const [id, data] of groups) {
    const category = taxonomy.get(id);
    const target = category?.type === "IN_MARKET" ? inMarket : category?.type === "AFFINITY" ? affinity : unresolved;
    target.push({ id, name: category?.name ?? id, metrics: aggregateDemandMetrics(data) });
  }
  return { inMarket, affinity, unresolved, excluded };
}

// Keep repeated observations: identical rows can represent distinct criteria/pages.
export async function readDemandPages<T>(read: (token?: string) => Promise<{ results?: T[]; nextPageToken?: string }>) {
  const rows: T[] = [], tokens = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    let result;
    try { result = await read(token); } catch (error) {
      if (error && typeof error === "object" && "category" in error && ["permission", "oauth"].includes(String(error.category))) throw error;
      if (!rows.length) throw error;
      return { rows, complete: false, reason: "Later page failed; earlier observations retained. Retry to complete coverage." };
    }
    if (result.results !== undefined && !Array.isArray(result.results)) throw new Error("Invalid Google reporting payload.");
    if (result.results?.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Invalid Google reporting row.");
    rows.push(...(result.results ?? []));
    if (!result.nextPageToken) return { rows, complete: true, reason: null };
    if (tokens.has(result.nextPageToken)) break;
    token = result.nextPageToken;
    tokens.add(token);
  }
  return { rows, complete: false, reason: "Pagination limit or repeated continuation token; coverage is partial." };
}

export function sumDemandValues(values: DemandValues[]): DemandValues {
  return aggregateDemandMetrics(values.map((v) => ({ metrics: { impressions: v.impressions, videoTrueviewViews: v.views, clicks: v.clicks, costMicros: v.spend == null ? null : v.spend * 1e6, conversions: v.conversions } })));
}
export function demandShare(value: number | null | undefined, total: number | null | undefined): number | null {
  return value == null || total == null || total <= 0 ? null : value / total * 100;
}
