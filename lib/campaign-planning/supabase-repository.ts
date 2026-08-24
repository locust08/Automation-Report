import {
  campaignPlanSchema,
  type CampaignPlan,
  type CampaignPlanDraftInput,
} from "@/lib/campaign-planning/domain";
import { prepareCampaignPlanDraft } from "@/lib/campaign-planning/campaign-plan-preparation";
import type { CampaignEditDraft, CampaignWizardDraft, CampaignWizardForm } from "@/lib/campaign-planning/campaign-wizard";
import type {
  CampaignAccountOption,
  CampaignAuditEvent,
  CampaignPackageOption,
  CampaignPlanDetail,
  CampaignPlanningListPayload,
  CampaignPlanSummary,
  CampaignPlatform,
  CampaignRevision,
  CampaignReadinessCheck,
  CampaignReadinessSnapshot,
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

const CRM08_DEVELOPMENT_ACTOR_ID = "c4b46e06-bbe9-4f91-855e-d43d6e31c8fe";

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
  const [revisionRows, accountRows, packageRows, readinessRows, approvalRows, buildRows, auditRows] = await Promise.all([
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
    readRows(config, "m04_ads_campaign_readiness_checks", {
      select: "id,revision_id,revision_hash,result,checks,issues,created_at",
      plan_id: `eq.${planId}`,
      order: "created_at.desc,id.desc",
      limit: "1",
    }),
    readRows(config, "m04_ads_campaign_approvals", {
      select: "id,revision_id,revision_hash,expires_at,approved_by_name,created_at",
      plan_id: `eq.${planId}`,
      order: "created_at.desc,id.desc",
      limit: "1",
    }),
    readRows(config, "m04_ads_campaign_builds", {
      select: "id,revision_id,status,created_at",
      plan_id: `eq.${planId}`,
      order: "created_at.desc,id.desc",
      limit: "1",
    }),
    readRows(config, "m04_ads_campaign_audit_events", {
      select: "id,event_type,actor_name,created_at",
      plan_id: `eq.${planId}`,
      order: "created_at.desc,id.desc",
      limit: "20",
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
    readiness: readinessRows[0] ? mapReadiness(readinessRows[0]) : null,
    approval: approvalRows[0] ? {
      id: numberValue(approvalRows[0].id, "approval id"),
      revisionId: numberValue(approvalRows[0].revision_id, "approval revision id"),
      revisionHash: stringValue(approvalRows[0].revision_hash, "approval revision hash"),
      expiresAt: stringValue(approvalRows[0].expires_at, "approval expiry"),
      approvedBy: stringValue(approvalRows[0].approved_by_name, "approval actor"),
      createdAt: stringValue(approvalRows[0].created_at, "approval creation time"),
    } : null,
    build: buildRows[0] ? {
      id: numberValue(buildRows[0].id, "build id"),
      revisionId: numberValue(buildRows[0].revision_id, "build revision id"),
      status: stringValue(buildRows[0].status, "build status"),
      createdAt: stringValue(buildRows[0].created_at, "build creation time"),
    } : null,
    audit: auditRows.map(mapAuditEvent),
    providerExecutionLocked: true,
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
      p_actor_id: resolveCampaignActorId(requestContext.actorId),
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

export async function updateCampaignPlanRevision(
  planId: number,
  expectedLockVersion: number,
  input: CampaignPlanDraftInput,
  requestContext: { actorId: string; userAgent?: string | null },
): Promise<CampaignPlanDetail> {
  const current = await getCampaignPlan(planId);
  if (current.plan.status !== "draft") throw new CampaignPlanningRepositoryError("Only draft campaigns can be edited.", 409);
  if (current.plan.lockVersion !== expectedLockVersion) throw new CampaignPlanningRepositoryError("This campaign changed while you were editing it. Refresh and try again.", 409);

  const prepared = prepareCampaignPlanDraft({
    ...input,
    platform: current.plan.platform,
    client_id: current.currentRevision.payload.client_id,
    client_name: current.currentRevision.payload.client_name,
    ad_account_id: current.plan.accountId,
    budget_package_id: current.plan.packageId,
    provider_account_id: current.plan.providerAccountId,
    currency: current.plan.currency,
    timezone: current.plan.timezone,
  });
  const config = getLocalSupabaseConfig();
  await supabaseRequest<JsonObject[]>(config, "rpc/m04_ads_update_campaign_plan_draft", {
    method: "POST",
    body: {
      p_plan_id: planId,
      p_expected_plan_lock_version: expectedLockVersion,
      p_revision_payload: prepared.plan,
      p_canonical_json: prepared.canonical_json,
      p_expected_payload_hash: prepared.payload_hash,
      p_platform_detail: serializePlatformDetail(prepared.plan),
      p_actor_id: resolveCampaignActorId(requestContext.actorId),
      p_trusted_ip: null,
      p_trusted_user_agent: requestContext.userAgent?.trim().slice(0, 1_000) || "m04-crm08-edit",
    },
  });
  return getCampaignPlan(planId);
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
      p_actor_id: resolveCampaignActorId(actorId),
      p_request_idempotency_key: `mock-workflow:${planId}`,
    },
  });
  return getCampaignPlan(planId);
}

export async function validateCampaignReadiness(
  planId: number,
  requestContext: { actorId: string; ip?: string | null; userAgent?: string | null; idempotencyKey: string },
): Promise<CampaignPlanDetail> {
  const detail = await getCampaignPlan(planId);
  if (detail.plan.status !== "draft" && detail.plan.status !== "awaiting_approval") {
    throw new CampaignPlanningRepositoryError("Only a draft campaign can be checked for readiness.", 409);
  }
  const config = getLocalSupabaseConfig();
  const [accountRows, packageRows, domainRows, trustedRows] = await Promise.all([
    readRows(config, "m04_ads_ad_accounts", { select: "access_status,access_evidence,access_verified_at,is_active", id: `eq.${detail.plan.accountId}`, limit: "1" }),
    readRows(config, "m04_ads_budget_packages", { select: "start_date,end_date,envelope_amount,committed_amount,status", id: `eq.${detail.plan.packageId}`, limit: "1" }),
    readRows(config, "m04_ads_approved_domains", { select: "domain", client_id: `eq.${detail.plan.clientId}`, is_active: "eq.true" }),
    requestContext.ip
      ? supabaseRequest<boolean>(config, "rpc/m04_ads_is_trusted_network", { method: "POST", body: { p_ip: requestContext.ip } })
      : Promise.resolve(false),
  ]);
  const account = accountRows[0] ?? {};
  const budgetPackage = packageRows[0] ?? {};
  const destinationHost = destinationHostname(detail.plan.destination);
  const approvedDomains = domainRows.map((row) => optionalString(row.domain)).filter((value): value is string => Boolean(value));
  const accessEvidence = objectValue(account.access_evidence);
  const schemaResult = campaignPlanSchema.safeParse(detail.currentRevision.payload);
  const trusted = trustedRows === true;
  const approvedDestination = destinationHost
    ? approvedDomains.some((domain) => destinationHost === domain || destinationHost.endsWith(`.${domain}`))
    : false;
  const checks: CampaignReadinessCheck[] = [
    readinessCheck("revision", "Exact immutable revision", detail.plan.id > 0 && detail.currentRevision.payloadHash.length === 64, `Revision ${detail.currentRevision.revisionNo} · ${detail.currentRevision.payloadHash}`),
    readinessCheck("account", "Account identity and access evidence", account.is_active === true && account.access_status === "verified" && Boolean(account.access_verified_at) && Object.keys(accessEvidence).length > 0, "Stored account identity, verification time, and access evidence must all be present."),
    readinessCheck("budget", "Budget package and flight", budgetPackage.status === "active" && detail.plan.startDate >= String(budgetPackage.start_date) && detail.plan.endDate <= String(budgetPackage.end_date) && detail.currentRevision.projectedTotal <= detail.plan.allocatedBudget + 0.01 && detail.plan.allocatedBudget <= numberValue(budgetPackage.envelope_amount, "package envelope") - numberValue(budgetPackage.committed_amount, "package committed amount"), "Allocation, dates, and projected total must fit the active package."),
    readinessCheck("domain", "Approved destination domain", approvedDestination, destinationHost ? `${destinationHost} must be in the M04 approved-domain list.` : "A valid destination URL is required."),
    readinessCheck("platform", `${humanizePlatform(detail.plan.platform)} required fields`, schemaResult.success, schemaResult.success ? "The active revision matches the strict platform schema." : "The active revision is missing platform-required fields."),
    readinessCheck("permission", "Administrator permission", true, "The authenticated server route confirmed administrator access."),
    {
      key: "network",
      label: "M04 trusted network",
      status: trusted ? "passed" : requestContext.ip ? "failed" : "attention",
      detail: requestContext.ip ? (trusted ? `${requestContext.ip} matches an active M04 network.` : `${requestContext.ip} is not in the M04 trusted-network list.`) : "The request did not include a trusted client IP.",
    },
  ];
  const issues = checks.filter((check) => check.status !== "passed").map((check) => `${check.label}: ${check.detail}`);
  const result = checks.every((check) => check.status === "passed") ? "passed" : checks.some((check) => check.status === "failed") ? "failed" : "attention";
  await supabaseRequest<JsonObject[]>(config, "rpc/m04_ads_record_campaign_readiness", {
    method: "POST",
    body: {
      p_plan_id: planId,
      p_revision_id: detail.currentRevision.id,
      p_expected_revision_hash: detail.currentRevision.payloadHash,
      p_result: result,
      p_checks: checks,
      p_issues: issues,
      p_validation_snapshot: { platform: detail.plan.platform, destination_host: destinationHost, provider_execution_locked: true },
      p_actor_id: resolveCampaignActorId(requestContext.actorId),
      p_trusted_ip: requestContext.ip || null,
      p_trusted_user_agent: requestContext.userAgent?.trim().slice(0, 1_000) || "m04-readiness",
      p_request_idempotency_key: requestContext.idempotencyKey,
    },
  });
  return getCampaignPlan(planId);
}

export async function approveReadyCampaign(
  planId: number,
  requestContext: { actorId: string; ip?: string | null; userAgent?: string | null; idempotencyKey: string },
): Promise<CampaignPlanDetail> {
  let detail = await getCampaignPlan(planId);
  if (!detail.readiness || detail.readiness.result !== "passed"
    || detail.readiness.revisionId !== detail.currentRevision.id
    || detail.readiness.revisionHash !== detail.currentRevision.payloadHash) {
    throw new CampaignPlanningRepositoryError("Run readiness validation and resolve every check before approval.", 409);
  }
  const config = getLocalSupabaseConfig();
  if (detail.plan.status === "draft") {
    await supabaseRequest<JsonObject[]>(config, "rpc/m04_ads_transition_campaign_plan", {
      method: "POST",
      body: {
        p_plan_id: planId,
        p_expected_lock_version: detail.plan.lockVersion,
        p_expected_from_status: "draft",
        p_to_status: "awaiting_approval",
        p_reason: "Dashboard readiness checks passed; provider execution remains locked.",
        p_actor_id: resolveCampaignActorId(requestContext.actorId),
        p_trusted_ip: requestContext.ip || null,
        p_trusted_user_agent: requestContext.userAgent?.trim().slice(0, 1_000) || "m04-readiness-approval",
      },
    });
    detail = await getCampaignPlan(planId);
  }
  if (detail.plan.status !== "awaiting_approval" && detail.plan.status !== "approved") {
    throw new CampaignPlanningRepositoryError("Campaign is not eligible for readiness approval.", 409);
  }
  await supabaseRequest<JsonObject[]>(config, "rpc/m04_ads_approve_campaign_plan_revision", {
    method: "POST",
    body: {
      p_plan_id: planId,
      p_revision_id: detail.currentRevision.id,
      p_expected_revision_hash: detail.currentRevision.payloadHash,
      p_expected_plan_lock_version: detail.plan.lockVersion,
      p_approval_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      p_request_idempotency_key: requestContext.idempotencyKey,
      p_comment: "Ready for provider integration. Provider execution remains locked.",
      p_actor_id: resolveCampaignActorId(requestContext.actorId),
      p_trusted_ip: requestContext.ip || null,
      p_trusted_user_agent: requestContext.userAgent?.trim().slice(0, 1_000) || "m04-readiness-approval",
    },
  });
  return getCampaignPlan(planId);
}

export async function getCampaignWizardDraft(sessionSubject: string): Promise<CampaignWizardDraft | null> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  const rows = await readRows(getLocalSupabaseConfig(), "m04_ads_campaign_wizard_drafts", {
    select: "platform,current_step,highest_reached_step,form_data,updated_at",
    owner_id: `eq.${ownerId}`,
    limit: "1",
  });
  if (!rows[0]) return null;
  return mapCampaignWizardDraft(rows[0]);
}

export async function upsertCampaignWizardDraft(
  sessionSubject: string,
  input: { platform: CampaignPlatform; current_step: number; highest_reached_step: number; form_data: Record<string, unknown> },
): Promise<CampaignWizardDraft> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  const rows = await supabaseRequest<JsonObject[]>(
    getLocalSupabaseConfig(),
    "m04_ads_campaign_wizard_drafts?on_conflict=owner_id",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        owner_id: ownerId,
        platform: input.platform,
        current_step: input.current_step,
        highest_reached_step: input.highest_reached_step,
        form_data: input.form_data,
        updated_at: new Date().toISOString(),
      },
    },
  );
  if (!rows[0]) throw new CampaignPlanningRepositoryError("CRM08 Supabase did not return the saved wizard draft.", 500);
  return mapCampaignWizardDraft(rows[0]);
}

export async function deleteCampaignWizardDraft(sessionSubject: string): Promise<void> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  await supabaseRequest<unknown>(
    getLocalSupabaseConfig(),
    `m04_ads_campaign_wizard_drafts?owner_id=eq.${ownerId}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
}

export async function getCampaignEditDraft(planId: number, sessionSubject: string): Promise<CampaignEditDraft | null> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  const rows = await readRows(getLocalSupabaseConfig(), "m04_ads_campaign_edit_drafts", {
    select: "plan_id,base_revision_id,base_lock_version,platform,current_step,highest_reached_step,form_data,updated_at",
    owner_id: `eq.${ownerId}`,
    plan_id: `eq.${planId}`,
    limit: "1",
  });
  return rows[0] ? mapCampaignEditDraft(rows[0]) : null;
}

export async function upsertCampaignEditDraft(
  planId: number,
  sessionSubject: string,
  input: { base_revision_id: number; base_lock_version: number; platform: CampaignPlatform; current_step: number; highest_reached_step: number; form_data: Record<string, unknown> },
): Promise<CampaignEditDraft> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  const rows = await supabaseRequest<JsonObject[]>(
    getLocalSupabaseConfig(),
    "m04_ads_campaign_edit_drafts?on_conflict=owner_id,plan_id",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        owner_id: ownerId,
        plan_id: planId,
        ...input,
        updated_at: new Date().toISOString(),
      },
    },
  );
  if (!rows[0]) throw new CampaignPlanningRepositoryError("CRM08 Supabase did not return the saved campaign edit.", 500);
  return mapCampaignEditDraft(rows[0]);
}

export async function deleteCampaignEditDraft(planId: number, sessionSubject: string): Promise<void> {
  const ownerId = resolveCampaignActorId(sessionSubject);
  await supabaseRequest<unknown>(
    getLocalSupabaseConfig(),
    `m04_ads_campaign_edit_drafts?owner_id=eq.${ownerId}&plan_id=eq.${planId}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
}

export function resolveCampaignActorId(sessionSubject: string): string {
  if (isPostgresUuid(sessionSubject)) return sessionSubject;
  if (process.env.NODE_ENV !== "production"
    && process.env.DEV_AUTH_BYPASS === "true"
    && sessionSubject === "local-development-admin") {
    const configuredActorId = process.env.DEV_AUTH_BYPASS_ACTOR_ID?.trim() || CRM08_DEVELOPMENT_ACTOR_ID;
    if (isPostgresUuid(configuredActorId)) return configuredActorId;
  }
  throw new CampaignPlanningRepositoryError("Campaign access requires an approved CRM08 staff identity.", 403);
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
  init: { method: "GET" | "POST" | "DELETE"; body?: JsonObject; prefer?: string },
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
        ...(init.prefer ? { prefer: init.prefer } : {}),
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

function mapCampaignWizardDraft(row: JsonObject): CampaignWizardDraft {
  const platform = platformValue(row.platform);
  const currentStep = numberValue(row.current_step, "wizard current step");
  const highestReachedStep = numberValue(row.highest_reached_step, "wizard highest reached step");
  if (!Number.isInteger(currentStep) || !Number.isInteger(highestReachedStep)
    || currentStep < 0 || currentStep > 4 || highestReachedStep < currentStep || highestReachedStep > 4) {
    throw new CampaignPlanningRepositoryError("Stored campaign wizard progress is invalid.", 500);
  }
  const formData = objectValue(row.form_data) as Partial<CampaignWizardForm>;
  return {
    platform,
    currentStep,
    highestReachedStep,
    formData,
    updatedAt: stringValue(row.updated_at, "wizard update time"),
  };
}

function mapCampaignEditDraft(row: JsonObject): CampaignEditDraft {
  const draft = mapCampaignWizardDraft(row);
  return {
    ...draft,
    planId: numberValue(row.plan_id, "edit draft plan id"),
    baseRevisionId: numberValue(row.base_revision_id, "edit draft base revision id"),
    baseLockVersion: numberValue(row.base_lock_version, "edit draft base lock version"),
  };
}

function mapReadiness(row: JsonObject): CampaignReadinessSnapshot {
  const result = row.result;
  if (result !== "passed" && result !== "failed" && result !== "attention") {
    throw new CampaignPlanningRepositoryError("Stored readiness result is invalid.", 500);
  }
  const rawChecks = Array.isArray(row.checks) ? row.checks : [];
  return {
    id: numberValue(row.id, "readiness id"),
    revisionId: numberValue(row.revision_id, "readiness revision id"),
    revisionHash: stringValue(row.revision_hash, "readiness revision hash"),
    result,
    checks: rawChecks.map((value) => {
      const check = objectValue(value);
      const status = check.status;
      if (status !== "passed" && status !== "failed" && status !== "attention") {
        throw new CampaignPlanningRepositoryError("Stored readiness check status is invalid.", 500);
      }
      return {
        key: stringValue(check.key, "readiness check key"),
        label: stringValue(check.label, "readiness check label"),
        status,
        detail: stringValue(check.detail, "readiness check detail"),
      };
    }),
    issues: Array.isArray(row.issues) ? row.issues.filter((value): value is string => typeof value === "string") : [],
    createdAt: stringValue(row.created_at, "readiness creation time"),
  };
}

function mapAuditEvent(row: JsonObject): CampaignAuditEvent {
  return {
    id: numberValue(row.id, "audit event id"),
    eventType: stringValue(row.event_type, "audit event type"),
    actorName: optionalString(row.actor_name) ?? null,
    createdAt: stringValue(row.created_at, "audit event time"),
  };
}

function readinessCheck(key: string, label: string, passed: boolean, detail: string): CampaignReadinessCheck {
  return { key, label, status: passed ? "passed" : "failed", detail };
}

function destinationHostname(destination: string): string | null {
  try {
    return new URL(destination).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function humanizePlatform(platform: CampaignPlatform): string {
  return platform === "tiktok" ? "TikTok" : platform[0].toUpperCase() + platform.slice(1);
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

function isPostgresUuid(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
}
