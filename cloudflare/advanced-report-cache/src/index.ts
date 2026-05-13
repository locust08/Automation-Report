interface Env {
  ADVANCED_REPORT_DB: D1Database;
  ADVANCED_REPORTS: R2Bucket;
  ADVANCED_REPORT_CACHE_SECRET: string;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string, options?: R2PutOptions): Promise<unknown>;
}

interface R2ObjectBody {
  text(): Promise<string>;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

interface CacheRow {
  cache_key: string;
  r2_key: string;
}

interface AdvancedReportPayloadMetadata {
  cacheKey?: string;
  accountId?: string;
  country?: { code?: string };
  dateRange?: { startDate?: string; endDate?: string };
  schemaVersion?: number;
  generatedAt?: string;
}

interface AdvancedReportPayload {
  metadata?: AdvancedReportPayloadMetadata;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/advanced-report-cache\/(.+)$/);
    if (!match) {
      return json({ ok: true, service: "ads-dashboard-advanced-report-cache" });
    }

    const cacheKey = decodeURIComponent(match[1]);
    if (request.method === "GET") {
      return handleGet(cacheKey, env);
    }
    if (request.method === "PUT") {
      return handlePut(cacheKey, request, env);
    }

    return json({ error: "Method not allowed" }, 405);
  },
};

export default worker;

async function handleGet(cacheKey: string, env: Env): Promise<Response> {
  const row = await env.ADVANCED_REPORT_DB.prepare(
    "SELECT cache_key, r2_key FROM advanced_report_cache WHERE cache_key = ?"
  )
    .bind(cacheKey)
    .first<CacheRow>();

  if (!row) {
    return json({ error: "Not found" }, 404);
  }

  const object = await env.ADVANCED_REPORTS.get(row.r2_key);
  if (!object) {
    return json({ error: "Stored payload not found" }, 404);
  }

  return new Response(await object.text(), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function handlePut(cacheKey: string, request: Request, env: Env): Promise<Response> {
  const bodyText = await request.text();
  const payload = JSON.parse(bodyText) as AdvancedReportPayload;
  const metadata = payload.metadata ?? {};
  const now = new Date().toISOString();
  const accountId = metadata.accountId ?? "unknown";
  const country = metadata.country?.code ?? "MY";
  const reportPeriod = `${metadata.dateRange?.startDate ?? "unknown"}_${metadata.dateRange?.endDate ?? "unknown"}`;
  const schemaVersion = metadata.schemaVersion ?? 1;
  const generatedAt = metadata.generatedAt ?? now;
  const r2Key = cacheKey;

  await env.ADVANCED_REPORTS.put(r2Key, bodyText, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      accountId,
      country,
      reportPeriod,
      schemaVersion: String(schemaVersion),
    },
  });

  await env.ADVANCED_REPORT_DB.prepare(
    `
      INSERT INTO advanced_report_cache (
        cache_key,
        r2_key,
        account_id,
        country,
        report_period,
        schema_version,
        generated_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        r2_key = excluded.r2_key,
        account_id = excluded.account_id,
        country = excluded.country,
        report_period = excluded.report_period,
        schema_version = excluded.schema_version,
        generated_at = excluded.generated_at,
        updated_at = excluded.updated_at
    `
  )
    .bind(cacheKey, r2Key, accountId, country, reportPeriod, schemaVersion, generatedAt, now, now)
    .run();

  return json({ ok: true, cacheKey });
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.ADVANCED_REPORT_CACHE_SECRET;
  if (!expected) {
    return false;
  }
  const header = request.headers.get("Authorization") ?? "";
  return header === `Bearer ${expected}`;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
