import type { AdvancedGenerationState } from "@/lib/reporting/advanced-report";

export interface StoredAdvancedGeneration { state: AdvancedGenerationState; revision: string }
const developmentStore = new Map<string, StoredAdvancedGeneration>();
function config() {
  const base = process.env.ADVANCED_REPORT_CACHE_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.ADVANCED_REPORT_CACHE_SECRET?.trim();
  if (base && secret) return { base, secret };
  if (process.env.NODE_ENV === "production") throw new Error("Durable Advanced Report cache is not configured.");
  return null;
}
export async function readAdvancedGeneration(key: string): Promise<StoredAdvancedGeneration | null> {
  const worker = config();
  if (!worker) return structuredClone(developmentStore.get(key) ?? null);
  const response = await fetch(`${worker.base}/advanced-report-generation/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${worker.secret}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Generation state read failed (${response.status}).`);
  const revision = readGenerationRevision(response.headers);
  if (!revision) throw new Error("Generation cache does not support revision checks.");
  return { state: await response.json() as AdvancedGenerationState, revision };
}
export async function saveAdvancedGeneration(state: AdvancedGenerationState, expected: string | null): Promise<string | null> {
  const worker = config();
  if (!worker) {
    if ((developmentStore.get(state.cacheKey)?.revision ?? null) !== expected) return null;
    const revision = crypto.randomUUID();
    developmentStore.set(state.cacheKey, { state: structuredClone(state), revision });
    return revision;
  }
  const response = await fetch(`${worker.base}/advanced-report-generation/${encodeURIComponent(state.cacheKey)}`, {
    method: "PUT", headers: { Authorization: `Bearer ${worker.secret}`, "Content-Type": "application/json", "If-Match": expected ? JSON.stringify(expected) : "*" },
    body: JSON.stringify(state), cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 409) return null;
  if (!response.ok) throw new Error(`Generation state save failed (${response.status}).`);
  const revision = readGenerationRevision(response.headers);
  if (!revision) throw new Error("Generation cache did not confirm persistence.");
  return revision;
}

function readGenerationRevision(headers: Headers): string | null {
  // Hosting proxies can remove or weaken ETag; the explicit CAS revision must survive transport.
  const explicit = headers.get("X-Advanced-Generation-Revision");
  if (explicit) return explicit;
  const validator = headers.get("ETag")?.replace(/^W\//, "");
  if (!validator) return null;
  const revision = validator.startsWith('"') ? JSON.parse(validator) : validator;
  if (typeof revision !== "string") throw new Error("Generation cache returned an invalid revision.");
  return revision;
}
