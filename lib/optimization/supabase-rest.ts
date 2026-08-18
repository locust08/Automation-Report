type QueryValue = string | number | boolean | null | Record<string, unknown> | unknown[];
// Local analysis workers and dashboard polling can briefly contend for the
// same Supabase project. Four seconds produced false outage states even while
// PostgREST was healthy, so keep the request bounded but allow normal jitter.
const READ_TIMEOUT_MS = Math.max(4_000, Number(process.env.SUPABASE_READ_TIMEOUT_MS || 10_000));
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "PATCH", "PUT", "DELETE"]);
const RETRY_DELAYS_MS = [750, 1_500];

export class SupabaseUnavailableError extends Error {
  readonly code = "PLACEMENT_STORAGE_UNAVAILABLE";
  constructor() {
    super("Placement storage is temporarily unavailable. Please try again shortly.");
    this.name = "SupabaseUnavailableError";
  }
}

export function isSupabaseUnavailableError(error: unknown): error is SupabaseUnavailableError {
  return error instanceof SupabaseUnavailableError;
}

function config() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SECRET?.trim();
  if (!url || !key) throw new Error("Supabase is not configured for optimization storage.");
  return { url: url.replace(/\/$/, ""), key };
}

async function requestSupabase(path: string, init?: RequestInit): Promise<{ response: Response; body: string }> {
  const { url, key } = config();
  const headers = new Headers(init?.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Prefer")) headers.set("Prefer", "return=representation");
  const method = (init?.method ?? "GET").toUpperCase();
  // These methods are idempotent for the REST calls made by this app, so a
  // timeout or temporary PostgREST outage can be retried without duplicating
  // rows. POST remains single-attempt unless its caller explicitly retries an
  // operation with its own idempotency key.
  const attempts = RETRYABLE_METHODS.has(method) ? RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      const body = await response.text();
      const unavailable = [502, 503, 504].includes(response.status) || body.includes('"code":"PGRST002"');
      if (unavailable) {
        if (attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw new SupabaseUnavailableError();
      }
      if (!response.ok) throw new Error(`Supabase optimization request failed (${response.status}): ${body.slice(0, 800)}`);
      return { response, body };
    } catch (error) {
      if (isSupabaseUnavailableError(error)) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError" || error instanceof TypeError) {
        if (attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw new SupabaseUnavailableError();
      }
      throw error;
    }
  }
  throw new SupabaseUnavailableError();
}

export async function supabaseRest<T>(path: string, init?: RequestInit): Promise<T> {
  const { body } = await requestSupabase(path, init);
  return (body ? JSON.parse(body) : null) as T;
}

export async function supabaseRestCount(path: string): Promise<number> {
  const { response } = await requestSupabase(path, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const contentRange = response.headers.get("Content-Range");
  const match = contentRange?.match(/\/(\d+)$/);
  if (!match) throw new Error("Supabase count response did not include an exact count.");
  return Number(match[1]);
}

export function qs(value: string) {
  return encodeURIComponent(value);
}

export function jsonBody(value: Record<string, QueryValue> | Array<Record<string, QueryValue>>) {
  return JSON.stringify(value);
}
