type QueryValue = string | number | boolean | null | Record<string, unknown> | unknown[];

function config() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SECRET?.trim();
  if (!url || !key) throw new Error("Supabase is not configured for optimization storage.");
  return { url: url.replace(/\/$/, ""), key };
}

export async function supabaseRest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, key } = config();
  const headers = new Headers(init?.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Prefer")) headers.set("Prefer", "return=representation");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase optimization request failed (${response.status}): ${body.slice(0, 800)}`);
  return (body ? JSON.parse(body) : null) as T;
}

export function qs(value: string) {
  return encodeURIComponent(value);
}

export function jsonBody(value: Record<string, QueryValue> | Array<Record<string, QueryValue>>) {
  return JSON.stringify(value);
}
