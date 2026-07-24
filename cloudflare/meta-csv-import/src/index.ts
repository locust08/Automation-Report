interface Env {
  META_IMPORT_DB: D1Database;
  META_IMPORT_WORKER_SECRET?: string;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta?: { changes?: number };
}

interface ImportedRow {
  uniqueKey: string;
  source: "meta_csv";
  accountId: string;
  reportingLevel: "campaign" | "adset" | "ad";
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  reportingStart: string;
  reportingEnd: string;
  [key: string]: unknown;
}

interface ImportJob {
  id: string;
  originalFilename: string;
  accountId: string;
  importedBy: string;
  uploadedAt: string;
  completedAt: string | null;
  reportingStart: string | null;
  reportingEnd: string | null;
  reportingLevel: string;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  status: string;
  errorSummary: string | null;
}

interface StoredRow {
  unique_key: string;
  row_json: string;
}

interface StoredJob {
  id: string;
  original_filename: string;
  account_id: string;
  imported_by: string;
  uploaded_at: string;
  completed_at: string | null;
  reporting_start: string | null;
  reporting_end: string | null;
  reporting_level: string;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  failed_rows: number;
  status: string;
  error_summary: string | null;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/duplicates") {
        return handleDuplicates(request, env);
      }
      if (request.method === "POST" && url.pathname === "/imports") {
        return handleCommit(request, env);
      }
      if (request.method === "GET" && url.pathname === "/imports") {
        return handleHistory(url, env);
      }
      if (request.method === "GET" && url.pathname === "/rows") {
        return handleRows(url, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("[meta-csv-import] request failed", error);
      return json({ error: error instanceof Error ? error.message : "Storage request failed." }, 500);
    }
  },
};

export default worker;

async function handleDuplicates(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { rows?: ImportedRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const existing = await loadExistingRows(env, rows.map((row) => row.uniqueKey));
  const actions: Record<string, "create" | "update" | "skip"> = {};
  for (const row of rows) {
    const stored = existing.get(row.uniqueKey);
    actions[row.uniqueKey] = !stored ? "create" : stored === JSON.stringify(row) ? "skip" : "update";
  }
  return json({ actions });
}

async function handleCommit(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { job?: ImportJob; rows?: ImportedRow[] };
  if (!body.job || !Array.isArray(body.rows)) return json({ error: "Job and rows are required." }, 400);
  const job = body.job;
  const existing = await loadExistingRows(env, body.rows.map((row) => row.uniqueKey));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const writeRows: ImportedRow[] = [];
  for (const row of body.rows) {
    const stored = existing.get(row.uniqueKey);
    if (!stored) {
      created += 1;
      writeRows.push(row);
    } else if (stored === JSON.stringify(row)) {
      skipped += 1;
    } else {
      updated += 1;
      writeRows.push(row);
    }
  }
  const completedJob: ImportJob = {
    ...job,
    createdRows: created,
    updatedRows: updated,
    skippedRows: job.skippedRows + skipped,
  };
  const statements: D1PreparedStatement[] = [insertJob(env, completedJob)];
  const now = new Date().toISOString();
  for (const row of writeRows) {
    statements.push(
      env.META_IMPORT_DB.prepare(
        `INSERT INTO meta_import_rows (
          unique_key, account_id, reporting_level, campaign_id, adset_id, ad_id,
          reporting_start, reporting_end, source, row_json, import_job_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'meta_csv', ?, ?, ?, ?)
        ON CONFLICT(unique_key) DO UPDATE SET
          account_id = excluded.account_id,
          reporting_level = excluded.reporting_level,
          campaign_id = excluded.campaign_id,
          adset_id = excluded.adset_id,
          ad_id = excluded.ad_id,
          reporting_start = excluded.reporting_start,
          reporting_end = excluded.reporting_end,
          row_json = excluded.row_json,
          import_job_id = excluded.import_job_id,
          updated_at = excluded.updated_at`
      ).bind(
        row.uniqueKey,
        row.accountId,
        row.reportingLevel,
        row.campaignId,
        row.adSetId,
        row.adId,
        row.reportingStart,
        row.reportingEnd,
        JSON.stringify(row),
        job.id,
        now,
        now
      )
    );
  }
  await env.META_IMPORT_DB.batch(statements);
  return json({ job: completedJob, created, updated, skipped: completedJob.skippedRows });
}

async function handleHistory(url: URL, env: Env): Promise<Response> {
  const accountId = url.searchParams.get("accountId")?.replace(/\D/g, "") || null;
  const statement = accountId
    ? env.META_IMPORT_DB.prepare(
        "SELECT * FROM meta_import_jobs WHERE account_id = ? ORDER BY uploaded_at DESC LIMIT 100"
      ).bind(accountId)
    : env.META_IMPORT_DB.prepare("SELECT * FROM meta_import_jobs ORDER BY uploaded_at DESC LIMIT 100");
  const result = await statement.all<StoredJob>();
  return json({ jobs: (result.results ?? []).map(mapJob) });
}

async function handleRows(url: URL, env: Env): Promise<Response> {
  const accountIds = (url.searchParams.get("accountIds") ?? "")
    .split(",")
    .map((value) => value.replace(/\D/g, ""))
    .filter(Boolean);
  const startDate = url.searchParams.get("startDate") ?? "";
  const endDate = url.searchParams.get("endDate") ?? "";
  if (accountIds.length === 0 || !startDate || !endDate) return json({ error: "Account IDs and dates are required." }, 400);
  const placeholders = accountIds.map(() => "?").join(",");
  const result = await env.META_IMPORT_DB.prepare(
    `SELECT row_json FROM meta_import_rows
     WHERE account_id IN (${placeholders}) AND reporting_start >= ? AND reporting_end <= ?
     ORDER BY reporting_start, campaign_id, adset_id, ad_id`
  )
    .bind(...accountIds, startDate, endDate)
    .all<{ row_json: string }>();
  return json({ rows: (result.results ?? []).map((row) => JSON.parse(row.row_json) as ImportedRow) });
}

async function loadExistingRows(env: Env, keys: string[]): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  for (let offset = 0; offset < keys.length; offset += 100) {
    const chunk = keys.slice(offset, offset + 100);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.META_IMPORT_DB.prepare(
      `SELECT unique_key, row_json FROM meta_import_rows WHERE unique_key IN (${placeholders})`
    )
      .bind(...chunk)
      .all<StoredRow>();
    for (const row of result.results ?? []) existing.set(row.unique_key, row.row_json);
  }
  return existing;
}

function insertJob(env: Env, job: ImportJob): D1PreparedStatement {
  return env.META_IMPORT_DB.prepare(
    `INSERT INTO meta_import_jobs (
      id, original_filename, account_id, imported_by, uploaded_at, completed_at,
      reporting_start, reporting_end, reporting_level, total_rows, created_rows,
      updated_rows, skipped_rows, failed_rows, status, error_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    job.id,
    job.originalFilename,
    job.accountId,
    job.importedBy,
    job.uploadedAt,
    job.completedAt,
    job.reportingStart,
    job.reportingEnd,
    job.reportingLevel,
    job.totalRows,
    job.createdRows,
    job.updatedRows,
    job.skippedRows,
    job.failedRows,
    job.status,
    job.errorSummary
  );
}

function mapJob(row: StoredJob): ImportJob {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    accountId: row.account_id,
    importedBy: row.imported_by,
    uploadedAt: row.uploaded_at,
    completedAt: row.completed_at,
    reportingStart: row.reporting_start,
    reportingEnd: row.reporting_end,
    reportingLevel: row.reporting_level,
    totalRows: row.total_rows,
    createdRows: row.created_rows,
    updatedRows: row.updated_rows,
    skippedRows: row.skipped_rows,
    failedRows: row.failed_rows,
    status: row.status,
    errorSummary: row.error_summary,
  } as ImportJob;
}

function isAuthorized(request: Request, env: Env): boolean {
  const secret = env.META_IMPORT_WORKER_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
