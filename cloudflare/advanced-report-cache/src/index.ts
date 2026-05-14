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

interface OverallCacheRow extends CacheRow {
  expires_at: string;
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

interface OverallReportPayload {
  accountIds?: {
    metaAccountId?: string | null;
    googleAccountId?: string | null;
    metaAccountIds?: string[];
    googleAccountIds?: string[];
  };
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
}

interface OverallReportCacheEnvelope {
  payload?: OverallReportPayload;
  expiresAt?: string;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const advancedMatch = url.pathname.match(/^\/advanced-report-cache\/(.+)$/);
    const overallMatch = url.pathname.match(/^\/overall-report-cache\/(.+)$/);
    if (!advancedMatch && !overallMatch) {
      return json({ ok: true, service: "ads-dashboard-advanced-report-cache" });
    }

    const cacheKey = decodeURIComponent((advancedMatch ?? overallMatch)![1]);
    if (overallMatch) {
      if (request.method === "GET") {
        return handleOverallGet(cacheKey, env);
      }
      if (request.method === "PUT") {
        return handleOverallPut(cacheKey, request, env);
      }

      return json({ error: "Method not allowed" }, 405);
    }

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

async function handleOverallGet(cacheKey: string, env: Env): Promise<Response> {
  const row = await env.ADVANCED_REPORT_DB.prepare(
    "SELECT cache_key, r2_key, expires_at FROM overall_report_cache WHERE cache_key = ?"
  )
    .bind(cacheKey)
    .first<OverallCacheRow>();

  if (!row) {
    return json({ error: "Not found" }, 404);
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    return json({ error: "Expired" }, 404);
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

async function handleOverallPut(cacheKey: string, request: Request, env: Env): Promise<Response> {
  const envelope = (await request.json()) as OverallReportCacheEnvelope;
  const payload = envelope.payload;
  if (!payload) {
    return json({ error: "Missing payload" }, 400);
  }

  const expiresAt = envelope.expiresAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const accountId = firstAccountId(payload) ?? "unknown";
  const metaAccountId = payload.accountIds?.metaAccountId ?? payload.accountIds?.metaAccountIds?.[0] ?? null;
  const googleAccountId = payload.accountIds?.googleAccountId ?? payload.accountIds?.googleAccountIds?.[0] ?? null;
  const reportPeriod = `${payload.dateRange?.startDate ?? "unknown"}_${payload.dateRange?.endDate ?? "unknown"}`;
  const schemaVersion = 1;
  const generatedAt = now;
  const r2Key = `overall/${cacheKey}`;

  await env.ADVANCED_REPORTS.put(r2Key, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      accountId,
      reportPeriod,
      schemaVersion: String(schemaVersion),
    },
  });

  await env.ADVANCED_REPORT_DB.prepare(
    `
      INSERT INTO overall_report_cache (
        cache_key,
        r2_key,
        account_id,
        meta_account_id,
        google_account_id,
        report_period,
        schema_version,
        generated_at,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        r2_key = excluded.r2_key,
        account_id = excluded.account_id,
        meta_account_id = excluded.meta_account_id,
        google_account_id = excluded.google_account_id,
        report_period = excluded.report_period,
        schema_version = excluded.schema_version,
        generated_at = excluded.generated_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `
  )
    .bind(
      cacheKey,
      r2Key,
      accountId,
      metaAccountId,
      googleAccountId,
      reportPeriod,
      schemaVersion,
      generatedAt,
      expiresAt,
      now,
      now
    )
    .run();

  return json({ ok: true, cacheKey, expiresAt });
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

function firstAccountId(payload: OverallReportPayload): string | null {
  return (
    payload.accountIds?.metaAccountId ??
    payload.accountIds?.googleAccountId ??
    payload.accountIds?.metaAccountIds?.[0] ??
    payload.accountIds?.googleAccountIds?.[0] ??
    null
  );
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
