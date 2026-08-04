interface Env {
  CHECKLIST_DB: D1Database;
  WORKER_API_TOKEN: string;
}

interface ReportRow {
  report_date: string;
  generated_at: string;
  scanned_count: number;
  alert_row_count: number;
}

interface ItemRow {
  report_date: string;
  item_key: string;
  section_key: string;
  payload_json: string;
  checked: number;
  remark_text: string;
  updated_at: string;
}

interface ItemPayload {
  pageId?: string;
  clientPageId?: string;
  clientName?: string;
  platformNames?: string[];
  accountIds?: string[];
  accountKey?: string;
  combinedSpend?: number;
  [key: string]: unknown;
}

interface ApiItem {
  reportDate: string;
  itemKey: string;
  sectionKey: string;
  payload: ItemPayload;
  checked: boolean;
  remark: string;
  updatedAt: string;
}

interface Company {
  companyId: string;
  companyName: string;
  platforms: string[];
  accountIds: string[];
  accountKeys: string[];
  totalIssues: number;
  unresolvedIssues: number;
  warningIssues: number;
  combinedPostBillingSpend: number;
  picName: string | null;
  items: ApiItem[];
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_PAGE_SIZE = 100;

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true, service: "billing-operations-api" });
      authorize(request, env);
      if (request.method === "GET" && url.pathname === "/reports") return listReports(url, env);
      const itemMatch = url.pathname.match(/^\/items\/(.+)$/);
      if (request.method === "PATCH" && itemMatch) {
        return updateItem(decodeURIComponent(itemMatch[1]), request, env);
      }
      const picMatch = url.pathname.match(/^\/companies\/(.+)\/pic$/);
      if (request.method === "PATCH" && picMatch) return updateCompanyPic(request, env);
      return json({ message: "Not found." }, 404);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("billing_operations_api_error", safeError(error));
      return json({ message: error instanceof Error ? error.message : "Internal error." }, 500);
    }
  },
};

export default worker;

async function listReports(url: URL, env: Env): Promise<Response> {
  const requestedDate = url.searchParams.get("date")?.trim();
  const report = requestedDate
    ? await env.CHECKLIST_DB.prepare(
        "SELECT report_date, generated_at, scanned_count, alert_row_count FROM daily_reports WHERE report_date = ?"
      ).bind(requestedDate).first<ReportRow>()
    : await env.CHECKLIST_DB.prepare(
        "SELECT report_date, generated_at, scanned_count, alert_row_count FROM daily_reports ORDER BY report_date DESC LIMIT 1"
      ).first<ReportRow>();

  if (!report) return emptyReport();

  const rows = await env.CHECKLIST_DB.prepare(
    `SELECT report_date, item_key, section_key, payload_json, checked, remark_text, updated_at
     FROM daily_report_items WHERE report_date = ? ORDER BY position, item_key`
  ).bind(report.report_date).all<ItemRow>();
  const pics = await env.CHECKLIST_DB.prepare(
    `SELECT a.account_key, p.display_name
     FROM daily_report_pic_assignments a JOIN pic_options p ON p.pic_key = a.pic_key
     WHERE a.report_date = ?`
  ).bind(report.report_date).all<{ account_key: string; display_name: string }>();
  const picByAccount = new Map(pics.results.map((row) => [row.account_key, row.display_name]));
  const picOptions = await env.CHECKLIST_DB.prepare(
    "SELECT pic_key, display_name FROM pic_options ORDER BY is_default DESC, display_name"
  ).all<{ pic_key: string; display_name: string }>();

  const groupedCompanies = groupCompanies(rows.results, picByAccount);
  const summaryParams = new URLSearchParams(url.searchParams);
  summaryParams.set("status", "all");
  const summaryCompanies = filterCompanies(groupedCompanies, summaryParams);
  const companies = filterCompanies(groupedCompanies, url.searchParams);
  companies.sort(compareCompanies);

  const summary = {
    companies: summaryCompanies.length,
    issues: summaryCompanies.reduce((sum, company) => sum + company.totalIssues, 0),
    unresolved: summaryCompanies.reduce((sum, company) => sum + company.unresolvedIssues, 0),
    completed: summaryCompanies.reduce((sum, company) => sum + company.totalIssues - company.unresolvedIssues, 0),
    warnings: summaryCompanies.reduce((sum, company) => sum + company.warningIssues, 0),
  };
  const facets = {
    status: facetCounts(groupedCompanies, url.searchParams, "status", ["unresolved", "completed", "all"]),
    platform: facetCounts(groupedCompanies, url.searchParams, "platform", ["all", "meta", "google"]),
    category: facetCounts(groupedCompanies, url.searchParams, "category", [
      "all", "no_spend", "post_billing_spend", "post_billing_warning", "pacing", "no_conversion", "cpl", "score",
    ]),
  };
  const pageSize = clampInteger(url.searchParams.get("pageSize"), 25, 1, MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const page = clampInteger(url.searchParams.get("page"), 1, 1, totalPages);
  const start = (page - 1) * pageSize;

  return json({
    report: {
      date: report.report_date,
      generatedAt: report.generated_at,
      scannedCount: report.scanned_count,
      alertRowCount: report.alert_row_count,
    },
    summary,
    facets,
    companies: companies.slice(start, start + pageSize),
    pagination: { page, pageSize, totalCompanies: companies.length, totalPages },
    picOptions: picOptions.results.map((option) => ({ key: option.pic_key, name: option.display_name })),
  }, 200, { "cache-control": "private, max-age=30" });
}

function facetCounts(companies: Company[], current: URLSearchParams, key: string, values: string[]): Record<string, number> {
  return Object.fromEntries(values.map((value) => {
    const params = new URLSearchParams(current);
    if (value === "all" && key !== "status") params.delete(key);
    else params.set(key, value);
    if (key !== "status" && !params.has("status")) params.set("status", "unresolved");
    return [value, filterCompanies(companies, params).length];
  }));
}

function groupCompanies(rows: ItemRow[], picByAccount: Map<string, string>): Company[] {
  const groups = new Map<string, Company>();
  for (const row of rows) {
    const payload = parsePayload(row.payload_json);
    const companyId = stringValue(payload.clientPageId) || stringValue(payload.clientName) || "unknown";
    const companyName = stringValue(payload.clientName) || "Unknown company";
    let company = groups.get(companyId);
    if (!company) {
      company = {
        companyId,
        companyName,
        platforms: [],
        accountIds: [],
        accountKeys: [],
        totalIssues: 0,
        unresolvedIssues: 0,
        warningIssues: 0,
        combinedPostBillingSpend: 0,
        picName: null,
        items: [],
      };
      groups.set(companyId, company);
    }
    company.platforms = unique([...company.platforms, ...stringArray(payload.platformNames)]);
    company.accountIds = unique([...company.accountIds, ...stringArray(payload.accountIds)]);
    const accountKey = stringValue(payload.accountKey);
    if (accountKey) company.accountKeys = unique([...company.accountKeys, accountKey]);
    company.totalIssues += 1;
    if (!row.checked) company.unresolvedIssues += 1;
    if (row.section_key === "post_billing_warning") company.warningIssues += 1;
    if (typeof payload.combinedSpend === "number") company.combinedPostBillingSpend += payload.combinedSpend;
    if (!company.picName && accountKey) company.picName = picByAccount.get(accountKey) ?? null;
    company.items.push({
      reportDate: row.report_date,
      itemKey: row.item_key,
      sectionKey: row.section_key,
      payload,
      checked: row.checked === 1,
      remark: row.remark_text,
      updatedAt: row.updated_at,
    });
  }
  return [...groups.values()];
}

function filterCompanies(companies: Company[], params: URLSearchParams): Company[] {
  const search = params.get("company")?.trim().toLowerCase() ?? "";
  const platform = params.get("platform")?.trim().toLowerCase() ?? "all";
  const status = params.get("status")?.trim().toLowerCase() ?? "unresolved";
  const category = params.get("category")?.trim().toLowerCase() ?? "all";
  return companies.flatMap((company) => {
    if (search && !`${company.companyName} ${company.accountIds.join(" ")}`.toLowerCase().includes(search)) return [];
    if (platform !== "all" && !company.platforms.some((value) => value.toLowerCase().includes(platform))) return [];
    let items = company.items;
    if (status === "unresolved") items = items.filter((item) => !item.checked);
    if (status === "completed") items = items.filter((item) => item.checked);
    if (category !== "all") items = items.filter((item) => item.sectionKey === category);
    if (items.length === 0) return [];
    return [{
      ...company,
      items,
      totalIssues: items.length,
      unresolvedIssues: items.filter((item) => !item.checked).length,
      warningIssues: items.filter((item) => item.sectionKey === "post_billing_warning").length,
      combinedPostBillingSpend: items.reduce(
        (sum, item) => sum + (typeof item.payload.combinedSpend === "number" ? item.payload.combinedSpend : 0),
        0
      ),
    }];
  });
}

async function updateItem(itemKey: string, request: Request, env: Env): Promise<Response> {
  const input = await request.json() as { reportDate?: unknown; checked?: unknown; remark?: unknown };
  if (typeof input.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
    return json({ message: "A valid reportDate is required." }, 400);
  }
  if (input.checked === undefined && input.remark === undefined) {
    return json({ message: "Provide checked or remark." }, 400);
  }
  const updates: string[] = [];
  const bindings: unknown[] = [];
  const now = new Date().toISOString();
  if (typeof input.checked === "boolean") {
    updates.push("checked = ?", "checked_at = ?");
    bindings.push(input.checked ? 1 : 0, input.checked ? now : null);
  }
  if (typeof input.remark === "string") {
    updates.push("remark_text = ?", "remark_updated_at = ?", "remark_updated_by = ?");
    bindings.push(input.remark.trim().slice(0, 1000), now, "ads-reporting-dashboard");
  }
  updates.push("updated_at = ?");
  bindings.push(now, input.reportDate, itemKey);
  const result = await env.CHECKLIST_DB.prepare(
    `UPDATE daily_report_items SET ${updates.join(", ")} WHERE report_date = ? AND item_key = ?`
  ).bind(...bindings).run();
  if (result.meta.changes !== 1) return json({ message: "Checklist item not found." }, 404);
  return json({ ok: true, updatedAt: now });
}

async function updateCompanyPic(request: Request, env: Env): Promise<Response> {
  const input = await request.json() as { reportDate?: unknown; accountKeys?: unknown; picKey?: unknown };
  if (typeof input.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) return json({ message: "A valid reportDate is required." }, 400);
  const accountKeys = Array.isArray(input.accountKeys)
    ? unique(input.accountKeys.filter((value): value is string => typeof value === "string")).slice(0, 100)
    : [];
  if (accountKeys.length === 0) return json({ message: "At least one account key is required." }, 400);
  const picKey = typeof input.picKey === "string" ? input.picKey.trim() : "";
  const now = new Date().toISOString();
  const statements = accountKeys.map((accountKey) => picKey
    ? env.CHECKLIST_DB.prepare(
        `INSERT INTO daily_report_pic_assignments (report_date, account_key, pic_key, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(report_date, account_key) DO UPDATE SET pic_key = excluded.pic_key, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(input.reportDate, accountKey, picKey, now, "ads-reporting-dashboard")
    : env.CHECKLIST_DB.prepare(
        "DELETE FROM daily_report_pic_assignments WHERE report_date = ? AND account_key = ?"
      ).bind(input.reportDate, accountKey));
  await env.CHECKLIST_DB.batch(statements);
  return json({ ok: true, updatedAt: now });
}

function authorize(request: Request, env: Env) {
  const expected = env.WORKER_API_TOKEN?.trim();
  const supplied = request.headers.get("authorization") ?? "";
  if (!expected || supplied !== `Bearer ${expected}`) throw json({ message: "Unauthorized." }, 401);
}

function emptyReport() {
  return json({
    report: null,
    summary: { companies: 0, issues: 0, unresolved: 0, completed: 0, warnings: 0 },
    facets: { status: {}, platform: {}, category: {} },
    companies: [],
    pagination: { page: 1, pageSize: 25, totalCompanies: 0, totalPages: 1 },
    picOptions: [],
  });
}

function parsePayload(raw: string): ItemPayload {
  try { return JSON.parse(raw) as ItemPayload; } catch { return {}; }
}
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function compareCompanies(a: Company, b: Company) {
  return b.warningIssues - a.warningIssues || b.unresolvedIssues - a.unresolvedIssues || a.companyName.localeCompare(b.companyName);
}
function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
