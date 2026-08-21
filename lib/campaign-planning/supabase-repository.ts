import {
  campaignPlanSchema,
  prepareCampaignPlanDraft,
  type CampaignPlan,
  type CampaignPlanDraftInput,
} from "@/lib/campaign-planning/domain";
import type {
  CampaignAccountOption,
  CampaignPackageOption,
  CampaignPlanDetail,
  CampaignPlanningListPayload,
  CampaignPlanSummary,
  CampaignPlatform,
  CampaignRevision,
  LocalSupabaseStage2Meta,
} from "@/lib/campaign-planning/types";

type JsonObject = Record<string, unknown>;

type LocalSupabaseConfig = {
  restUrl: string;
  serviceRoleKey: string;
  label: string;
};

type DraftRpcRow = {
  plan_id: number | string;
  revision_id: number | string;
  revision_number: number;
  platform: CampaignPlatform;
  payload_hash: string;
  status: string;
};

const PLATFORM_DETAIL_TABLE = {
  google: "m04_ads_google_campaign_revision_details",
  meta: "m04_ads_meta_campaign_revision_details",
  tiktok: "m04_ads_tiktok_campaign_revision_details",
} as const;

export class CampaignPlanningRepositoryError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "CampaignPlanningRepositoryError";
  }
}

export function disconnectedStage2Meta(): LocalSupabaseStage2Meta {
  return {
    mode: "crm08-mock-workflow",
    providerWrites: false,
    connection: { status: "disconnected", label: "CRM08 Supabase" },
  };
}

export async function listCampaignPlans(): Promise<CampaignPlanningListPayload> {
  const config = getLocalSupabaseConfig();
  const [accountRows, packageRows, planRows, revisionRows] = await Promise.all([
    readRows(config, "m04_ads_ad_accounts", {
      select: "id,client_id,platform,provider_account_id,account_name,currency,timezone,access_status,access_evidence,access_verified_at,is_active",
      is_active: "eq.true",
      access_status: "eq.verified",
      order: "account_name.asc,id.asc",
    }),
    readRows(config, "m04_ads_budget_packages", {
      select: "id,client_id,package_name,currency,start_date,end_date,envelope_amount,committed_amount,status",
      status: "eq.active",
      order: "package_name.asc,id.asc",
    }),
    readRows(config, "m04_ads_campaign_plans", {
      select: "id,client_id,budget_package_id,ad_account_id,platform,active_revision_id,status,created_by_name,created_at,updated_at,lock_version",
      active_revision_id: "not.is.null",
      order: "updated_at.desc,id.desc",
    }),
    readRows(config, "m04_ads_campaign_plan_revisions", {
      select: revisionSelect(),
      order: "created_at.desc,id.desc",
    }),
  ]);

  const accountOptions = mapAccountOptions(accountRows);
  const accountById = new Map(accountOptions.map((account) => [account.id, account]));
  const clientNames = new Map(accountOptions.map((account) => [account.clientId, account.clientName]));
  const packageOptions = mapPackageOptions(packageRows, clientNames);
  const packageById = new Map(packageOptions.map((item) => [item.id, item]));
  const revisionById = new Map(revisionRows.map((row) => [numberValue(row.id, "revision id"), mapRevision(row)]));
  const campaigns = planRows.map((row) => mapPlanSummary(row, revisionById, accountById, packageById));

  return {
    ...connectedStage2Meta(config),
    summary: {
      total: campaigns.length,
      draft: campaigns.filter((campaign) => campaign.status === "draft").length,
      google: campaigns.filter((campaign) => campaign.platform === "google").length,
      meta: campaigns.filter((campaign) => campaign.platform === "meta").length,
      tiktok: campaigns.filter((campaign) => campaign.platform === "tiktok").length,
    },
    accounts: accountOptions,
    packages: packageOptions,
    campaigns,
    generatedAt: new Date().toISOString(),
  };
}

export async function getCampaignPlan(planId: number): Promise<CampaignPlanDetail> {
  if (!Number.isSafeInteger(planId) || planId < 1) {
    throw new CampaignPlanningRepositoryError("Invalid campaign ID.", 400);
  }

  const config = getLocalSupabaseConfig();
  const planRows = await readRows(config, "m04_ads_campaign_plans", {
    select: "id,client_id,budget_package_id,ad_account_id,platform,active_revision_id,status,created_by_name,created_at,updated_at,lock_version",
    id: `eq.${planId}`,
    limit: "1",
  });
  const planRow = planRows[0];
  if (!planRow) throw new CampaignPlanningRepositoryError("Campaign draft was not found.", 404);

  const accountId = numberValue(planRow.ad_account_id, "ad account id");
  const packageId = numberValue(planRow.budget_package_id, "budget package id");
  const [revisionRows, accountRows, packageRows] = await Promise.all([
    readRows(config, "m04_ads_campaign_plan_revisions", {
      select: revisionSelect(),
      plan_id: `eq.${planId}`,
      order: "revision_number.desc,id.desc",
    }),
    readRows(config, "m04_ads_ad_accounts", {
      select: "id,client_id,platform,provider_account_id,account_name,currency,timezone,access_status,access_evidence,access_verified_at,is_active",
      id: `eq.${accountId}`,
      limit: "1",
    }),
    readRows(config, "m04_ads_budget_packages", {
      select: "id,client_id,package_name,currency,start_date,end_date,envelope_amount,committed_amount,status",
      id: `eq.${packageId}`,
      limit: "1",
    }),
  ]);

  const accountOptions = mapAccountOptions(accountRows);
  const account = accountOptions[0];
  if (!account) throw new CampaignPlanningRepositoryError("Campaign ad account was not found.", 500);
  const packages = mapPackageOptions(packageRows, new Map([[account.clientId, account.clientName]]));
  const budgetPackage = packages[0];
  if (!budgetPackage) throw new CampaignPlanningRepositoryError("Campaign budget package was not found.", 500);

  const revisions = revisionRows.map(mapRevision);
  const activeRevisionId = numberValue(planRow.active_revision_id, "active revision id");
  const currentRevision = revisions.find((revision) => revision.id === activeRevisionId);
  if (!currentRevision) throw new CampaignPlanningRepositoryError("Campaign active revision was not found.", 500);

  const platform = platformValue(planRow.platform);
  const detailRows = await readRows(config, PLATFORM_DETAIL_TABLE[platform], {
    select: "*",
    revision_id: `eq.${currentRevision.id}`,
    limit: "1",
  });
  if (!detailRows[0]) throw new CampaignPlanningRepositoryError("Campaign platform detail was not found.", 500);

  const plan = mapPlanSummary(
    planRow,
    new Map([[currentRevision.id, currentRevision]]),
    new Map([[account.id, account]]),
    new Map([[budgetPackage.id, budgetPackage]]),
  );

  return {
    ...connectedStage2Meta(config),
    plan: {
      ...plan,
      accountId: account.id,
      packageId: budgetPackage.id,
      providerAccountId: account.providerAccountId,
      timezone: account.timezone,
      destination: currentRevision.destination,
      createdBy: stringValue(planRow.created_by_name, "draft author"),
      createdAt: stringValue(planRow.created_at, "draft creation time"),
    },
    currentRevision,
    revisions,
    platformDetail: {
      platform,
      values: detailRows[0],
    },
  };
}

export async function createCampaignPlanDraft(
  input: CampaignPlanDraftInput,
  requestContext: { actorId: string; userAgent?: string | null },
): Promise<CampaignPlanDetail> {
  const config = getLocalSupabaseConfig();
  const selection = await loadSelectedAccountAndPackage(config, input.ad_account_id, input.budget_package_id);

  if (input.client_id !== selection.account.clientId
    || input.client_id !== selection.budgetPackage.clientId
    || input.platform !== selection.account.platform
    || input.provider_account_id !== selection.account.providerAccountId
    || input.currency !== selection.account.currency
    || input.currency !== selection.budgetPackage.currency
    || input.timezone !== selection.account.timezone) {
    throw new CampaignPlanningRepositoryError(
      "Client, account, package, platform, currency, and account metadata must match the selected local records.",
      400,
    );
  }

  const prepared = prepareCampaignPlanDraft({
    ...input,
    client_name: selection.account.clientName,
  });
  const platformDetail = serializePlatformDetail(prepared.plan);
  const rpcRows = await supabaseRequest<DraftRpcRow[]>(config, "rpc/m04_ads_create_campaign_plan_draft", {
    method: "POST",
    body: {
      p_client_id: prepared.plan.client_id,
      p_ad_account_id: prepared.plan.ad_account_id,
      p_budget_package_id: prepared.plan.budget_package_id,
      p_platform: prepared.plan.platform,
      p_revision_payload: prepared.plan,
      p_canonical_json: prepared.canonical_json,
      p_expected_payload_hash: prepared.payload_hash,
      p_platform_detail: platformDetail,
      p_actor_id: requestContext.actorId,
      p_trusted_ip: null,
      p_trusted_user_agent: requestContext.userAgent?.trim().slice(0, 1_000) || "m04-crm08-mock",
    },
  });

  const result = rpcRows[0];
  if (!result || result.platform !== prepared.plan.platform || result.payload_hash !== prepared.payload_hash) {
    throw new CampaignPlanningRepositoryError("CRM08 Supabase returned an invalid draft result.", 500);
  }
  return getCampaignPlan(numberValue(result.plan_id, "created plan id"));
}

export async function runMockCampaignWorkflow(planId: number, actorId: string): Promise<CampaignPlanDetail> {
  if (!Number.isSafeInteger(planId) || planId < 1) {
    throw new CampaignPlanningRepositoryError("Invalid campaign ID.", 400);
  }
  const config = getLocalSupabaseConfig();
  await supabaseRequest<JsonObject[]>(config, "rpc/m04_ads_run_mock_workflow", {
    method: "POST",
    body: {
      p_plan_id: planId,
      p_actor_id: actorId,
      p_request_idempotency_key: `mock-workflow:${planId}`,
    },
  });
  return getCampaignPlan(planId);
}

function connectedStage2Meta(config: LocalSupabaseConfig): LocalSupabaseStage2Meta {
  return {
    mode: "crm08-mock-workflow",
    providerWrites: false,
    connection: { status: "connected", label: config.label },
  };
}

function getLocalSupabaseConfig(): LocalSupabaseConfig {
  if (typeof window !== "undefined") {
    throw new CampaignPlanningRepositoryError("The M04 Supabase repository is server-only.", 500);
  }
  const configuredUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!configuredUrl || !serviceRoleKey) {
    throw new CampaignPlanningRepositoryError(
      "SUPABASE_URL and a server-only Supabase secret key are required.",
      503,
    );
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new CampaignPlanningRepositoryError("SUPABASE_URL is invalid.", 503);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "gsmxeosdjsbujhiwhbzk.supabase.co") {
    throw new CampaignPlanningRepositoryError("M04 is restricted to the CRM08 Supabase project.", 403);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username || url.password || url.search || url.hash
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new CampaignPlanningRepositoryError("SUPABASE_URL must be the CRM08 HTTPS origin.", 503);
  }

  const port = url.port ? `:${url.port}` : "";
  return {
    restUrl: `${url.origin}/rest/v1`,
    serviceRoleKey,
    label: `CRM08 Supabase (${hostname}${port})`,
  };
}

async function loadSelectedAccountAndPackage(
  config: LocalSupabaseConfig,
  accountId: number,
  packageId: number,
): Promise<{ account: CampaignAccountOption; budgetPackage: CampaignPackageOption }> {
  const [accountRows, packageRows] = await Promise.all([
    readRows(config, "m04_ads_ad_accounts", {
      select: "id,client_id,platform,provider_account_id,account_name,currency,timezone,access_status,access_evidence,access_verified_at,is_active",
      id: `eq.${accountId}`,
      limit: "1",
    }),
    readRows(config, "m04_ads_budget_packages", {
      select: "id,client_id,package_name,currency,start_date,end_date,envelope_amount,committed_amount,status",
      id: `eq.${packageId}`,
      limit: "1",
    }),
  ]);
  const account = mapAccountOptions(accountRows)[0];
  if (!account || accountRows[0]?.is_active !== true || accountRows[0]?.access_status !== "verified"
    || !accountRows[0]?.access_verified_at) {
    throw new CampaignPlanningRepositoryError("The selected local ad account is not verified and active.", 409);
  }
  const budgetPackage = mapPackageOptions(packageRows, new Map([[account.clientId, account.clientName]]))[0];
  if (!budgetPackage || packageRows[0]?.status !== "active") {
    throw new CampaignPlanningRepositoryError("The selected local budget package is not active.", 409);
  }
  return { account, budgetPackage };
}

function serializePlatformDetail(plan: CampaignPlan): JsonObject {
  if (plan.platform === "google") {
    return {
      campaign_type: plan.campaign_type,
      bidding_strategy: plan.bidding_strategy,
      target_cpa: plan.bid_targets.target_cpa ?? null,
      target_roas: plan.bid_targets.target_roas ?? null,
      network_settings: plan.network_settings,
      locations: plan.locations,
      languages: plan.languages,
      conversion_action: plan.conversion.action_id,
      campaign_structure: plan.campaign_structure,
      creative_specification: plan.creative,
      tracking: plan.tracking,
    };
  }
  if (plan.platform === "meta") {
    return {
      objective: plan.objective,
      buying_type: plan.buying_type,
      conversion_location: plan.conversion_location,
      optimization_goal: plan.optimization_goal,
      billing_event: plan.billing_event,
      pixel_id: plan.pixel_id,
      conversion_event: plan.conversion_event,
      placements: plan.placements,
      audience: plan.targeting,
      creative_format: plan.creative.format,
      creative_specification: plan.creative,
      tracking: plan.tracking,
    };
  }
  return {
    objective: plan.objective,
    campaign_type: plan.campaign_type,
    budget_mode: plan.budget_mode,
    optimization_goal: plan.optimization_goal,
    pixel_id: plan.pixel_id,
    conversion_event: plan.conversion_event,
    placements: plan.placements,
    targeting: plan.targeting,
    identity_type: plan.identity.type,
    identity_name: plan.identity.display_name,
    creative_type: plan.creative.format,
    video_id: plan.creative.video_id,
    ad_text: plan.creative.ad_text,
    call_to_action: plan.creative.call_to_action,
    spark_ad: plan.creative.spark_ad,
    tracking: plan.tracking,
  };
}

function mapAccountOptions(rows: JsonObject[]): CampaignAccountOption[] {
  return rows.map((row) => {
    const clientId = stringValue(row.client_id, "account client id");
    const evidence = objectValue(row.access_evidence);
    return {
      id: numberValue(row.id, "account id"),
      clientId,
      clientName: optionalString(evidence.client_name) || `Client ${clientId.slice(0, 8)}`,
      platform: platformValue(row.platform),
      providerAccountId: stringValue(row.provider_account_id, "provider account id"),
      accountName: stringValue(row.account_name, "account name"),
      currency: stringValue(row.currency, "account currency"),
      timezone: stringValue(row.timezone, "account timezone"),
    };
  });
}

function mapPackageOptions(rows: JsonObject[], clientNames: Map<string, string>): CampaignPackageOption[] {
  return rows.map((row) => {
    const clientId = stringValue(row.client_id, "package client id");
    const envelopeAmount = numberValue(row.envelope_amount, "package envelope");
    const committedAmount = numberValue(row.committed_amount, "package committed amount");
    return {
      id: numberValue(row.id, "package id"),
      clientId,
      clientName: clientNames.get(clientId) || `Client ${clientId.slice(0, 8)}`,
      name: stringValue(row.package_name, "package name"),
      currency: stringValue(row.currency, "package currency"),
      startDate: stringValue(row.start_date, "package start date"),
      endDate: stringValue(row.end_date, "package end date"),
      envelopeAmount,
      committedAmount,
      remainingAmount: envelopeAmount - committedAmount,
    };
  });
}

function mapPlanSummary(
  row: JsonObject,
  revisions: Map<number, CampaignRevision>,
  accounts: Map<number, CampaignAccountOption>,
  packages: Map<number, CampaignPackageOption>,
): CampaignPlanSummary {
  const revision = revisions.get(numberValue(row.active_revision_id, "active revision id"));
  const account = accounts.get(numberValue(row.ad_account_id, "plan account id"));
  const budgetPackage = packages.get(numberValue(row.budget_package_id, "plan package id"));
  if (!revision || !account || !budgetPackage) {
    throw new CampaignPlanningRepositoryError("Campaign plan references incomplete local records.", 500);
  }
  return {
    id: numberValue(row.id, "plan id"),
    campaignName: revision.campaignName,
    clientId: account.clientId,
    clientName: revision.payload.client_name || account.clientName,
    platform: platformValue(row.platform),
    accountName: account.accountName,
    packageName: budgetPackage.name,
    currency: account.currency,
    allocatedBudget: revision.allocatedBudget,
    startDate: revision.startDate,
    endDate: revision.endDate,
    objective: revision.objective,
    status: statusValue(row.status),
    lockVersion: numberValue(row.lock_version, "plan lock version"),
    updatedAt: stringValue(row.updated_at, "plan update time"),
  };
}

function mapRevision(row: JsonObject): CampaignRevision {
  const parsedPayload = campaignPlanSchema.safeParse(row.plan_payload);
  if (!parsedPayload.success) {
    throw new CampaignPlanningRepositoryError("Stored campaign revision does not match the Stage 2 schema.", 500);
  }
  return {
    id: numberValue(row.id, "revision id"),
    revisionNo: numberValue(row.revision_number, "revision number"),
    campaignName: parsedPayload.data.campaign_name,
    startDate: stringValue(row.start_date, "revision start date"),
    endDate: stringValue(row.end_date, "revision end date"),
    allocatedBudget: numberValue(row.allocated_budget, "allocated budget"),
    dailyBudget: numberValue(row.daily_budget, "daily budget"),
    projectedTotal: numberValue(row.projected_total, "projected total"),
    objective: stringValue(row.objective, "revision objective"),
    destination: stringValue(row.destination, "revision destination"),
    payload: parsedPayload.data,
    canonicalJson: stringValue(row.canonical_json, "canonical JSON"),
    payloadHash: stringValue(row.payload_hash, "payload hash"),
    authorName: stringValue(row.created_by_name, "revision author"),
    createdAt: stringValue(row.created_at, "revision creation time"),
  };
}

function revisionSelect(): string {
  return "id,plan_id,revision_number,client_id,ad_account_id,budget_package_id,platform,provider_account_id,currency,timezone,start_date,end_date,allocated_budget,increment_amount,daily_budget,projected_total,objective,destination,plan_payload,canonical_json,payload_hash,created_by_name,created_at";
}

async function readRows(
  config: LocalSupabaseConfig,
  table: string,
  query: Record<string, string> = {},
): Promise<JsonObject[]> {
  const search = new URLSearchParams(query);
  return supabaseRequest<JsonObject[]>(config, `${table}?${search.toString()}`, { method: "GET" });
}

async function supabaseRequest<T>(
  config: LocalSupabaseConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: JsonObject },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.restUrl}/${path}`, {
      method: init.method,
      headers: {
        accept: "application/json",
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
        "content-profile": "public",
        "content-type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new CampaignPlanningRepositoryError(
      error instanceof Error && error.name === "TimeoutError"
        ? "CRM08 Supabase connection timed out."
        : "Unable to connect to CRM08 Supabase.",
      503,
    );
  }

  const text = await response.text();
  const payload = parseResponse(text);
  if (!response.ok) {
    const errorPayload = objectValue(payload);
    const code = optionalString(errorPayload.code);
    const message = optionalString(errorPayload.message) || `CRM08 Supabase request failed (${response.status}).`;
    throw new CampaignPlanningRepositoryError(message, databaseErrorStatus(code, response.status));
  }
  return payload as T;
}

function parseResponse(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new CampaignPlanningRepositoryError("CRM08 Supabase returned invalid JSON.", 502);
  }
}

function databaseErrorStatus(code: string | undefined, responseStatus: number): number {
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  if (code === "23514" || code === "55000" || code === "40001") return 409;
  if (code === "42501") return 403;
  if (code?.startsWith("PGRST") && responseStatus === 404) return 503;
  return responseStatus >= 400 && responseStatus < 500 ? responseStatus : 503;
}

function platformValue(value: unknown): CampaignPlatform {
  if (value !== "google" && value !== "meta" && value !== "tiktok") {
    throw new CampaignPlanningRepositoryError("Stored campaign platform is invalid.", 500);
  }
  return value;
}

function statusValue(value: unknown): CampaignPlanSummary["status"] {
  if (!["draft", "awaiting_approval", "approved", "launch_in_progress", "launched", "cancelled"].includes(String(value))) {
    throw new CampaignPlanningRepositoryError("Stored campaign status is invalid.", 500);
  }
  return value as CampaignPlanSummary["status"];
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CampaignPlanningRepositoryError(`Stored ${label} is invalid.`, 500);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new CampaignPlanningRepositoryError(`Stored ${label} is invalid.`, 500);
  }
  return number;
}

function objectValue(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {};
}
