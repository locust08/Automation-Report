"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  LightbulbIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";

import { ReportDownloadButton } from "@/components/reporting/screenshot-mode-toggle";
import { ReportShell } from "@/components/reporting/report-shell";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
  ReportWarnings,
} from "@/components/reporting/report-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AdvancedKeywordMetric,
  AdvancedMonthlyPoint,
  AdvancedReportJobResponse,
  AdvancedReportPayload,
  AdvancedSocialCalendarItem,
} from "@/lib/reporting/advanced-types";

const COUNTRIES = [
  { value: "MY", label: "🇲🇾 MY" },
  { value: "SG", label: "🇸🇬 SG" },
  { value: "AU", label: "🇦🇺 AU" },
  { value: "US", label: "🇺🇸 US" },
];

interface ApiDebugRecord {
  method: "GET" | "POST";
  url: string;
  requestBody?: Record<string, unknown>;
  status: number;
  ok: boolean;
  response: unknown;
  recordedAt: string;
}

interface AdvancedPageClientProps {
  initialAccountId?: string;
  initialCountry?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}

export function AdvancedPageClient({
  initialAccountId,
  initialCountry,
  initialStartDate,
  initialEndDate,
}: AdvancedPageClientProps) {
  const router = useRouter();
  const { screenshotMode } = useScreenshotMode();
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (initialAccountId) params.set("accountId", initialAccountId);
    if (initialCountry) params.set("country", initialCountry);
    if (initialStartDate) params.set("startDate", initialStartDate);
    if (initialEndDate) params.set("endDate", initialEndDate);
    return params.toString();
  }, [initialAccountId, initialCountry, initialStartDate, initialEndDate]);

  const [payload, setPayload] = useState<AdvancedReportPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(initialAccountId));
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiDebugRecords, setApiDebugRecords] = useState<ApiDebugRecord[]>([]);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [switchAccountId, setSwitchAccountId] = useState(initialAccountId ?? "");
  const [switchCountry, setSwitchCountry] = useState(initialCountry ?? "MY");

  const loadReport = useCallback(
    async (options?: { regenerate?: boolean }) => {
      if (!initialAccountId) {
        setLoading(false);
        return;
      }

      const shouldRegenerate = Boolean(options?.regenerate);
      setError(null);
      setApiDebugRecords([]);
      setLoading(!shouldRegenerate);
      setRegenerating(shouldRegenerate);

      try {
        const record = (entry: ApiDebugRecord) => {
          setApiDebugRecords((current) => [...current, entry]);
        };
        const cached = shouldRegenerate
          ? null
          : await requestAdvancedApi("GET", `/api/reporting/advanced?${queryString}`, undefined, record);

        if (cached?.ok) {
          const cachedData = cached.data as AdvancedReportJobResponse;
          if (cachedData.status === "ready" && cachedData.payload) {
            setPayload(cachedData.payload);
            return;
          }
        }

        const generatedBody = {
          accountId: initialAccountId,
          country: initialCountry ?? "MY",
          startDate: initialStartDate,
          endDate: initialEndDate,
          regenerate: shouldRegenerate,
        };
        const generated = await requestAdvancedApi(
          "POST",
          `/api/reporting/advanced${shouldRegenerate ? "?regenerate=1" : ""}`,
          generatedBody,
          record
        );
        const generatedData = generated.data as AdvancedReportJobResponse;
        if (!generated.ok || generatedData.status === "error") {
          throw new Error(generatedData.message ?? "Unable to start advanced report generation.");
        }
        if (generatedData.status === "ready" && generatedData.payload) {
          setPayload(generatedData.payload);
          return;
        }
        setPayload(await pollAdvancedReport(queryString, record));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to generate advanced report.");
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [initialAccountId, initialCountry, initialEndDate, initialStartDate, queryString]
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const title = payload
    ? `${payload.metadata.companyName} Advanced Report`
    : "Advanced Report";
  const dateLabel = payload?.metadata.dateRange.currentLabel ?? "Last month";
  const diagnosticsPayload = buildTroubleshootingPayload(payload, error, apiDebugRecords);

  function handleSwitchAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (switchAccountId.trim()) {
      params.set("accountId", switchAccountId.trim());
    }
    params.set("country", switchCountry);
    router.push(`/advanced?${params.toString()}`);
  }

  return (
    <ReportShell
      title={title}
      dateLabel={dateLabel}
      activeQuery={queryString}
      headerBottomControl={
        initialAccountId ? (
          <div className="space-y-3">
            <form onSubmit={handleSwitchAccount} className="grid gap-3 rounded-2xl bg-white/15 p-3 sm:grid-cols-[1fr_130px_auto]">
              <Input
                value={switchAccountId}
                onChange={(event) => setSwitchAccountId(event.target.value)}
                placeholder="Enter another account ID"
                className="h-11 border-white/30 bg-white/20 text-white placeholder:text-white/70"
              />
              <Select value={switchCountry} onValueChange={setSwitchCountry}>
                <SelectTrigger className="h-11 border-white/30 bg-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" className="h-11 bg-white text-[#9f0019] hover:bg-white/90">
                Switch Account
              </Button>
            </form>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-medium text-white">
                {payload ? `${payload.metadata.country.emoji} ${payload.metadata.country.label} market analysis` : "Advanced report"}
                {payload ? (payload.metadata.cached ? " · loaded from cache" : " · freshly generated") : ""}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="h-11 bg-white text-[#9f0019] hover:bg-white/90"
                disabled={regenerating}
                onClick={() => void loadReport({ regenerate: true })}
              >
                <RefreshCwIcon className={regenerating ? "animate-spin" : ""} />
                {regenerating ? "Regenerating" : "Regenerate Report"}
              </Button>
              <ReportDownloadButton fileNamePrefix={title} />
              </div>
            </div>
          </div>
        ) : null
      }
    >
      {!initialAccountId ? (
        <ReportErrorState
          kind="insights"
          message="Enter an Ad Account ID on the home page before opening the advanced report."
        />
      ) : null}

      {loading ? (
        <ReportLoadingState
          kind="insights"
          message="Generating advanced market, competitor, keyword, and content planning sections..."
          fullPage
        />
      ) : null}

      {error ? (
        <div className="space-y-3">
          <ReportErrorState kind="insights" message={error} onRetry={() => void loadReport()} />
          <Button type="button" variant="outline" onClick={() => setDebugModalOpen(true)}>
            See troubleshooting details
          </Button>
        </div>
      ) : null}

      {payload ? (
        <AdvancedReportContent
          payload={payload}
          regenerating={regenerating}
          screenshotMode={screenshotMode}
        />
      ) : null}
      {debugModalOpen ? (
        <TroubleshootingModal payload={diagnosticsPayload} onClose={() => setDebugModalOpen(false)} />
      ) : null}
    </ReportShell>
  );
}

async function requestAdvancedApi(
  method: "GET" | "POST",
  url: string,
  body: Record<string, unknown> | undefined,
  onDebug: (entry: ApiDebugRecord) => void
): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({ message: "Response was not valid JSON." }))) as unknown;
  onDebug({
    method,
    url,
    requestBody: body,
    status: response.status,
    ok: response.ok,
    response: data,
    recordedAt: new Date().toISOString(),
  });
  return { ok: response.ok, data };
}

async function pollAdvancedReport(
  queryString: string,
  onDebug: (entry: ApiDebugRecord) => void
): Promise<AdvancedReportPayload> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 300_000) {
    await sleep(2_500);
    const result = await requestAdvancedApi("GET", `/api/reporting/advanced?${queryString}`, undefined, onDebug);
    const data = result.data as AdvancedReportJobResponse;
    if (result.ok && data.status === "ready" && data.payload) {
      return data.payload;
    }
    if (!result.ok || data.status === "error") {
      throw new Error(data.message ?? "Advanced report generation failed.");
    }
  }

  throw new Error("Advanced report generation is taking longer than expected. Please try again shortly.");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function buildTroubleshootingPayload(
  payload: AdvancedReportPayload | null,
  error: string | null,
  apiDebugRecords: ApiDebugRecord[]
) {
  return {
    summary: error
      ? "The advanced report API returned an error or generation timed out."
      : "Advanced report API request and generation details.",
    currentError: error,
    request: payload?.diagnostics?.request ?? null,
    processFlow: payload?.diagnostics?.processFlow ?? [],
    warnings: payload?.warnings ?? [],
    sectionStatuses: payload?.sectionStatuses ?? null,
    openAi: payload?.diagnostics?.openAi ?? null,
    dataForSeo: payload?.diagnostics?.dataForSeo ?? null,
    googleAds: payload?.diagnostics?.googleAds ?? null,
    apiCalls: apiDebugRecords,
  };
}

function TroubleshootingModal({ payload, onClose }: { payload: unknown; onClose: () => void }) {
  const text = JSON.stringify(payload, null, 2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#333]">Advanced Report Troubleshooting</h2>
            <p className="text-sm text-[#777]">
              Shows what was sent, what came back, and which generation step produced data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(text)}>
              <CopyIcon className="size-4" />
              Copy
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="max-h-[72vh] overflow-auto p-5">
          <pre className="whitespace-pre-wrap rounded-xl bg-[#111827] p-4 text-xs leading-relaxed text-white">
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}

function AdvancedReportContent({
  payload,
  regenerating,
  screenshotMode,
}: {
  payload: AdvancedReportPayload;
  regenerating: boolean;
  screenshotMode: boolean;
}) {
  const cpcLabel = getCpcLabel(payload.metadata.country.code);
  const marketShareRows = (payload.competitors.marketPlayerShares ?? payload.competitors.demandShare)
    .map((item) => {
      const intent =
        "type" in item && (item.type === "client" || item.type === "competitor")
          ? item.type
          : undefined;

      return {
        label: item.label,
        value: item.value,
        intent,
      };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div
      className="space-y-5"
      data-advanced-report-content="true"
      data-advanced-report-ready="true"
    >
      <ReportWarnings warnings={payload.warnings} />

      {regenerating ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#9f0019]">
          This regeneration may refresh source data and overwrite the cached report output for this
          account, country, and reporting period after it completes.
        </div>
      ) : null}

      <SectionCard
        eyebrow="1"
        title="What Changed in the Market"
        icon={<BarChart3Icon className="size-5" />}
        status={payload.sectionStatuses.market.status}
        message={payload.sectionStatuses.market.message}
      >
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.8fr]">
          <ChartPanel
            title="Overall Market Search Volume Trend"
            action={<KeywordDetailsButton label="See All" title="Keywords Used for Overall Market Trend" rows={payload.market.trendKeywords ?? []} cpcLabel={cpcLabel} />}
          >
            <LineChart
              points={[
                ...payload.market.searchVolumeTrend.points,
                ...payload.market.searchVolumeTrend.forecast,
              ]}
            />
          </ChartPanel>
          <ChartPanel
            title="Language Share"
            action={<LanguageDetailsButton rows={payload.market.languageBreakdown.keywordDetails ?? { English: [], Malay: [], Chinese: [] }} cpcLabel={cpcLabel} />}
          >
            <PieChart
              rows={payload.market.languageBreakdown.share.map((item) => ({
                label: item.language,
                value: item.value,
              }))}
            />
          </ChartPanel>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <KeywordList
            title="Top Keywords by Search Volume"
            rows={payload.market.topKeywords}
            action={<KeywordDetailsButton label="See All" title="All DataForSEO Keywords" rows={payload.market.allKeywords ?? payload.market.topKeywords} cpcLabel={cpcLabel} />}
            variant="bar"
          />
          <KeywordList
            title="Unused High-Volume Keywords"
            rows={payload.market.unusedHighVolumeKeywords}
            action={<KeywordDetailsButton label="See All" title="Unused High-Volume Keywords" rows={payload.market.unusedHighVolumeKeywords} cpcLabel={cpcLabel} />}
            emptyMessage="Google Ads account not provided, or no unused high-volume terms found."
            highlightUnused
            variant="bar"
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="2"
        title="What Competitors Are Doing"
        icon={<UsersIcon className="size-5" />}
        status={payload.sectionStatuses.competitors.status}
        message={payload.sectionStatuses.competitors.message}
      >
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.8fr]">
          <ChartPanel
            title="Competitor Search Demand"
            action={<KeywordDetailsButton label="See All" title="Competitor Keywords Used for Trend" rows={payload.competitors.competitorKeywordDetails ?? []} cpcLabel={cpcLabel} />}
          >
            <LineChart points={payload.competitors.competitorDemandTrend} />
          </ChartPanel>
          <ChartPanel title="Share of Market">
            <PieChart rows={marketShareRows} />
            {payload.competitors.clientSharePercent !== null ? (
              <p className="mt-3 text-sm font-semibold text-[#9f0019]">
                Client share: {payload.competitors.clientSharePercent.toFixed(1)}%
              </p>
            ) : null}
          </ChartPanel>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="3"
        title="What Customers Are Searching or Asking"
        icon={<SearchIcon className="size-5" />}
        status={payload.sectionStatuses.customers.status}
        message={payload.sectionStatuses.customers.message}
      >
        <ChartPanel title="Top Customer Search Terms">
          <HorizontalBarChart
            rows={payload.customers.topSearchTerms.map((item) => ({
              label: item.keyword,
              value: item.searchVolume,
            }))}
          />
        </ChartPanel>
      </SectionCard>

      <SectionCard
        eyebrow="4"
        title="Where the Client Is Losing Opportunities"
        icon={<LightbulbIcon className="size-5" />}
        status={payload.sectionStatuses.opportunities.status}
        message={payload.sectionStatuses.opportunities.message}
      >
        <div className="grid gap-4">
          <OpportunityList title="Product, Offer, and Requirement Gaps" rows={payload.opportunities.keywordGaps} />
          <RisingKeywordList rows={payload.opportunities.risingKeywords} />
          <SeasonalList rows={payload.opportunities.seasonalOpportunities} />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="5"
        title="What We Should Test Next: Social Media Marketing"
        icon={<SparklesIcon className="size-5" />}
        status={payload.sectionStatuses.socialCalendar.status}
        message={payload.sectionStatuses.socialCalendar.message}
      >
        <SocialCalendar payload={payload} screenshotMode={screenshotMode} />
      </SectionCard>

      <SectionCard
        eyebrow="6"
        title="What Decisions We Need from the Client"
        icon={<FileTextIcon className="size-5" />}
        status={payload.sectionStatuses.decisions.status}
        message={payload.sectionStatuses.decisions.message}
      >
        <DecisionTable payload={payload} />
      </SectionCard>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  icon,
  status,
  message,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  status: string;
  message: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-[2rem] bg-[#e8e8e8] p-4 shadow-sm sm:p-6"
      data-advanced-report-section="true"
      data-report-export-section="true"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e10600] text-sm font-bold text-white">
          {eyebrow}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[#9f0019]">
            {icon}
            <h2 className="text-2xl font-semibold leading-tight text-[#333] sm:text-4xl">{title}</h2>
          </div>
          {status === "empty" && message ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-[#666]">
              <AlertTriangleIcon className="size-4 text-amber-600" />
              {message}
            </p>
          ) : null}
        </div>
      </div>
      {status === "empty" && !children ? <ReportEmptyState title="No data" message={message ?? "No data found."} /> : children}
    </section>
  );
}

function ChartPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#d8d8d8] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[#333]">{title}</h3>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function LineChart({ points }: { points: AdvancedMonthlyPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const rows = points.filter((point) => Number.isFinite(point.value));
  if (!rows.length) {
    return <p className="text-sm text-[#777]">No trend data available.</p>;
  }
  const max = Math.max(...rows.map((point) => point.value), 1);
  const min = Math.min(...rows.map((point) => point.value));
  const range = Math.max(1, max - min);
  const width = 720;
  const height = 250;
  const paddingX = 28;
  const paddingTop = 30;
  const paddingBottom = 44;
  const chartWidth = width - paddingX * 2;
  const availableHeight = height - paddingTop - paddingBottom;
  const chartHeight = availableHeight * 0.8;
  const chartTop = paddingTop + availableHeight * 0.1;
  const chartPoints = rows.map((point, index) => {
    const x = rows.length === 1 ? width / 2 : paddingX + (index / (rows.length - 1)) * chartWidth;
    const y = chartTop + chartHeight - ((point.value - min) / range) * chartHeight;
    return { ...point, x, y };
  });
  const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const hovered = hoveredIndex === null ? null : chartPoints[hoveredIndex] ?? null;
  const first = chartPoints[0];
  const tooltipHeight = 120;
  const tooltipY = hovered ? Math.min(height - tooltipHeight - 6, Math.max(6, hovered.y - 72)) : 0;

  return (
    <div className="overflow-visible">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-72 w-full overflow-visible"
        role="img"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={paddingX}
            x2={width - paddingX}
            y1={chartTop + ratio * chartHeight}
            y2={chartTop + ratio * chartHeight}
            stroke="#e6e6e6"
            strokeDasharray="6 6"
          />
        ))}
        <polyline fill="none" stroke="#e10600" strokeWidth="5" points={polyline} strokeLinecap="round" />
        {hovered ? (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={chartTop}
            y2={chartTop + chartHeight}
            stroke="#475569"
            strokeDasharray="5 5"
          />
        ) : null}
        {chartPoints.map((point, index) => (
          <rect
            key={`${point.month}-hit`}
            x={index === 0 ? 0 : (chartPoints[index - 1].x + point.x) / 2}
            y="0"
            width={
              index === chartPoints.length - 1
                ? width - ((chartPoints[index - 1]?.x ?? 0) + point.x) / 2
                : (chartPoints[index + 1].x + point.x) / 2 - (index === 0 ? 0 : (chartPoints[index - 1].x + point.x) / 2)
            }
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseMove={() => setHoveredIndex(index)}
          />
        ))}
        {chartPoints.map((point, index) =>
          index === 0 || index === chartPoints.length - 1 ? (
            <g key={`${point.month}-${point.value}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#e10600" />
              <text
                x={index === 0 ? point.x + 8 : point.x - 8}
                y={point.y - 12}
                textAnchor={index === 0 ? "start" : "end"}
                className="fill-[#333] text-[16px] font-semibold"
              >
                {formatCompact(point.value)}
              </text>
            </g>
          ) : (
            <circle key={`${point.month}-${point.value}`} cx={point.x} cy={point.y} r="4" fill="#e10600" />
          )
        )}
        {chartPoints.map((point, index) =>
          index % Math.ceil(chartPoints.length / 5) === 0 || index === chartPoints.length - 1 ? (
            <text key={`${point.month}-label`} x={point.x} y={height - 10} textAnchor="middle" className="fill-[#666] text-[13px]">
              {point.month}
            </text>
          ) : null
        )}
        {hovered ? (
          <foreignObject
            x={Math.min(width - 220, Math.max(12, hovered.x + 10))}
            y={tooltipY}
            width="210"
            height={tooltipHeight}
            pointerEvents="none"
          >
            <div className="rounded-xl bg-[#111827] p-2 text-xs leading-relaxed text-white shadow-xl">
              <div className="font-semibold">{hovered.month}</div>
              <div>Search volume: {formatNumber(hovered.value)}</div>
              <div>MoM: {formatPercentChange(chartPoints[hoveredIndex ?? 0]?.value, chartPoints[(hoveredIndex ?? 0) - 1]?.value)}</div>
              <div>From first: {formatPercentChange(hovered.value, first?.value)}</div>
            </div>
          </foreignObject>
        ) : null}
      </svg>
    </div>
  );
}

function PieChart({
  rows,
}: {
  rows: Array<{ label: string; value: number; intent?: "client" | "competitor" }>;
}) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) {
    return <p className="text-sm text-[#777]">No share data available.</p>;
  }
  const colors = ["#e10600", "#9f0019", "#c2410c", "#f97316", "#be123c", "#7f1d1d", "#fb7185", "#64748b", "#f59e0b", "#b45309"];
  const slices = rows.reduce<{
    cumulative: number;
    items: Array<(typeof rows)[number] & { color: string; path: string; percent: number }>;
  }>(
    (accumulator, row, index) => {
      const start = accumulator.cumulative / total;
      const nextCumulative = accumulator.cumulative + row.value;
      const end = nextCumulative / total;
      return {
        cumulative: nextCumulative,
        items: [
          ...accumulator.items,
          {
            ...row,
            color:
              row.intent === "client"
                ? "#e10600"
                : row.intent === "competitor"
                  ? colors[(index % (colors.length - 1)) + 1]
                  : colors[index % colors.length],
            path: describeArc(80, 80, 52, start * 360, end * 360),
            percent: (row.value / total) * 100,
          },
        ],
      };
    },
    { cumulative: 0, items: [] }
  ).items;
  const activeSlice = slices.find((slice) => slice.label === hoveredSlice) ?? null;

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(120px,170px)_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-[170px] min-w-0">
        <svg viewBox="0 0 160 160" className="size-full overflow-visible" role="img" onMouseLeave={() => setHoveredSlice(null)}>
          {slices.map((slice) => {
            const isHovered = hoveredSlice === slice.label;
            const isDimmed = hoveredSlice !== null && !isHovered;
            return (
              <path
                key={slice.label}
                d={slice.path}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? "32" : "24"}
                opacity={isDimmed ? 0.35 : 1}
                className="transition-all"
              />
            );
          })}
          {slices.map((slice) => (
            <path
              key={`${slice.label}-hit`}
              d={slice.path}
              fill="none"
              stroke="transparent"
              strokeWidth="46"
              className="cursor-pointer"
              pointerEvents="stroke"
              onMouseEnter={() => setHoveredSlice(slice.label)}
              onMouseMove={() => setHoveredSlice(slice.label)}
            />
          ))}
        </svg>
        {activeSlice ? (
          <div className="absolute left-1/2 top-1/2 z-10 min-w-40 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#111827] p-2 text-xs text-white shadow-xl">
            <div className="font-semibold">{activeSlice.label}</div>
            <div>{formatNumber(activeSlice.value)} searches</div>
            <div>{activeSlice.percent.toFixed(1)}%</div>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 space-y-2">
        {slices.map((slice) => {
          const isHovered = hoveredSlice === slice.label;
          return (
            <div
              key={slice.label}
              className={`flex items-center justify-between gap-3 rounded-xl px-2 py-1 text-sm transition ${
                isHovered ? "bg-[#eeeeee]" : slice.intent === "client" ? "bg-red-50" : ""
              }`}
              onMouseEnter={() => setHoveredSlice(slice.label)}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="truncate font-medium text-[#333]" title={slice.label}>
                  {slice.label}
                </span>
              </div>
              <span className="text-[#666]">{slice.percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBarChart({
  rows,
}: {
  rows: Array<{ label: string; value: number; flagged?: boolean }>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-[#777]">No search term data available.</p>;
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(110px,220px)_1fr_auto] items-center gap-3 text-sm">
          <span className="min-w-0 truncate font-medium text-[#333]" title={row.label}>
            {row.label}
          </span>
          <div className="h-8 overflow-hidden rounded-full bg-[#eeeeee]">
            <div
              className="flex h-full items-center rounded-full bg-[#e10600] px-3 text-xs font-semibold text-white"
              style={{ width: `${Math.max(7, (row.value / max) * 100)}%` }}
            />
          </div>
          <span className="font-semibold text-[#333]">{formatNumber(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function KeywordList({
  title,
  rows,
  action,
  emptyMessage,
  highlightUnused = false,
  variant = "list",
}: {
  title: string;
  rows: AdvancedKeywordMetric[];
  action?: React.ReactNode;
  emptyMessage?: string;
  highlightUnused?: boolean;
  variant?: "list" | "bar";
}) {
  return (
    <ChartPanel title={title} action={action}>
      {rows.length ? (
        variant === "bar" ? (
          <KeywordVolumeBars rows={rows} />
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={`${row.keyword}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f7f7] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#333]">{row.keyword}</p>
                  {highlightUnused && row.isUnusedInGoogleAds ? null : null}
                </div>
                <span className="text-sm font-bold text-[#9f0019]">{formatNumber(row.searchVolume)}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="text-sm text-[#777]">{emptyMessage ?? "No keywords found."}</p>
      )}
    </ChartPanel>
  );
}

function KeywordVolumeBars({ rows }: { rows: AdvancedKeywordMetric[] }) {
  return (
    <HorizontalBarChart
      rows={rows.map((row) => ({
        label: row.keyword,
        value: row.searchVolume,
        flagged: row.isUnusedInGoogleAds,
      }))}
    />
  );
}

function KeywordDetailsButton({
  label,
  title,
  rows,
  cpcLabel = "CPC",
}: {
  label: string;
  title: string;
  rows: AdvancedKeywordMetric[];
  cpcLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!rows.length) {
    return null;
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <KeywordDetailsModal title={title} rows={rows} cpcLabel={cpcLabel} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LanguageDetailsButton({
  rows,
  cpcLabel = "CPC",
}: {
  rows: Record<"English" | "Malay" | "Chinese", AdvancedKeywordMetric[]>;
  cpcLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const allRows = [...rows.English, ...rows.Malay, ...rows.Chinese];
  if (!allRows.length) {
    return null;
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        See Details
      </Button>
      {open ? (
        <KeywordDetailsModal
          title="Language Keyword Details"
          rows={allRows}
          cpcLabel={cpcLabel}
          onClose={() => setOpen(false)}
          groupedRows={rows}
        />
      ) : null}
    </>
  );
}

function KeywordDetailsModal({
  title,
  rows,
  cpcLabel = "CPC",
  groupedRows,
  onClose,
}: {
  title: string;
  rows: AdvancedKeywordMetric[];
  cpcLabel?: string;
  groupedRows?: Record<"English" | "Malay" | "Chinese", AdvancedKeywordMetric[]>;
  onClose: () => void;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState<"All" | "English" | "Malay" | "Chinese">("All");
  const normalizedRows = groupedRows
    ? (Object.entries(groupedRows) as Array<["English" | "Malay" | "Chinese", AdvancedKeywordMetric[]]>).flatMap(
        ([language, items]) => items.map((item) => ({ ...item, language }))
      )
    : rows;
  const visibleRows = groupedRows && selectedLanguage !== "All"
    ? normalizedRows.filter((row) => row.language === selectedLanguage)
    : normalizedRows;
  const text = normalizedRows
    .map((row) => `${row.keyword}\t${row.language ?? ""}\t${row.searchVolume}\t${row.cpc ?? ""}`)
    .join("\n");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#eeeeee] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#333]">{title}</h2>
            <p className="text-sm text-[#777]">
              Keyword, language, search volume, and {cpcLabel} from DataForSEO where available.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(text)}>
              <CopyIcon className="size-4" />
              Copy
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="max-h-[72vh] overflow-auto p-5">
          {groupedRows ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {(["All", "English", "Malay", "Chinese"] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                    selectedLanguage === language
                      ? "border-[#e10600] bg-[#e10600] text-white"
                      : "border-[#dddddd] bg-white text-[#333] hover:border-[#e10600]"
                  }`}
                  onClick={() => setSelectedLanguage(language)}
                >
                  {language}
                </button>
              ))}
            </div>
          ) : null}
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-[#333]">
              <tr>
                <th className="border-b border-[#eeeeee] px-3 py-2">Keyword</th>
                <th className="border-b border-[#eeeeee] px-3 py-2">Language</th>
                <th className="border-b border-[#eeeeee] px-3 py-2 text-right">Search Volume</th>
                <th className="border-b border-[#eeeeee] px-3 py-2 text-right">{cpcLabel}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const showLanguageHeader =
                  groupedRows &&
                  selectedLanguage === "All" &&
                  (index === 0 || visibleRows[index - 1]?.language !== row.language);
                return (
                  <tr key={`${row.keyword}-${row.language}-${index}`} className="border-b border-[#f1f1f1]">
                  <td className="px-3 py-2 font-medium text-[#333]">
                    {showLanguageHeader ? (
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#9f0019]">
                        {row.language}
                      </div>
                    ) : null}
                    {row.keyword}
                  </td>
                  <td className="px-3 py-2 text-[#666]">{row.language ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#9f0019]">{formatNumber(row.searchVolume)}</td>
                  <td className="px-3 py-2 text-right text-[#666]">{row.cpc === null || row.cpc === undefined ? "-" : row.cpc.toFixed(2)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OpportunityList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    keyword: string;
    category: string;
    reason: string;
    currentVolume: number;
    previousVolume: number;
    growthPercent: number | null;
    history: AdvancedMonthlyPoint[];
    hasRisingVolume: boolean;
  }>;
}) {
  return (
    <ChartPanel title={title}>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
          <div key={`${row.category}-${row.keyword}`} className="rounded-xl bg-[#f7f7f7] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-[#9f0019]">{row.category}</p>
                <p className="font-semibold text-[#333]">{row.keyword}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.hasRisingVolume ? "bg-emerald-50 text-emerald-700" : "bg-[#eeeeee] text-[#666]"}`}>
                {row.hasRisingVolume ? "Rising" : "No rise yet"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#666]">
              {formatNumber(row.previousVolume)} → {formatNumber(row.currentVolume)}
              {row.growthPercent === null ? " · New growth" : ` · ${formatPercentChange(row.currentVolume, row.previousVolume)}`}
            </p>
            <CollapsibleReason text={row.reason} />
            {row.history.length > 1 ? (
              <div className="mt-3">
                <MiniLineChart points={row.history.slice(-12)} />
              </div>
            ) : null}
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-[#777]">No keyword gaps found.</p> : null}
      </div>
    </ChartPanel>
  );
}

function RisingKeywordList({
  rows,
}: {
  rows: Array<{
    keyword: string;
    currentVolume: number;
    previousVolume: number;
    growthPercent: number | null;
    history: AdvancedMonthlyPoint[];
    reason: string;
  }>;
}) {
  return (
    <ChartPanel title="Rising Keyword Opportunities">
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.keyword} className="rounded-xl bg-[#f7f7f7] p-3">
            <p className="font-semibold text-[#333]">{row.keyword}</p>
            <p className="text-sm text-[#666]">
              {formatNumber(row.previousVolume)} → {formatNumber(row.currentVolume)}
            </p>
            <p className="mt-1 font-semibold text-[#009b7a]">
              {row.growthPercent === null ? "New growth" : `+${row.growthPercent.toFixed(1)}%`}
            </p>
            <CollapsibleReason text={row.reason} />
            {row.history.length > 1 ? <MiniLineChart points={row.history.slice(-12)} /> : null}
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-[#777]">No rising keywords found.</p> : null}
      </div>
    </ChartPanel>
  );
}

function SeasonalList({
  rows,
}: {
  rows: Array<{
    keyword: string;
    upcomingMonth: string;
    previousYearVolume: number;
    reason: string;
    history: AdvancedMonthlyPoint[];
  }>;
}) {
  const [showCharts, setShowCharts] = useState(true);
  return (
    <ChartPanel
      title="Seasonal Opportunities"
      action={
        rows.length ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCharts((value) => !value)}>
            {showCharts ? "Hide Charts" : "Show Charts"}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={`${row.keyword}-${row.upcomingMonth}`} className="rounded-xl bg-[#f7f7f7] p-3">
            <p className="font-semibold text-[#333]">{row.keyword}</p>
            <p className="text-sm text-[#666]">{row.upcomingMonth} · {formatNumber(row.previousYearVolume)}</p>
            <CollapsibleReason text={row.reason} />
            {showCharts && row.history.length > 1 ? <MiniLineChart points={row.history.slice(-12)} /> : null}
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-[#777]">No seasonal pattern found.</p> : null}
      </div>
    </ChartPanel>
  );
}

function CollapsibleReason({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) {
    return null;
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-[#dddddd] bg-white px-2 py-1 text-xs font-semibold text-[#666] transition hover:border-[#e10600] hover:text-[#9f0019]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
        {open ? "Hide description" : "Show description"}
      </button>
      {open ? <p className="mt-1 text-sm text-[#666]">{text}</p> : null}
    </div>
  );
}

function MiniLineChart({ points }: { points: AdvancedMonthlyPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const rows = points.filter((point) => Number.isFinite(point.value));
  if (rows.length < 2) {
    return null;
  }
  const values = rows.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 260;
  const height = 92;
  const paddingX = 8;
  const paddingTop = 8;
  const chartHeight = 52;
  const chartPoints = rows.map((point, index) => ({
    ...point,
    x: rows.length === 1 ? width / 2 : paddingX + (index / (rows.length - 1)) * (width - paddingX * 2),
    y: paddingTop + chartHeight - ((point.value - min) / range) * chartHeight,
  }));
  const hoveredPoint = hoveredIndex === null ? null : chartPoints[hoveredIndex] ?? null;
  const hitWidth = (width - paddingX * 2) / Math.max(chartPoints.length - 1, 1);
  const tooltipX = hoveredPoint ? Math.min(width - 96, Math.max(0, hoveredPoint.x - 48)) : 0;
  const tooltipY = hoveredPoint ? Math.max(0, hoveredPoint.y - 38) : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-24 w-full overflow-visible"
      role="img"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <polyline
        fill="none"
        stroke="#e10600"
        strokeLinecap="round"
        strokeWidth="3"
        points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      {chartPoints.map((point, index) => (
        <rect
          key={`${point.month}-${index}-hit`}
          x={Math.max(0, point.x - hitWidth / 2)}
          y="0"
          width={hitWidth}
          height={height}
          fill="transparent"
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseMove={() => setHoveredIndex(index)}
        />
      ))}
      {hoveredPoint ? (
        <line
          x1={hoveredPoint.x}
          x2={hoveredPoint.x}
          y1={paddingTop}
          y2={paddingTop + chartHeight}
          stroke="#9ca3af"
          strokeDasharray="3 3"
        />
      ) : null}
      {chartPoints.map((point, index) => (
        <circle
          key={`${point.month}-${index}`}
          cx={point.x}
          cy={point.y}
          r={hoveredIndex === index ? "4" : "3"}
          fill="#e10600"
        />
      ))}
      {hoveredPoint ? (
        <foreignObject x={tooltipX} y={tooltipY} width="96" height="36" pointerEvents="none">
          <div className="rounded-md bg-[#111827] px-2 py-1 text-[9px] leading-tight text-white shadow-lg">
            <div className="font-semibold">{hoveredPoint.month}</div>
            <div>{formatNumber(hoveredPoint.value)}</div>
          </div>
        </foreignObject>
      ) : null}
      <text x={paddingX} y={height - 4} className="fill-[#777] text-[10px]">
        {rows[0].month}
      </text>
      <text x={width - paddingX} y={height - 4} textAnchor="end" className="fill-[#777] text-[10px]">
        {rows.at(-1)?.month}
      </text>
    </svg>
  );
}

function SocialCalendar({
  payload,
  screenshotMode,
}: {
  payload: AdvancedReportPayload;
  screenshotMode: boolean;
}) {
  return (
    <div className="space-y-5">
      <ChartPanel title="Poster / Image">
        <div className="grid gap-4 lg:grid-cols-3">
          {payload.socialCalendar.posters.map((item) => (
            <SocialPoster
              key={item.id}
              item={item}
              cacheKey={payload.metadata.cacheKey}
              companyName={payload.metadata.companyName}
              screenshotMode={screenshotMode}
            />
          ))}
        </div>
        {!payload.socialCalendar.posters.length ? (
            <p className="p-4 text-sm text-[#777]">No poster/image content found.</p>
        ) : null}
      </ChartPanel>
      <ChartPanel title="Story / Video">
        <div className="grid gap-4 lg:grid-cols-2">
          {payload.socialCalendar.stories.map((item) => (
            <SocialStory
              key={item.id}
              item={item}
              cacheKey={payload.metadata.cacheKey}
              companyName={payload.metadata.companyName}
              screenshotMode={screenshotMode}
            />
          ))}
        </div>
        {!payload.socialCalendar.stories.length ? (
          <p className="text-sm text-[#777]">No story/video content found.</p>
        ) : null}
      </ChartPanel>
    </div>
  );
}

function SocialPoster({
  item,
  cacheKey,
  companyName,
  screenshotMode,
}: {
  item: AdvancedSocialCalendarItem;
  cacheKey: string;
  companyName: string;
  screenshotMode: boolean;
}) {
  const mediaUrls = getPosterMediaUrls(item);
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-[#eeeeee] p-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="size-10 shrink-0 rounded-full bg-[#e10600]" />
          <div className="min-w-0">
            <p className="font-semibold text-[#333]">{companyName}</p>
            <p className="text-xs text-[#777]">{item.title}</p>
          </div>
        </div>
        <DatePill date={item.date} />
      </div>
      {mediaUrls.length > 0 ? (
        <MediaCarousel
          urls={mediaUrls}
          label={item.title}
          aspectClassName="aspect-square"
          screenshotMode={screenshotMode}
        />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-[#eeeeee] text-sm text-[#777]">
          No reference image
        </div>
      )}
      <CollapsibleEditableText
        title="Ad Copy"
        text={item.captionTemplate ?? ""}
        storageKey={`${cacheKey}:${item.id}:caption`}
        defaultOpen={screenshotMode}
      />
    </article>
  );
}

function SocialStory({
  item,
  cacheKey,
  companyName,
  screenshotMode,
}: {
  item: AdvancedSocialCalendarItem;
  cacheKey: string;
  companyName: string;
  screenshotMode: boolean;
}) {
  const mediaUrls = getStoryMediaUrls(item);
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-[#eeeeee] p-4">
        <div className="flex min-w-0 items-start gap-2">
          <div className="size-10 shrink-0 rounded-full bg-[#e10600]" />
          <div className="min-w-0">
            <p className="font-semibold text-[#333]">{companyName}</p>
            <h3 className="mt-1 text-sm font-medium text-[#777]">{item.title}</h3>
          </div>
        </div>
        <DatePill date={item.date} />
      </div>
      {mediaUrls.length > 0 ? (
        <MediaCarousel
          urls={mediaUrls}
          label={item.title}
          aspectClassName="aspect-video"
          screenshotMode={screenshotMode}
        />
      ) : item.referenceVideoStoryboard ? (
        <div className="m-4 rounded-xl bg-[#f7f7f7] p-3 text-sm text-[#333] whitespace-pre-line">
          <EditablePlaceholderText
            text={item.referenceVideoStoryboard}
            storageKey={`${cacheKey}:${item.id}:storyboard`}
          />
        </div>
      ) : (
        <div className="m-4 rounded-xl bg-[#f7f7f7] p-3 text-sm text-[#777]">No storyboard found.</div>
      )}
      <CollapsibleEditableText
        title="Video Storyboard Notes"
        text={item.videoStoryboardNotes ?? ""}
        storageKey={`${cacheKey}:${item.id}:notes`}
        defaultOpen={screenshotMode}
      />
    </article>
  );
}

function DatePill({ date }: { date: string | null | undefined }) {
  if (!date) {
    return null;
  }

  return (
    <span className="shrink-0 rounded-full bg-[#ffe8e8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9f1d35] sm:text-xs">
      {formatDateTag(date)}
    </span>
  );
}

function MediaCarousel({
  urls,
  label,
  aspectClassName,
  screenshotMode,
}: {
  urls: string[];
  label: string;
  aspectClassName: string;
  screenshotMode: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const uniqueUrls = dedupeValues(urls);
  const hasMultiple = uniqueUrls.length > 1;

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      const container = scrollRef.current;
      if (!container || uniqueUrls.length === 0) {
        return;
      }
      const normalized = (nextIndex + uniqueUrls.length) % uniqueUrls.length;
      setActiveIndex(normalized);
      container.scrollTo({ left: normalized * container.clientWidth, behavior: "smooth" });
    },
    [uniqueUrls.length]
  );

  if (screenshotMode) {
    return (
      <div className="grid gap-3 bg-[#f7f7f7] p-3 sm:grid-cols-2" data-advanced-media-grid="true">
        {uniqueUrls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className={`overflow-hidden rounded-xl bg-[#eeeeee] ${aspectClassName}`}
            data-advanced-media-item="true"
          >
            {isImageLikeUrl(url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                className="size-full object-cover"
                loading="eager"
                decoding="sync"
              />
            ) : (
              <span className="flex size-full items-center justify-center break-all p-4 text-sm text-[#666]">
                {url}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative bg-[#f7f7f7]">
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {uniqueUrls.map((url, index) => (
          <button
            type="button"
            key={`${url}-${index}`}
            className={`relative min-w-full snap-center ${aspectClassName} bg-[#eeeeee]`}
            onClick={() => setZoomUrl(url)}
            aria-label={`Zoom ${label}`}
          >
            {isImageLikeUrl(url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="size-full object-cover" loading="eager" decoding="async" />
            ) : (
              <span className="flex size-full items-center justify-center break-all p-4 text-sm text-[#666]">
                {url}
              </span>
            )}
          </button>
        ))}
      </div>
      {hasMultiple ? (
        <>
          <button
            type="button"
            aria-label="Previous media"
            className="absolute left-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-[10px] text-[#999] shadow-sm"
            onClick={() => scrollToIndex(activeIndex - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next media"
            className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-[10px] text-[#999] shadow-sm"
            onClick={() => scrollToIndex(activeIndex + 1)}
          >
            ›
          </button>
        </>
      ) : null}
      {zoomUrl ? <MediaZoomModal url={zoomUrl} onClose={() => setZoomUrl(null)} /> : null}
    </div>
  );
}

function MediaZoomModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative flex h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[#dddddd] px-3 py-1 text-sm"
              onClick={() => setZoom(1)}
            >
              Fit
            </button>
            <button
              type="button"
              className="rounded-full border border-[#dddddd] px-3 py-1 text-sm"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
            >
              -
            </button>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-40"
              aria-label="Image zoom"
            />
            <button
              type="button"
              className="rounded-full border border-[#dddddd] px-3 py-1 text-sm"
              onClick={() => setZoom((value) => Math.min(3, value + 0.1))}
            >
              +
            </button>
            <span className="text-xs text-[#777]">{Math.round(zoom * 100)}%</span>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#f3f3f3] px-4 py-2 text-sm font-semibold text-[#333]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-[#111] p-3">
          {isImageLikeUrl(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="block max-h-full max-w-full object-contain"
              style={{
                height: zoom === 1 ? "100%" : "auto",
                maxHeight: zoom === 1 ? "100%" : "none",
                maxWidth: zoom === 1 ? "100%" : "none",
                width: zoom === 1 ? "auto" : `${zoom * 100}%`,
              }}
            />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="block break-all p-6 text-white underline">
              {url}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleEditableText({
  title,
  text,
  storageKey,
  defaultOpen = false,
}: {
  title: string;
  text: string;
  storageKey: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = defaultOpen || open;

  if (!text) {
    return null;
  }

  return (
    <div className="p-3">
      <button
        type="button"
        className={`${defaultOpen ? "hidden " : ""}flex w-full items-center justify-between rounded-xl border border-[#eeeeee] px-3 py-2 text-left text-sm font-semibold text-[#333]`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="text-[#999]">
          {isOpen ? <EyeOffIcon className="size-4" aria-label="Hide" /> : <EyeIcon className="size-4" aria-label="Show" />}
        </span>
      </button>
      {isOpen ? (
        <div className="mt-3 rounded-xl bg-[#f7f7f7] p-3 text-sm leading-relaxed whitespace-pre-line text-[#333]">
          <EditablePlaceholderText text={text} storageKey={storageKey} />
        </div>
      ) : null}
    </div>
  );
}

function isImageLikeUrl(value: string): boolean {
  return /^https?:\/\//.test(value) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(value);
}

function getPosterMediaUrls(item: AdvancedSocialCalendarItem): string[] {
  return item.referenceImageUrls?.length
    ? item.referenceImageUrls
    : item.referenceImageUrl
      ? [item.referenceImageUrl]
      : [];
}

function getStoryMediaUrls(item: AdvancedSocialCalendarItem): string[] {
  return item.referenceVideoStoryboardUrls?.length
    ? item.referenceVideoStoryboardUrls
    : item.referenceVideoStoryboard && isImageLikeUrl(item.referenceVideoStoryboard)
      ? [item.referenceVideoStoryboard]
      : [];
}

function dedupeValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatDateTag(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function EditablePlaceholderText({ text, storageKey }: { text: string; storageKey: string }) {
  const [value, setValue] = usePersistentText(storageKey, text);
  const parts = value.split(/(\[[^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <button
            type="button"
            key={`${part}-${index}`}
            className="mx-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-sky-900 transition hover:bg-sky-200"
            onClick={() => {
              const next = window.prompt("Edit placeholder", part.slice(1, -1));
              if (next !== null) {
                setValue(value.replace(part, `[${next}]`));
              }
            }}
          >
            {part}
          </button>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function DecisionTable({ payload }: { payload: AdvancedReportPayload }) {
  const storageKey = `${payload.metadata.cacheKey}:decision-drafts`;
  const [drafts, setDrafts] = usePersistentJson<Record<string, { clientInput: string; reasoning: string }>>(
    storageKey,
    {}
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-white text-sm shadow-sm">
      <div className="hidden grid-cols-[0.75fr_1.25fr_1.25fr] gap-4 bg-[#f3f3f3] px-4 py-3 font-semibold text-[#333] lg:grid">
        <div>Decision Item</div>
        <div>Client Input</div>
        <div>Note</div>
      </div>
      <div className="divide-y divide-[#eeeeee]">
        {payload.decisions.map((row) => {
          const draft = drafts[row.id] ?? { clientInput: row.clientInput, reasoning: "" };
          return (
            <div key={row.id} className="grid gap-4 px-4 py-5 lg:grid-cols-[0.75fr_1.25fr_1.25fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#999] lg:hidden">Decision Item</p>
                <p className="mt-1 font-semibold text-[#333] lg:mt-0">{row.decisionItem}</p>
              </div>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#999] lg:hidden">Client Input</span>
                <textarea
                  value={draft.clientInput}
                  onChange={(event) => {
                    setDrafts({
                      ...drafts,
                      [row.id]: { ...draft, clientInput: event.target.value },
                    });
                  }}
                  className="mt-1 min-h-40 w-full resize-y rounded-xl border border-[#d8d8d8] px-3 py-2 outline-none focus:border-[#e10600] lg:mt-0"
                  placeholder="Client selection / input"
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#999] lg:hidden">Note</span>
                <textarea
                  value={draft.reasoning}
                  onChange={(event) => {
                    setDrafts({
                      ...drafts,
                      [row.id]: { ...draft, reasoning: event.target.value },
                    });
                  }}
                  className="mt-1 min-h-40 w-full resize-y rounded-xl border border-[#d8d8d8] px-3 py-2 text-[#333] outline-none placeholder:text-[#999] focus:border-[#e10600] lg:mt-0"
                  placeholder={row.recommendation}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function usePersistentText(storageKey: string, fallback: string): [string, (next: string) => void] {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") {
      return fallback;
    }
    return window.localStorage.getItem(storageKey) ?? fallback;
  });

  const update = useCallback(
    (next: string) => {
      setValue(next);
      window.localStorage.setItem(storageKey, next);
    },
    [storageKey]
  );

  return [value, update];
}

function usePersistentJson<T>(storageKey: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return fallback;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return fallback;
    }
    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey]
  );

  return [value, update];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function getCpcLabel(countryCode: string): string {
  const currencyByCountry: Record<string, string> = {
    MY: "RM",
    SG: "SGD",
    AU: "AUD",
    US: "USD",
  };
  const currency = currencyByCountry[countryCode.toUpperCase()] ?? "local currency";
  return `CPC (${currency})`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPercentChange(current: number | undefined, previous: number | undefined): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !previous) {
    return "n/a";
  }
  const change = (((current ?? 0) - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}
