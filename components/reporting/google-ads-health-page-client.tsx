"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { ReportShell } from "@/components/reporting/report-shell";
import { ReportEmptyState, ReportErrorState, ReportLoadingState, ReportWarnings } from "@/components/reporting/report-state";
import { useGoogleAdsHealthReport } from "@/components/reporting/use-report-data";
import type {
  GoogleAdsHealthCategory,
  GoogleAdsHealthFinding,
  GoogleAdsHealthSeverity,
  GoogleAdsHealthStage,
  GoogleAdsHealthStagePayload,
} from "@/lib/reporting/types";

const STAGES: GoogleAdsHealthStage[] = ["core", "policy", "delivery", "destination"];

export function GoogleAdsHealthPageClient() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const requestedPlatform = searchParams.get("platform")?.trim().toLowerCase() ?? "";
  const digits = accountId.replace(/\D/g, "");
  const isMeta = requestedPlatform === "meta" || accountId.toLowerCase().startsWith("act_") || (digits.length > 0 && digits.length !== 10);
  const enabled = Boolean(accountId) && !isMeta;
  const [scanBase] = useState(() => {
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000)) * 5 * 60 * 1000;
    return { id: String(bucket), at: new Date(bucket).toISOString() };
  });
  const scanSession = useMemo(() => ({ id: `${accountId}:${scanBase.id}`, at: scanBase.at }), [accountId, scanBase]);
  const core = useHealthStage(accountId, "core", enabled, scanSession);
  const policy = useHealthStage(accountId, "policy", enabled && Boolean(core.data), scanSession);
  const delivery = useHealthStage(accountId, "delivery", enabled && Boolean(policy.data || policy.error), scanSession);
  const destination = useHealthStage(accountId, "destination", enabled && Boolean(delivery.data || delivery.error), scanSession);
  const states = [core, policy, delivery, destination];
  const payloads = states.map((state) => state.data).filter((item): item is GoogleAdsHealthStagePayload => Boolean(item));
  const findings = useMemo(() => dedupeFindings(payloads.flatMap((payload) => payload.findings)), [payloads]);
  const warnings = useMemo(() => [...new Set(payloads.flatMap((payload) => payload.warnings))], [payloads]);
  const accountName = payloads[0]?.accountName ?? "Google Ads";
  const scanLabel = payloads.length ? formatScanDate(payloads.at(-1)!.scannedAt) : "Live account scan";
  const allComplete = states.every((state) => Boolean(state.data || state.error));
  const allSuccessful = states.every((state) => Boolean(state.data));
  const activeQuery = useMemo(() => {
    const params = new URLSearchParams(); if (accountId) params.set("accountId", accountId); if (requestedPlatform) params.set("platform", requestedPlatform); return params.toString();
  }, [accountId, requestedPlatform]);

  if (core.loading && !core.data) return <ReportLoadingState kind="dashboard" message="Checking Google Ads account and hierarchy health..." fullPage onRetry={core.retry} />;

  return (
    <ReportShell title={`${accountName} Health Report`} dateLabel={scanLabel} activeQuery={activeQuery} reportReady={allComplete}>
      <div className="space-y-5">
        {!accountId ? <ReportErrorState kind="dashboard" message="Select an account on the Home page before opening Google Ads Health." /> : null}
        {accountId && isMeta ? <ReportEmptyState title="Google Ads only" message="Delivery Health is currently available only for Google Ads accounts. Select a Google Ads account on the Home page to run a live health scan." /> : null}
        {core.error ? <ReportErrorState kind="dashboard" message={core.error} onRetry={core.retry} /> : null}
        {payloads.length ? (
          <>
            <ReportWarnings warnings={warnings} />
            <HealthSummary accountName={accountName} accountId={payloads[0].accountId} scanLabel={scanLabel} findings={findings} />
            <StageProgress states={states} />
            <StageErrors states={states} />
            {findings.length ? <HealthFindings findings={findings} /> : allSuccessful ? <ReportEmptyState title="No health issues found" message="The current Google Ads account scan completed without critical, high, or warning findings." /> : null}
          </>
        ) : null}
      </div>
    </ReportShell>
  );
}

function useHealthStage(accountId: string, stage: GoogleAdsHealthStage, enabled: boolean, scanSession: { id: string; at: string }) {
  const query = useMemo(() => new URLSearchParams({ accountId, stage, scanId: scanSession.id, scanAt: scanSession.at }).toString(), [accountId, scanSession, stage]);
  return useGoogleAdsHealthReport(query, enabled);
}

function HealthSummary({ accountName, accountId, scanLabel, findings }: { accountName: string; accountId: string; scanLabel: string; findings: GoogleAdsHealthFinding[] }) {
  const totals = severityTotals(findings);
  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="rounded-2xl border border-[#d1d1d1] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#71717a]">Live Google Ads health scan</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#18181b]">{accountName}</h2>
        <p className="mt-1 text-sm text-[#71717a]">Customer ID {formatCustomerId(accountId)} · {scanLabel}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HealthStat label="Total issues" value={String(findings.length)} tone="neutral" />
          <HealthStat label="Critical" value={String(totals.critical)} tone="critical" />
          <HealthStat label="High" value={String(totals.high)} tone="high" />
          <HealthStat label="Warning" value={String(totals.warning)} tone="warning" />
        </div>
      </div>
    </section>
  );
}

function StageProgress({ states }: { states: ReturnType<typeof useGoogleAdsHealthReport>[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Health scan progress">
      {STAGES.map((stage, index) => { const state = states[index]; const complete = Boolean(state.data); return (
        <div key={stage} className="flex items-center gap-3 rounded-xl border border-[#d7d7d7] bg-white p-4 shadow-sm">
          {complete ? <CheckCircle2Icon className="size-5 text-emerald-600" /> : state.loading ? <Loader2Icon className="size-5 animate-spin text-blue-600" /> : state.error ? <AlertTriangleIcon className="size-5 text-red-600" /> : <ActivityIcon className="size-5 text-[#a1a1aa]" />}
          <div><p className="text-sm font-semibold capitalize text-[#27272a]">{stage}</p><p className="text-xs text-[#71717a]">{complete ? `${state.data!.queriesCompleted} queries` : state.loading ? "Scanning…" : state.error ? "Failed" : "Waiting"}</p></div>
        </div>
      ); })}
    </section>
  );
}

function StageErrors({ states }: { states: ReturnType<typeof useGoogleAdsHealthReport>[] }) {
  return <>{states.map((state, index) => index > 0 && state.error ? <div key={STAGES[index]}><ReportErrorState kind="dashboard" message={`${formatLabel(STAGES[index])} checks: ${state.error}`} onRetry={state.retry} /></div> : null)}</>;
}

function HealthFindings({ findings }: { findings: GoogleAdsHealthFinding[] }) {
  const [search, setSearch] = useState(""); const [severity, setSeverity] = useState<GoogleAdsHealthSeverity | "all">("all"); const [category, setCategory] = useState<GoogleAdsHealthCategory | "all">("all"); const [resource, setResource] = useState("all");
  const resources = useMemo(() => [...new Set(findings.map((item) => item.resourceType))].sort(), [findings]);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return findings.filter((item) => (severity === "all" || item.severity === severity) && (category === "all" || item.category === category) && (resource === "all" || item.resourceType === resource) && (!query || [item.summary, item.details, item.code, item.resourceName, item.resourceId, ...item.resourceHierarchy.flatMap((node) => [node.resourceName, node.resourceId])].join(" ").toLowerCase().includes(query))); }, [findings, search, severity, category, resource]);
  const groups = useMemo(() => groupFindings(filtered), [filtered]);
  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="rounded-2xl border border-[#d1d1d1] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold text-[#18181b]">Health findings</h2><p className="mt-1 text-sm text-[#71717a]">{filtered.length} matching issue{filtered.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => { setSearch(""); setSeverity("all"); setCategory("all"); setResource("all"); }} className="text-sm font-semibold text-red-600 hover:underline">Clear filters</button></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <label className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#71717a]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Account, issue, resource or ID" className="pl-9" /></label>
          <FilterSelect label="Severity" value={severity} onChange={(value) => setSeverity(value as typeof severity)} options={["all", "critical", "high", "warning"]} />
          <FilterSelect label="Category" value={category} onChange={(value) => setCategory(value as typeof category)} options={["all", "account", "policy", "budget", "experiment", "schedule", "delivery", "location", "destination"]} />
          <FilterSelect label="Resource" value={resource} onChange={setResource} options={["all", ...resources]} />
        </div>
        <div className="mt-6 space-y-4">{groups.length ? groups.map((group) => <FindingGroup key={group.key} group={group} />) : <ReportEmptyState title="No matching findings" message="No issues match the selected filters." />}</div>
      </div>
    </section>
  );
}

function FindingGroup({ group }: { group: FindingGroupValue }) {
  const representative = group.findings[0];
  return (
    <article className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="mr-1 font-semibold text-[#18181b]">{representative.summary}</h3><SeverityBadge severity={representative.severity} /><span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{formatLabel(representative.category)}</span></div>
      <p className="mt-2 text-sm text-[#52525b]">{representative.details}</p><p className="mt-2 text-xs font-semibold text-[#71717a]">{group.findings.length} affected resource{group.findings.length === 1 ? "" : "s"}</p>
      <div className="mt-4 divide-y divide-[#e4e4e7] overflow-hidden rounded-lg border border-[#e4e4e7] bg-white">{group.findings.map((finding) => <ResourceRow key={finding.id} finding={finding} />)}</div>
    </article>
  );
}

function ResourceRow({ finding }: { finding: GoogleAdsHealthFinding }) { return <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex min-w-0 flex-wrap items-center gap-2">{(finding.resourceHierarchy.length ? finding.resourceHierarchy : [{ resourceType: finding.resourceType, resourceId: finding.resourceId, resourceName: finding.resourceName }]).map((node, index) => <span key={`${node.resourceType}-${node.resourceId}`} className="contents">{index ? <span className="text-[#a1a1aa]">›</span> : null}<span className="max-w-[260px] rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-[#71717a]">{formatLabel(node.resourceType)}</span><span className="block truncate text-sm font-semibold text-[#27272a]">{node.resourceName}</span><span className="block truncate text-[11px] text-[#71717a]">ID {node.resourceId}</span></span></span>)}</div><div className="flex shrink-0 flex-wrap gap-2">{finding.googleAdsUrl ? <ExternalLink href={finding.googleAdsUrl} label="Google Ads" /> : null}{finding.notionUrl ? <ExternalLink href={finding.notionUrl} label="Notion" /> : null}{finding.destinationUrl ? <ExternalLink href={finding.destinationUrl} label="Destination" /> : null}</div></div>; }
function ExternalLink({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[#d4d4d8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#3f3f46] hover:bg-[#f4f4f5]">{label}<ExternalLinkIcon className="size-3" /></a>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="grid gap-1 text-xs font-semibold text-[#52525b]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-[#18181b]">{options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}</select></label>; }
function HealthStat({ label, value, tone }: { label: string; value: string; tone: "neutral" | GoogleAdsHealthSeverity }) { const tones = { neutral: "border-zinc-200 bg-zinc-50 text-zinc-900", critical: "border-red-200 bg-red-50 text-red-900", high: "border-orange-200 bg-orange-50 text-orange-900", warning: "border-yellow-200 bg-yellow-50 text-yellow-900" }; return <div className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>; }
function SeverityBadge({ severity }: { severity: GoogleAdsHealthSeverity }) { const styles = { critical: "border-red-200 bg-red-50 text-red-800", high: "border-orange-200 bg-orange-50 text-orange-800", warning: "border-yellow-200 bg-yellow-50 text-yellow-800" }; return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${styles[severity]}`}>{severity}</span>; }

type FindingGroupValue = { key: string; findings: GoogleAdsHealthFinding[] };
function groupFindings(findings: GoogleAdsHealthFinding[]): FindingGroupValue[] { const groups = new Map<string, GoogleAdsHealthFinding[]>(); for (const item of findings) { const key = [item.severity, item.category, item.code, item.summary, item.details].join("|"); const list = groups.get(key) ?? []; list.push(item); groups.set(key, list); } return [...groups].map(([key, items]) => ({ key, findings: items })).sort((a, b) => severityRank(a.findings[0].severity) - severityRank(b.findings[0].severity) || b.findings.length - a.findings.length); }
function dedupeFindings(findings: GoogleAdsHealthFinding[]): GoogleAdsHealthFinding[] { return [...new Map(findings.map((item) => [item.id, item])).values()]; }
function severityTotals(findings: GoogleAdsHealthFinding[]) { return { critical: findings.filter((item) => item.severity === "critical").length, high: findings.filter((item) => item.severity === "high").length, warning: findings.filter((item) => item.severity === "warning").length }; }
function severityRank(value: GoogleAdsHealthSeverity) { return { critical: 0, high: 1, warning: 2 }[value]; }
function formatCustomerId(value: string) { return value.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3"); }
function formatLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatScanDate(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(date); }
