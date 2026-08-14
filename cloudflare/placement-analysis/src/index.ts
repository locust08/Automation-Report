type Command = { command: "retrieve" | "load_more"; accountId: string; startDate: string; endDate: string; refresh?: boolean };
type Env = { ACCOUNT_DIRECTORY: D1Database; PLACEMENT_IMPORTS: R2Bucket; PLACEMENT_QUEUE: Queue<Command>; WORKER_API_SECRET: string; GOOGLE_ADS_DEVELOPER_TOKEN: string; GOOGLE_ADS_REFRESH_TOKEN: string; GOOGLE_ADS_CLIENT_ID: string; GOOGLE_ADS_CLIENT_SECRET: string; GOOGLE_ADS_API_VERSION?: string; GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string };
type Placement = { stableKey: string; sourceView: string; resourceName: string; placement: string; displayName: string; placementType: string; targetUrl: string | null; campaignId: string | null; campaignName: string; campaignType: string; adGroupId: string | null; adGroupName: string; impressions: number; clicks: number; spend: number; conversions: number; videoViews: number };
type GoogleRow = { performanceMaxPlacementView?: GooglePlacementView; detailPlacementView?: GooglePlacementView; campaign?: { id?: string; name?: string; advertisingChannelType?: string }; adGroup?: { id?: string; name?: string }; metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: string | number; videoViews?: string | number } };
type GooglePlacementView = { resourceName?: string; placement?: string; displayName?: string; placementType?: string; groupPlacementTargetUrl?: string; targetUrl?: string };
type CacheStatus = { id: string; accountId: string; startDate: string; endDate: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; stage: string; processedRows: number; totalRows: number | null; hasMore: boolean; error: string | null; cancellationRequested: boolean; startedAt: string; updatedAt: string; expiresAt: string | null; chunkCount: number; summary?: CacheSummary };
type CacheSummary = { campaignTypes: Array<{ channelType: string; label: string; campaignCount: number; placementCount: number; impressions: number; spend: number; available: boolean }>; placementCount: number; totalImpressions: number; totalSpend: number; uniqueSites: number; topSites: Array<{ id: string; displayName: string; placement: string; targetUrl: string | null; campaignName: string; campaignType: string; impressions: number }> };
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_PAGE_SIZE = 250;
const CACHE_CHUNK_SIZE = 250;

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!await authorized(request, env.WORKER_API_SECRET)) return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    if (url.pathname === "/placement-cache/start" && request.method === "POST") return startCache(await request.json<Command>(), env);
    if (url.pathname === "/placement-cache/load-more" && request.method === "POST") return loadMoreCache(await request.json<Command>(), env);
    if (url.pathname === "/placement-cache/status" && request.method === "GET") return statusResponse(url, env);
    if (url.pathname === "/placement-cache/rows" && request.method === "GET") return rowsResponse(url, env);
    if (url.pathname === "/placement-cache/cancel" && request.method === "DELETE") return cancelCache(url, env);
    return json({ error: "Not found" }, 404);
  },
  async queue(batch: MessageBatch<Command>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await retrieve(message.body, env);
        message.ack();
      } catch (error) {
        const current = await readStatus(env, message.body.accountId, message.body.startDate, message.body.endDate);
        if (current?.status !== "cancelled") await writeStatus(env, { ...(current ?? newStatus(message.body)), status: "failed", stage: "Google Ads placement retrieval failed", error: safeError(error), updatedAt: new Date().toISOString() });
        console.error(JSON.stringify({ event: "placement_cache_failed", accountHash: await hash(message.body.accountId), error: safeError(error) }));
        message.retry();
      }
    }
  },
};

export default worker;

async function startCache(input: Command, env: Env) {
  if (!validInput(input)) return json({ error: "Invalid placement cache request" }, 400);
  const existing = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!input.refresh && existing?.status === "completed" && existing.expiresAt && Date.parse(existing.expiresAt) > Date.now() && (existing.totalRows === 0 || (existing.chunkCount > 0 && await env.PLACEMENT_IMPORTS.head(chunkKey(input.accountId, input.startDate, input.endDate, 0))))) return json(existing, 200);
  if (!input.refresh && existing && ["queued", "running"].includes(existing.status)) return json(existing, 202);
  await deleteCache(env, input.accountId, input.startDate, input.endDate);
  const status = newStatus(input);
  await writeStatus(env, status);
  await env.PLACEMENT_QUEUE.send({ ...input, command: "retrieve" });
  return json(status, 202);
}

async function loadMoreCache(input: Command, env: Env) {
  if (!validInput(input)) return json({ error: "Invalid placement cache request" }, 400);
  const existing = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!existing || !existing.expiresAt || Date.parse(existing.expiresAt) <= Date.now()) return json({ code: "PLACEMENT_CACHE_NOT_READY", error: "Load the first placement batch before requesting more." }, 409);
  if (["queued", "running"].includes(existing.status)) return json(existing, 202);
  if (!existing.hasMore) return json(existing, 200);
  const queued = { ...existing, status: "queued" as const, stage: `Queued to load the next ${CACHE_CHUNK_SIZE} placements`, cancellationRequested: false, error: null, updatedAt: new Date().toISOString() };
  await writeStatus(env, queued);
  await env.PLACEMENT_QUEUE.send({ ...input, command: "load_more" });
  return json(queued, 202);
}

async function statusResponse(url: URL, env: Env) {
  const input = queryInput(url);
  if (!input) return json({ error: "A valid account and reporting period are required." }, 400);
  const status = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!status) return json({ status: null });
  if (status.expiresAt && Date.parse(status.expiresAt) <= Date.now()) { await deleteCache(env, input.accountId, input.startDate, input.endDate); return json({ status: null }); }
  return json(status);
}

async function rowsResponse(url: URL, env: Env) {
  const input = queryInput(url);
  if (!input) return json({ error: "A valid account and reporting period are required." }, 400);
  const status = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!status || status.processedRows === 0 || !status.expiresAt || Date.parse(status.expiresAt) <= Date.now()) return json({ code: "PLACEMENT_CACHE_NOT_READY", error: "Placements are still loading from Google Ads." }, 409);
  const campaignType = url.searchParams.get("campaignType") ?? "all";
  const placementType = url.searchParams.get("placementType") ?? "all";
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const offset = (page - 1) * pageSize;
  if (campaignType === "all" && placementType === "all") {
    const firstChunk = Math.floor(offset / CACHE_CHUNK_SIZE);
    const lastChunk = Math.floor((offset + pageSize - 1) / CACHE_CHUNK_SIZE);
    const objects = await Promise.all(Array.from({ length: lastChunk - firstChunk + 1 }, (_, index) => env.PLACEMENT_IMPORTS.get(chunkKey(input.accountId, input.startDate, input.endDate, firstChunk + index))));
    if (objects.some(object => !object)) return json({ code: "PLACEMENT_CACHE_NOT_READY", error: "This placement page is still loading." }, 409);
    const rows = (await Promise.all(objects.map(object => object!.json<Placement[]>()))).flat();
    const localOffset = offset - firstChunk * CACHE_CHUNK_SIZE;
    return json({ rows: rows.slice(localOffset, localOffset + pageSize), page, pageSize, total: status.processedRows, pageCount: Math.ceil(status.processedRows / pageSize), sourceTotal: status.totalRows, loadedRows: status.processedRows, complete: !status.hasMore, generatedAt: status.updatedAt, expiresAt: status.expiresAt });
  }
  const availableChunks = Math.ceil(status.processedRows / CACHE_CHUNK_SIZE);
  const objects = await Promise.all(Array.from({ length: availableChunks }, (_, index) => env.PLACEMENT_IMPORTS.get(chunkKey(input.accountId, input.startDate, input.endDate, index))));
  if (!objects.length || objects.some(object => !object)) return json({ code: "PLACEMENT_CACHE_NOT_READY", error: "The temporary placement results expired." }, 410);
  const cachedRows = (await Promise.all(objects.map(object => object!.json<Placement[]>()))).flat();
  const filtered = cachedRows.filter(row => (campaignType === "all" || row.campaignType === campaignType) && (placementType === "all" || row.placementType === placementType));
  return json({ rows: filtered.slice(offset, offset + pageSize), page, pageSize, total: filtered.length, pageCount: Math.ceil(filtered.length / pageSize), sourceTotal: status.totalRows, loadedRows: status.processedRows, complete: !status.hasMore, generatedAt: status.updatedAt, expiresAt: status.expiresAt });
}

async function cancelCache(url: URL, env: Env) {
  const input = queryInput(url);
  if (!input) return json({ error: "A valid account and reporting period are required." }, 400);
  const current = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!current) return json({ error: "Placement retrieval was not found." }, 404);
  const cancelled = { ...current, status: "cancelled" as const, stage: "Placement retrieval stopped", cancellationRequested: true, updatedAt: new Date().toISOString() };
  await writeStatus(env, cancelled);
  return json(cancelled);
}

async function retrieve(input: Command, env: Env) {
  const current = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!current || current.cancellationRequested) return;
  const targetRows = input.command === "load_more" ? current.processedRows + CACHE_CHUNK_SIZE : CACHE_CHUNK_SIZE;
  await writeStatus(env, { ...current, status: "running", stage: input.command === "load_more" ? `Loading the next ${CACHE_CHUNK_SIZE} placements from Google Ads` : `Loading the first ${CACHE_CHUNK_SIZE} placements from Google Ads`, error: null, cancellationRequested: false, updatedAt: new Date().toISOString() });
  const loginCustomerId = await resolveLoginCustomerId(env, input.accountId);
  const token = await accessToken(env);
  const [standard, pmax] = await Promise.all([
    googleRows(env, token, input.accountId, loginCustomerId, standardQuery(input.startDate, input.endDate, targetRows), "detail_placement_view"),
    googleRows(env, token, input.accountId, loginCustomerId, pmaxQuery(input.startDate, input.endDate, targetRows), "performance_max_placement_view"),
  ]);
  const latest = await readStatus(env, input.accountId, input.startDate, input.endDate);
  if (!latest || latest.cancellationRequested) return;
  const unique = new Map<string, Placement>();
  for (const row of [...standard, ...pmax]) { const previous = unique.get(row.stableKey); if (!previous || row.impressions > previous.impressions) unique.set(row.stableKey, row); }
  const rows = [...unique.values()].sort((a, b) => b.impressions - a.impressions || a.stableKey.localeCompare(b.stableKey)).slice(0, targetRows);
  const hasMore = standard.length >= targetRows || pmax.length >= targetRows;
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  const summary = summarize(rows);
  const chunkCount = Math.ceil(rows.length / CACHE_CHUNK_SIZE);
  await writeStatus(env, { ...latest, status: "running", stage: rows.length ? `Caching ${rows.length.toLocaleString()} requested placements` : "No placement data for this period", totalRows: hasMore ? null : rows.length, hasMore, error: null, updatedAt: generatedAt, expiresAt, chunkCount, summary });
  for (let index = 0; index < chunkCount; index++) {
    const current = await readStatus(env, input.accountId, input.startDate, input.endDate);
    if (!current || current.cancellationRequested) return;
    const chunk = rows.slice(index * CACHE_CHUNK_SIZE, (index + 1) * CACHE_CHUNK_SIZE);
    await env.PLACEMENT_IMPORTS.put(chunkKey(input.accountId, input.startDate, input.endDate, index), JSON.stringify(chunk), { httpMetadata: { contentType: "application/json" }, customMetadata: { expiresAt } });
    const processedRows = Math.min(rows.length, (index + 1) * CACHE_CHUNK_SIZE);
    await writeStatus(env, { ...current, status: processedRows === rows.length ? "completed" : "running", stage: processedRows === rows.length ? (hasMore ? `${processedRows.toLocaleString()} placements loaded · load more when needed` : (rows.length ? "All available placements loaded" : "No placement data for this period")) : "Caching requested placement batch", processedRows, totalRows: hasMore ? null : rows.length, hasMore, updatedAt: new Date().toISOString(), expiresAt, chunkCount, summary });
  }
  if (rows.length === 0) await writeStatus(env, { ...latest, status: "completed", stage: "No placement data for this period", processedRows: 0, totalRows: 0, hasMore: false, error: null, updatedAt: new Date().toISOString(), expiresAt, chunkCount: 0, summary });
}

function summarize(rows: Placement[]): CacheSummary {
  const groups = new Map<string, { campaigns: Set<string>; rows: Placement[] }>();
  for (const row of rows) { const group = groups.get(row.campaignType) ?? { campaigns: new Set<string>(), rows: [] }; group.campaigns.add(row.campaignId ?? row.campaignName); group.rows.push(row); groups.set(row.campaignType, group); }
  const campaignTypes = [...groups.entries()].map(([channelType, group]) => ({ channelType, label: label(channelType), campaignCount: group.campaigns.size, placementCount: group.rows.length, impressions: group.rows.reduce((sum, row) => sum + row.impressions, 0), spend: group.rows.reduce((sum, row) => sum + row.spend, 0), available: group.rows.length > 0 }));
  const websites = rows.filter(row => row.placementType === "WEBSITE");
  return { campaignTypes, placementCount: rows.length, totalImpressions: rows.reduce((sum, row) => sum + row.impressions, 0), totalSpend: rows.reduce((sum, row) => sum + row.spend, 0), uniqueSites: new Set(websites.map(row => row.placement)).size, topSites: websites.slice(0, 5).map((row, index) => ({ id: `cache:${index}`, displayName: row.displayName, placement: row.placement, targetUrl: row.targetUrl, campaignName: row.campaignName, campaignType: row.campaignType, impressions: row.impressions })) };
}

function newStatus(input: Pick<Command, "accountId" | "startDate" | "endDate">): CacheStatus { const now = new Date().toISOString(); return { id: `${input.accountId}:${input.startDate}:${input.endDate}`, accountId: input.accountId, startDate: input.startDate, endDate: input.endDate, status: "queued", stage: `Queued to load the first ${CACHE_CHUNK_SIZE} placements`, processedRows: 0, totalRows: null, hasMore: true, error: null, cancellationRequested: false, startedAt: now, updatedAt: now, expiresAt: null, chunkCount: 0 }; }
function cachePrefix(accountId: string, startDate: string, endDate: string) { return `placement-cache/${accountId}/${startDate}_${endDate}`; }
function statusKey(accountId: string, startDate: string, endDate: string) { return `${cachePrefix(accountId, startDate, endDate)}/status.json`; }
function chunkKey(accountId: string, startDate: string, endDate: string, index: number) { return `${cachePrefix(accountId, startDate, endDate)}/chunks/${String(index).padStart(5, "0")}.json`; }
async function readStatus(env: Env, accountId: string, startDate: string, endDate: string) { const object = await env.PLACEMENT_IMPORTS.get(statusKey(accountId, startDate, endDate)); return object ? object.json<CacheStatus>() : null; }
async function writeStatus(env: Env, status: CacheStatus) { await env.PLACEMENT_IMPORTS.put(statusKey(status.accountId, status.startDate, status.endDate), JSON.stringify(status), { httpMetadata: { contentType: "application/json" } }); }
async function deleteCache(env: Env, accountId: string, startDate: string, endDate: string) { await deleteChunks(env, accountId, startDate, endDate); await Promise.all([env.PLACEMENT_IMPORTS.delete(`${cachePrefix(accountId, startDate, endDate)}/placements.json`), env.PLACEMENT_IMPORTS.delete(statusKey(accountId, startDate, endDate))]); }
async function deleteChunks(env: Env, accountId: string, startDate: string, endDate: string) { const prefix = `${cachePrefix(accountId, startDate, endDate)}/chunks/`; let cursor: string | undefined; do { const page = await env.PLACEMENT_IMPORTS.list({ prefix, cursor }); if (page.objects.length) await env.PLACEMENT_IMPORTS.delete(page.objects.map(object => object.key)); cursor = page.truncated ? page.cursor : undefined; } while (cursor); }
function validInput(input: Command) { return /^\d{10}$/.test(input.accountId) && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate); }
function queryInput(url: URL) { const accountId = (url.searchParams.get("accountId") ?? "").replace(/\D/g, ""); const startDate = url.searchParams.get("startDate") ?? ""; const endDate = url.searchParams.get("endDate") ?? ""; return validInput({ command: "retrieve", accountId, startDate, endDate }) ? { accountId, startDate, endDate } : null; }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Placement retrieval failed"; }
async function hash(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].slice(0, 8).map(value => value.toString(16).padStart(2, "0")).join(""); }
async function resolveLoginCustomerId(env: Env, cid: string) { const row = await env.ACCOUNT_DIRECTORY.prepare("SELECT access_path FROM ad_accounts WHERE google_account_id = ? AND active = 1 LIMIT 1").bind(cid).first<{ access_path: string | null }>(); return row?.access_path?.replace(/\D/g, "") || env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "") || null; }
async function accessToken(env: Env) { const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: "refresh_token" }); const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }); const payload = await response.json<{ access_token?: string; error_description?: string }>(); if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google OAuth refresh failed"); return payload.access_token; }
async function googleRows(env: Env, token: string, cid: string, login: string | null, query: string, sourceView: string): Promise<Placement[]> { const response = await fetch(`https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || "v22"}/customers/${cid}/googleAds:searchStream`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN, "content-type": "application/json", ...(login ? { "login-customer-id": login } : {}) }, body: JSON.stringify({ query }) }); if (!response.ok) throw new Error(`Google Ads placement retrieval failed (${response.status})`); const batches = await response.json<Array<{ results?: GoogleRow[] }>>(); return batches.flatMap(batch => batch.results ?? []).map(row => normalize(row, sourceView)); }
function normalize(row: GoogleRow, sourceView: string): Placement { const view = sourceView === "performance_max_placement_view" ? row.performanceMaxPlacementView : row.detailPlacementView; const campaign = row.campaign ?? {}; const adGroup = row.adGroup ?? {}; const placement = String(view?.placement ?? view?.displayName ?? "Unknown placement"); const resourceName = String(view?.resourceName ?? `${sourceView}:${view?.placementType ?? "UNKNOWN"}:${placement}`); return { stableKey: `${sourceView}:${resourceName}`, sourceView, resourceName, placement, displayName: String(view?.displayName ?? placement), placementType: String(view?.placementType ?? "UNKNOWN"), targetUrl: view?.groupPlacementTargetUrl ?? view?.targetUrl ?? null, campaignId: campaign.id ? String(campaign.id) : null, campaignName: String(campaign.name ?? (sourceView === "performance_max_placement_view" ? "Performance Max" : "Unknown campaign")), campaignType: String(campaign.advertisingChannelType ?? (sourceView === "performance_max_placement_view" ? "PERFORMANCE_MAX" : "UNKNOWN")), adGroupId: adGroup.id ? String(adGroup.id) : null, adGroupName: String(adGroup.name ?? (sourceView === "performance_max_placement_view" ? "Performance Max" : "Unknown ad group")), impressions: Number(row.metrics?.impressions ?? 0), clicks: Number(row.metrics?.clicks ?? 0), spend: Number(row.metrics?.costMicros ?? 0) / 1_000_000, conversions: Number(row.metrics?.conversions ?? 0), videoViews: Number(row.metrics?.videoViews ?? 0) }; }
function standardQuery(start: string, end: string, limit: number) { return `SELECT detail_placement_view.resource_name, detail_placement_view.placement, detail_placement_view.display_name, detail_placement_view.placement_type, detail_placement_view.group_placement_target_url, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM detail_placement_view WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status != 'REMOVED' AND metrics.impressions > 0 ORDER BY metrics.impressions DESC LIMIT ${limit}`; }
function pmaxQuery(start: string, end: string, limit: number) { return `SELECT performance_max_placement_view.placement, performance_max_placement_view.display_name, performance_max_placement_view.placement_type, metrics.impressions FROM performance_max_placement_view WHERE segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0 ORDER BY metrics.impressions DESC LIMIT ${limit}`; }
function label(value: string) { if (value === "VIDEO") return "Video / YouTube"; if (value === "PERFORMANCE_MAX") return "Performance Max"; if (value === "DEMAND_GEN" || value === "DISCOVERY") return "Demand Gen"; return value.toLowerCase().split("_").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
async function authorized(request: Request, secret: string) { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; const encoder = new TextEncoder(); const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(token)), crypto.subtle.digest("SHA-256", encoder.encode(secret))]); const a = new Uint8Array(left); const b = new Uint8Array(right); let difference = 0; for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index]; return difference === 0 && token.length === secret.length; }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
