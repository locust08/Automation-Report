/** Environment-neutral transport. Routing/approval decisions belong to callers. */
export type GoogleCustomerId = string & { readonly __customerId: unique symbol };
export type GoogleCloudProjectId = string & { readonly __cloudProjectId: unique symbol };
export interface CloudProjectMetadata { id?: GoogleCloudProjectId; number?: string; name?: string; accessLevel?: string }
export interface GoogleAdsClientOptions {
  clientId: string | null; clientSecret: string | null; refreshToken: string | null;
  apiVersion?: string | null; project?: Omit<CloudProjectMetadata, "id"> & { id?: string };
  timeoutMs?: number; maxResponseBytes?: number; maxRetries?: number;
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number;
  onResponse?: (metadata: { requestId: string | null; status: number }) => void;
}
export interface RequestOptions { loginCustomerId?: string | null; validateOnly?: boolean }
type Category = "configuration" | "oauth" | "project-access" | "project-quota" | "permission" | "invalid-gaql" | "transient" | "timeout" | "network" | "response-size" | "response-format" | "pagination" | "api";
export class GoogleAdsApiError extends Error {
  readonly name = "GoogleAdsApiError";
  constructor(readonly category: Category, readonly status: number | null, readonly errorCode: string | null,
    readonly requestId: string | null, readonly retryAt: number | null, readonly apiVersion: string,
    readonly accessMode: "direct" | "manager", readonly project: CloudProjectMetadata = {}) {
    super(`Google Ads ${category} error${errorCode ? ` (${errorCode})` : ""}${requestId ? `; request ID ${requestId}` : ""}.${category === "project-access" ? ` Review https://console.cloud.google.com/apis/api/googleads.googleapis.com/overview${project.id ? `?project=${encodeURIComponent(project.id)}` : ""}` : ""}${category === "configuration" ? " OAuth client ID, secret, refresh token and API v25 or later are required." : ""}`);
  }
  get retryable() { return ["project-quota", "transient", "timeout", "network"].includes(this.category); }
}

const tokenCache = new Map<string, { token: string; expiresAt: number; pending?: Promise<string> }>();
const cooldowns = new Map<string, number>();
// API policy exemptions are consumed internally; never attach response bodies to public errors.
const failureDetails = new WeakMap<GoogleAdsApiError, unknown>();
export function getGoogleAdsFailureDetails(error: unknown): unknown {
  return error instanceof GoogleAdsApiError ? failureDetails.get(error) : undefined;
}
export function normalizeGoogleAdsApiVersion(value?: string | null): string {
  const normalized = (value || "v25").trim().toLowerCase().replace(/^(\d)/, "v$1");
  if (!/^v\d+$/.test(normalized) || Number(normalized.slice(1)) < 25) {
    throw new GoogleAdsApiError("configuration", null, null, null, null, "v25", "direct");
  }
  return normalized;
}
function customerId(value: string): GoogleCustomerId {
  const id = value.replace(/-/g, "").trim();
  if (!/^\d{10}$/.test(id)) throw new Error("Google Ads customer ID must contain 10 digits.");
  return id as GoogleCustomerId;
}
function safeCode(value: unknown): string | null { return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(value) ? value : null; }
function safeRequestId(value: unknown): string | null { return typeof value === "string" && /^[\w-]{1,150}$/.test(value) ? value : null; }
function retryDelay(value: string | null, now: number, attempt: number) {
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return Math.min(1000 * 2 ** attempt, 10000);
}
type Envelope = { error?: { status?: string; details?: Array<{ requestId?: string; errors?: Array<{ errorCode?: Record<string, string> }> }> }; requestId?: string };

export class GoogleAdsRestClient {
  readonly apiVersion: string;
  readonly project: CloudProjectMetadata;
  private readonly options: GoogleAdsClientOptions;
  private readonly transport: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tokenKey: string;
  private readonly quotaKey: string;
  constructor(options: GoogleAdsClientOptions) {
    this.apiVersion = normalizeGoogleAdsApiVersion(options.apiVersion);
    if (!options.clientId || !options.clientSecret || !options.refreshToken) throw new GoogleAdsApiError("configuration", null, null, null, null, this.apiVersion, "direct");
    this.options = options;
    this.project = { ...options.project, id: options.project?.id as GoogleCloudProjectId | undefined };
    this.transport = options.fetch ?? ((...args) => fetch(...args));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.tokenKey = JSON.stringify([options.clientId, options.clientSecret, options.refreshToken]);
    this.quotaKey = this.project.number || this.project.id || options.clientId;
  }
  private error(category: Category, mode: "direct" | "manager", status: number | null = null, code: string | null = null, requestId: string | null = null, retryAt: number | null = null) {
    return new GoogleAdsApiError(category, status, code, requestId, retryAt, this.apiVersion, mode, this.project);
  }
  private async readJson(url: string, init: RequestInit, mode: "direct" | "manager") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 45000);
    let requestId: string | null = null;
    let status: number | null = null;
    try {
      const response = await this.transport(url, { ...init, cache: "no-store", signal: controller.signal });
      status = response.status;
      requestId = safeRequestId(response.headers.get("request-id"));
      const limit = this.options.maxResponseBytes ?? 32 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw this.error("response-size", mode, status, null, requestId);
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = ""; let size = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) { await reader.cancel(); throw this.error("response-size", mode, status, null, requestId); }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      let data: unknown;
      try { data = text ? JSON.parse(text) : {}; } catch {
        if (!response.ok) data = {};
        else throw this.error("response-format", mode, status, null, requestId);
      }
      const envelopes = (Array.isArray(data) ? data : [data]) as Envelope[];
      const envelope = envelopes.find(item => item?.error);
      const details = envelope?.error?.details ?? [];
      requestId ??= safeRequestId(details.find(item => item.requestId)?.requestId) ?? safeRequestId(envelopes.find(item => item?.requestId)?.requestId);
      this.options.onResponse?.({ requestId, status });
      return { response, data, envelope, requestId, details };
    } catch (error) {
      if (error instanceof GoogleAdsApiError) throw error;
      throw this.error(controller.signal.aborted ? "timeout" : "network", mode, status, null, requestId);
    } finally { clearTimeout(timer); }
  }
  async getAccessToken(force = false): Promise<string> {
    let entry = tokenCache.get(this.tokenKey);
    if (entry?.pending) return entry.pending;
    if (!force && entry && entry.expiresAt > this.now() + 60000) return entry.token;
    if (!entry) { entry = { token: "", expiresAt: 0 }; tokenCache.set(this.tokenKey, entry); }
    const cache = entry;
    cache.pending = (async () => {
      const { response, data } = await this.readJson("https://oauth2.googleapis.com/token", {
        method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.options.clientId!, client_secret: this.options.clientSecret!, refresh_token: this.options.refreshToken! }),
      }, "direct");
      const payload = data as { access_token?: string; expires_in?: number };
      if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token) throw this.error("oauth", "direct", response.status);
      cache.token = payload.access_token;
      cache.expiresAt = this.now() + Math.max(0, Number(payload.expires_in) || 3600) * 1000;
      return cache.token;
    })();
    try { return await cache.pending; } finally { cache.pending = undefined; }
  }
  async request<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    // Only relative Ads service paths are accepted: credentials can never go to an arbitrary host.
    if (!/^(customers(?:\/\d{10}\/\w+(?::\w+)?|:listAccessibleCustomers)|\w+:\w+)$/.test(path)) throw this.error("configuration", "direct");
    const login = options.loginCustomerId ? customerId(options.loginCustomerId) : null;
    const mode = login ? "manager" : "direct";
    const read = /:(search|searchStream|listAccessibleCustomers)$/.test(path);
    const validation = !read && !!body && typeof body === "object" && (body as { validateOnly?: unknown }).validateOnly === true;
    const canRetry = read || validation;
    const retries = canRetry ? Math.min(Math.max(this.options.maxRetries ?? 3, 0), 5) : 0;
    for (let attempt = 0; ; attempt++) {
      let error: GoogleAdsApiError;
      try {
        const cooldown = cooldowns.get(this.quotaKey) ?? 0;
        if (cooldown > this.now()) throw this.error("project-quota", mode, 429, "RESOURCE_EXHAUSTED", null, cooldown);
        const token = await this.getAccessToken();
        const { response, data, envelope, details, requestId } = await this.readJson(`https://googleads.googleapis.com/${this.apiVersion}/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(login && !path.endsWith(":listAccessibleCustomers") ? { "login-customer-id": login } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        }, mode);
        if (response.ok && !envelope) return data as T;
        const code = safeCode(details.flatMap(d => d.errors ?? []).flatMap(e => Object.values(e.errorCode ?? {}))[0]) ?? safeCode(envelope?.error?.status);
        const quota = response.status === 429 || !!code?.includes("EXHAUSTED") || !!code?.includes("QUOTA");
        const category: Category = code === "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" ? "project-access" : quota ? "project-quota" : response.status >= 500 ? "transient" : response.status === 401 ? "oauth" : response.status === 403 ? "permission" : response.status === 400 ? "invalid-gaql" : "api";
        const retryAt = (quota || category === "transient") ? this.now() + retryDelay(response.headers.get("retry-after"), this.now(), attempt) : null;
        error = this.error(category, mode, response.status, code, requestId, retryAt);
        failureDetails.set(error, data);
        if (quota && retryAt) cooldowns.set(this.quotaKey, retryAt);
        if (response.status === 401 && canRetry && attempt < retries) { await this.getAccessToken(true); continue; }
      } catch (caught) {
        if (!(caught instanceof GoogleAdsApiError)) throw this.error("network", mode);
        error = caught;
      }
      if (!canRetry || !error.retryable || attempt >= retries) throw error;
      const delay = error.retryAt === null ? 1000 * 2 ** attempt : Math.max(0, error.retryAt - this.now());
      // Do not block a request for a long project quota window; surface retry time instead.
      if (delay > 30000) throw error;
      await this.sleep(delay);
    }
  }
  search<T>(id: string, query: string, options: RequestOptions & { pageToken?: string } = {}) {
    return this.request<{ results?: T[]; nextPageToken?: string }>(`customers/${customerId(id)}/googleAds:search`, { query, ...(options.pageToken ? { pageToken: options.pageToken } : {}) }, options);
  }
  async searchAll<T>(id: string, query: string, options: RequestOptions = {}): Promise<T[]> {
    const rows: T[] = []; const seenRows = new Set<string>(); const tokens = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 10000; page++) {
      const data = await this.search<T>(id, query, { ...options, pageToken });
      for (const row of data.results ?? []) { const key = JSON.stringify(row); if (!seenRows.has(key)) { seenRows.add(key); rows.push(row); } }
      pageToken = data.nextPageToken;
      if (!pageToken) return rows;
      if (tokens.has(pageToken)) break;
      tokens.add(pageToken);
    }
    throw this.error("pagination", options.loginCustomerId ? "manager" : "direct");
  }
  async searchStream<T>(id: string, query: string, options: RequestOptions = {}): Promise<T[]> {
    const batches = await this.request<Array<{ results?: T[] }>>(`customers/${customerId(id)}/googleAds:searchStream`, { query }, options);
    if (!Array.isArray(batches)) throw this.error("response-format", options.loginCustomerId ? "manager" : "direct");
    return batches.flatMap(batch => batch.results ?? []);
  }
  mutate<T = { results?: unknown[] }>(id: string, service: string, operations: unknown[], options: RequestOptions = {}): Promise<T> {
    return this.request(`customers/${customerId(id)}/${service}:mutate`, { [service === "googleAds" ? "mutateOperations" : "operations"]: operations, partialFailure: false, validateOnly: options.validateOnly === true }, options);
  }
  listAccessibleCustomers() { return this.request<{ resourceNames?: string[] }>("customers:listAccessibleCustomers"); }
}
