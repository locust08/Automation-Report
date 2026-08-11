import type {
  MetaImportedRow,
  MetaImportJob,
  MetaImportDuplicateAction,
} from "@/lib/meta-import/types";

interface CommitImportInput {
  job: MetaImportJob;
  rows: MetaImportedRow[];
}

interface CommitImportOutput {
  job: MetaImportJob;
  created: number;
  updated: number;
  skipped: number;
}

interface StoredRow extends MetaImportedRow {
  importJobId: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalMetaImportStore {
  rows: Map<string, StoredRow>;
  jobs: MetaImportJob[];
}

const globalStore = globalThis as typeof globalThis & {
  __adsDashboardMetaImportStore?: LocalMetaImportStore;
};

// Next.js development compiles API routes and report routes into separate module bundles.
// Keep the local-only fallback on globalThis so a CSV committed through one route is immediately
// visible to the Overall report route in the same development process.
const localStore = (globalStore.__adsDashboardMetaImportStore ??= {
  rows: new Map<string, StoredRow>(),
  jobs: [],
});
const localRows = localStore.rows;
const localJobs = localStore.jobs;

export async function classifyMetaImportRows(
  rows: MetaImportedRow[]
): Promise<Map<string, MetaImportDuplicateAction>> {
  const worker = getWorkerConfig();
  if (worker) {
    const response = await workerFetch(worker, "/duplicates", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
    const payload = (await response.json()) as { actions: Record<string, MetaImportDuplicateAction> };
    return new Map(Object.entries(payload.actions));
  }

  return new Map(
    rows.map((row) => {
      const existing = localRows.get(row.uniqueKey);
      return [row.uniqueKey, !existing ? "create" : rowsEqual(existing, row) ? "skip" : "update"];
    })
  );
}

export async function commitMetaImport(input: CommitImportInput): Promise<CommitImportOutput> {
  const worker = getWorkerConfig();
  if (worker) {
    const response = await workerFetch(worker, "/imports", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return (await response.json()) as CommitImportOutput;
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.META_IMPORT_ALLOW_EPHEMERAL_LOCAL !== "true"
  ) {
    throw new Error(
      "Meta import persistence is not configured. Set META_IMPORT_WORKER_URL and META_IMPORT_WORKER_SECRET."
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const row of input.rows) {
    const existing = localRows.get(row.uniqueKey);
    if (!existing) {
      created += 1;
      localRows.set(row.uniqueKey, { ...row, importJobId: input.job.id, createdAt: now, updatedAt: now });
    } else if (rowsEqual(existing, row)) {
      skipped += 1;
    } else {
      updated += 1;
      localRows.set(row.uniqueKey, {
        ...row,
        importJobId: input.job.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    }
  }
  const completedJob = { ...input.job, createdRows: created, updatedRows: updated, skippedRows: skipped };
  localJobs.unshift(completedJob);
  return { job: completedJob, created, updated, skipped };
}

export async function listMetaImportJobs(accountId?: string): Promise<MetaImportJob[]> {
  const worker = getWorkerConfig();
  if (worker) {
    const params = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
    const response = await workerFetch(worker, `/imports${params}`);
    const payload = (await response.json()) as { jobs: MetaImportJob[] };
    return payload.jobs;
  }
  return localJobs.filter((job) => !accountId || job.accountId === accountId).slice(0, 100);
}

export async function queryMetaImportedRows(input: {
  accountIds: string[];
  startDate: string;
  endDate: string;
}): Promise<MetaImportedRow[]> {
  const worker = getWorkerConfig();
  if (worker) {
    const params = new URLSearchParams({
      accountIds: input.accountIds.join(","),
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const response = await workerFetch(worker, `/rows?${params.toString()}`);
    const payload = (await response.json()) as { rows: MetaImportedRow[] };
    return payload.rows;
  }
  const accountSet = new Set(input.accountIds);
  return Array.from(localRows.values()).filter(
    (row) =>
      accountSet.has(row.accountId) &&
      row.reportingStart >= input.startDate &&
      row.reportingEnd <= input.endDate
  );
}

function getWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.META_IMPORT_WORKER_URL?.trim();
  const secret = process.env.META_IMPORT_WORKER_SECRET?.trim();
  return baseUrl && secret ? { baseUrl: baseUrl.replace(/\/+$/, ""), secret } : null;
}

async function workerFetch(
  worker: { baseUrl: string; secret: string },
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${worker.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${worker.secret}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Meta import storage request failed with status ${response.status}.`);
  }
  return response;
}

function rowsEqual(left: MetaImportedRow, right: MetaImportedRow): boolean {
  return JSON.stringify(stripStorageFields(left)) === JSON.stringify(stripStorageFields(right));
}

function stripStorageFields(row: MetaImportedRow): MetaImportedRow {
  return {
    uniqueKey: row.uniqueKey,
    source: row.source,
    accountId: row.accountId,
    accountName: row.accountName,
    reportingLevel: row.reportingLevel,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    adSetId: row.adSetId,
    adSetName: row.adSetName,
    adId: row.adId,
    adName: row.adName,
    delivery: row.delivery,
    status: row.status,
    objective: row.objective,
    buyingType: row.buyingType,
    budget: row.budget,
    budgetType: row.budgetType,
    reportingStart: row.reportingStart,
    reportingEnd: row.reportingEnd,
    amountSpent: row.amountSpent,
    impressions: row.impressions,
    reach: row.reach,
    frequency: row.frequency,
    linkClicks: row.linkClicks,
    clicks: row.clicks,
    ctr: row.ctr,
    cpc: row.cpc,
    cpm: row.cpm,
    results: row.results,
    resultType: row.resultType,
    costPerResult: row.costPerResult,
    landingPageViews: row.landingPageViews,
    addToCart: row.addToCart,
    initiateCheckout: row.initiateCheckout,
    purchases: row.purchases,
    purchaseConversionValue: row.purchaseConversionValue,
    roas: row.roas,
    leads: row.leads,
    messagingConversationsStarted: row.messagingConversationsStarted,
    rawMetadata: row.rawMetadata,
  };
}
