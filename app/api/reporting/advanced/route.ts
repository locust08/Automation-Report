import { NextResponse } from "next/server";
import { readAdvancedReportCache } from "@/lib/reporting/advanced-cache";
import { readAdvancedGeneration, saveAdvancedGeneration } from "@/lib/reporting/advanced-generation-store";
import { advanceAdvancedGeneration, advancedAvailableSections, createAdvancedGeneration, snapshotAdvancedGeneration,
  retryAdvancedChunk, buildAdvancedReportCacheKey, getAdvancedReportCountry, refreshAdvancedReportVolatileMedia,
  type AdvancedGenerationState } from "@/lib/reporting/advanced-report";
import { buildDateRange } from "@/lib/reporting/date";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function describe(state: AdvancedGenerationState) {
  const ready = state.cursor >= state.steps.length;
  return { status: ready ? "ready" : "generating", cacheKey: state.cacheKey, generationId: state.generationId,
    nextCursor: ready ? null : state.steps[state.cursor].id, busy: state.leaseUntil > Date.now(),
    steps: state.steps.filter(step => step.active !== false).map(({ id, label, status, message }) => ({ id, label, status, message })),
    availableSections: advancedAvailableSections(state), payload: structuredClone(state.completePayload ?? snapshotAdvancedGeneration(state)) };
}
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const input = parseAdvancedReportRequest(new URL(request.url).searchParams);
    if (!isAdvancedReportMode(input) || !input.accountId) return NextResponse.json({ status: "error", message: "Ad account and advanced report mode are required." }, { status: 400 });
    const key = resolveCacheKey(input);
    const stored = await readAdvancedGeneration(key);
    if (stored) {
      const job = describe(stored.state);
      if (job.status === "ready") {
        job.payload = await refreshAdvancedReportVolatileMedia(job.payload);
        job.payload.metadata.cached = true;
      }
      return NextResponse.json(job);
    }
    const payload = await readAdvancedReportCache(key);
    return NextResponse.json(payload ? { status: "ready", cacheKey: key, payload: await refreshAdvancedReportVolatileMedia(payload) } : { status: "missing", cacheKey: key });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const params = new URLSearchParams();
    Object.entries(body).forEach(([k,v]) => { if (typeof v === "string") params.set(k,v); });
    const url = new URL(request.url);
    const input = parseAdvancedReportRequest(params, url.searchParams);
    if (!isAdvancedReportMode(input) || !input.accountId) return NextResponse.json({ status: "error", message: "Ad account and advanced report mode are required." }, { status: 400 });
    const key = resolveCacheKey(input);
    const stored = await readAdvancedGeneration(key);
    const force = body.regenerate === true || url.searchParams.get("regenerate") === "1";
    if (!stored && !force) {
      const cached = await readAdvancedReportCache(key);
      if (cached) return NextResponse.json({ status: "ready", cacheKey: key, payload: await refreshAdvancedReportVolatileMedia(cached) });
    }
    if (!stored || force) {
      const state = createAdvancedGeneration(input);
      let expected = stored?.revision ?? null;
      let revision = await saveAdvancedGeneration(state, expected);
      for (let attempt = 0; force && !revision && attempt < 2; attempt += 1) {
        expected = (await readAdvancedGeneration(key))?.revision ?? null;
        revision = await saveAdvancedGeneration(state, expected);
      }
      if (!revision) return NextResponse.json({ status: "error", cacheKey: key, message: "Generation changed concurrently. Please retry." }, { status: 409 });
      return NextResponse.json(describe(state));
    }
    const { state } = stored;
    // Compatibility: POST without a cursor advances the persisted next chunk for automation.
    if (body.generationId && body.generationId !== state.generationId) return NextResponse.json(describe(state), { status: 409 });
    if (state.leaseUntil > Date.now()) return NextResponse.json(describe(state));
    const retry = typeof body.retryStepId === "string" ? body.retryStepId : null;
    if (!retry && body.cursor && body.cursor !== state.steps[state.cursor]?.id) return NextResponse.json(describe(state), { status: 409 });
    if (retry) retryAdvancedChunk(state, retry);
    if (state.cursor >= state.steps.length) return NextResponse.json(describe(state));
    // Claim the revision before provider work. Expired leases recover interrupted invocations.
    state.leaseUntil = Date.now() + 150_000;
    const claim = await saveAdvancedGeneration(state, stored.revision);
    if (!claim) return NextResponse.json({ status: "generating", cacheKey: key, message: "Another request advanced this report." });
    await advanceAdvancedGeneration(state);
    state.leaseUntil = 0;
    if (!await saveAdvancedGeneration(state, claim)) {
      const current = await readAdvancedGeneration(key);
      return NextResponse.json(current ? describe(current.state) : { status: "missing", cacheKey: key }, { status: 409 });
    }
    return NextResponse.json(describe(state));
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  console.error("[advanced-report] chunk request failed", error instanceof Error ? error.message : error);
  return NextResponse.json({ status: "error", message: error instanceof Error ? error.message : "Report generation failed." }, { status: 500 });
}

function parseAdvancedReportRequest(
  primary: URLSearchParams,
  fallback?: URLSearchParams
): {
  accountId: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  reportMode: string | null;
  reportType: string | null;
  platform: "google" | "meta" | null;
} {
  return {
    platform: getValue(primary, fallback, "platform") === "meta" ? "meta" : getValue(primary, fallback, "platform") === "google" ? "google" : null,
    accountId: getValue(primary, fallback, "accountId"),
    country: getValue(primary, fallback, "country"),
    startDate: getValue(primary, fallback, "startDate"),
    endDate: getValue(primary, fallback, "endDate"),
    reportMode: getValue(primary, fallback, "reportMode"),
    reportType: getValue(primary, fallback, "reportType"),
  };
}

function isAdvancedReportMode(input: { reportMode: string | null; reportType: string | null }): boolean {
  return isAdvancedModeValue(input.reportMode) && isAdvancedModeValue(input.reportType);
}

function isAdvancedModeValue(value: string | null): boolean {
  return value?.trim().toLowerCase() === "advanced";
}

function getValue(primary: URLSearchParams, fallback: URLSearchParams | undefined, key: string): string | null {
  const value = primary.get(key) ?? fallback?.get(key) ?? null;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveCacheKey(input: {
  platform?: "google" | "meta" | null;
  accountId: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const country = getAdvancedReportCountry(input.country);
  return buildAdvancedReportCacheKey({
    platform: input.platform,
    accountId: input.accountId ?? "",
    country: country.code,
    dateRange,
  });
}
