import type {
  SearchTermAccountSettings,
  SearchTermAnalysisRun,
  SearchTermOptimizationRecord,
} from "@/lib/search-term-optimization/types";

export interface SearchTermOptimizationRepository {
  getSettings(accountId: string): Promise<SearchTermAccountSettings>;
  saveSettings(settings: SearchTermAccountSettings): Promise<void>;
  listDueSettings(now: string): Promise<SearchTermAccountSettings[]>;
  getLatestRun(accountId: string): Promise<SearchTermAnalysisRun | null>;
  saveRun(run: SearchTermAnalysisRun): Promise<void>;
  listRecords(accountId: string): Promise<SearchTermOptimizationRecord[]>;
  saveRecords(records: SearchTermOptimizationRecord[]): Promise<void>;
  getRecord(id: string): Promise<SearchTermOptimizationRecord | null>;
  saveRecord(record: SearchTermOptimizationRecord): Promise<void>;
}

const memory = globalThis as typeof globalThis & {
  __searchTermStore?: {
    settings: Map<string, SearchTermAccountSettings>;
    runs: Map<string, SearchTermAnalysisRun>;
    records: Map<string, SearchTermOptimizationRecord>;
  };
};

function memoryStore() {
  memory.__searchTermStore ??= {
    settings: new Map(),
    runs: new Map(),
    records: new Map(),
  };
  return memory.__searchTermStore;
}

class MemorySearchTermRepository implements SearchTermOptimizationRepository {
  async getSettings(accountId: string) {
    return memoryStore().settings.get(accountId) ?? defaultSettings(accountId);
  }
  async saveSettings(settings: SearchTermAccountSettings) {
    memoryStore().settings.set(settings.accountId, settings);
  }
  async listDueSettings(now: string) {
    return Array.from(memoryStore().settings.values()).filter(
      (settings) => settings.cadence !== "off" && settings.nextRunAt && settings.nextRunAt <= now
    );
  }
  async getLatestRun(accountId: string) {
    return (
      Array.from(memoryStore().runs.values())
        .filter((run) => run.accountId === accountId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null
    );
  }
  async saveRun(run: SearchTermAnalysisRun) {
    memoryStore().runs.set(run.id, run);
  }
  async listRecords(accountId: string) {
    return Array.from(memoryStore().records.values())
      .filter((record) => record.accountId === accountId)
      .sort((left, right) => right.cost - left.cost);
  }
  async saveRecords(records: SearchTermOptimizationRecord[]) {
    records.forEach((record) => memoryStore().records.set(record.id, record));
  }
  async getRecord(id: string) {
    return memoryStore().records.get(id) ?? null;
  }
  async saveRecord(record: SearchTermOptimizationRecord) {
    memoryStore().records.set(record.id, record);
  }
}

class SupabaseSearchTermRepository implements SearchTermOptimizationRepository {
  constructor(private readonly url: string, private readonly key: string) {}

  async getSettings(accountId: string) {
    const rows = await this.request<SearchTermAccountSettings[]>(
      `search_term_account_settings?accountId=eq.${encodeURIComponent(accountId)}&limit=1`
    );
    return rows[0] ?? defaultSettings(accountId);
  }
  async saveSettings(settings: SearchTermAccountSettings) {
    await this.upsert("search_term_account_settings", [settings], "accountId");
  }
  async listDueSettings(now: string) {
    return this.request<SearchTermAccountSettings[]>(
      `search_term_account_settings?cadence=neq.off&nextRunAt=lte.${encodeURIComponent(now)}&order=nextRunAt.asc&limit=25`
    );
  }
  async getLatestRun(accountId: string) {
    const rows = await this.request<SearchTermAnalysisRun[]>(
      `search_term_runs?accountId=eq.${encodeURIComponent(accountId)}&order=startedAt.desc&limit=1`
    );
    return rows[0] ?? null;
  }
  async saveRun(run: SearchTermAnalysisRun) {
    await this.upsert("search_term_runs", [run], "id");
  }
  async listRecords(accountId: string) {
    const rows = await this.request<Array<{ payload: SearchTermOptimizationRecord }>>(
      `search_term_records?accountId=eq.${encodeURIComponent(accountId)}&select=payload&limit=5000`
    );
    return rows.map((row) => row.payload).sort((left, right) => right.cost - left.cost);
  }
  async saveRecords(records: SearchTermOptimizationRecord[]) {
    if (records.length) {
      await this.upsert(
        "search_term_records",
        records.map((record) => ({ id: record.id, runId: record.runId, accountId: record.accountId, payload: record })),
        "id"
      );
    }
  }
  async getRecord(id: string) {
    const rows = await this.request<Array<{ payload: SearchTermOptimizationRecord }>>(
      `search_term_records?id=eq.${encodeURIComponent(id)}&select=payload&limit=1`
    );
    return rows[0]?.payload ?? null;
  }
  async saveRecord(record: SearchTermOptimizationRecord) {
    await this.upsert(
      "search_term_records",
      [{ id: record.id, runId: record.runId, accountId: record.accountId, payload: record }],
      "id"
    );
  }

  private async upsert(table: string, rows: unknown[], conflict: string) {
    await this.request(table, {
      method: "POST",
      headers: { Prefer: `resolution=merge-duplicates,return=minimal`, "Content-Type": "application/json" },
      body: JSON.stringify(rows),
      query: `on_conflict=${encodeURIComponent(conflict)}`,
    });
  }

  private async request<T = unknown>(
    path: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string; query?: string }
  ): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(
      `${this.url.replace(/\/$/, "")}/rest/v1/${path}${options?.query ? `${separator}${options.query}` : ""}`,
      {
        method: options?.method ?? "GET",
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          ...options?.headers,
        },
        body: options?.body,
        cache: "no-store",
      }
    );
    if (!response.ok) throw new Error(`Supabase search-term repository failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export function getSearchTermOptimizationRepository(): SearchTermOptimizationRepository {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? new SupabaseSearchTermRepository(url, key) : new MemorySearchTermRepository();
}

export function searchTermPersistenceMode(): "supabase" | "memory" {
  return process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ? "supabase"
    : "memory";
}

export function defaultSettings(accountId: string): SearchTermAccountSettings {
  return {
    accountId,
    automationEnabled: false,
    cadence: "off",
    nextRunAt: null,
    updatedAt: new Date().toISOString(),
  };
}
