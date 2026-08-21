import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CampaignAccountOption,
  CampaignActor,
  CampaignAuditEvent,
  CampaignBuild,
  CampaignGateAttempt,
  CampaignHandoff,
  CampaignPackageOption,
  CampaignPlanActionInput,
  CampaignPlanDetail,
  CampaignPlanningListPayload,
  CampaignPlanSummary,
  CampaignQaResult,
  CampaignResource,
  CampaignRevision,
  CreateCampaignPlanInput,
} from "@/lib/campaign-planning/types";

type DbValue = string | number | null;
type DbRow = Record<string, DbValue>;

const LOCAL_META = { mode: "local-model", providerWrites: false } as const;
const SEED_ACTOR: CampaignActor = { id: "local-seed", email: "local-model@locus-t.com.my" };

export class CampaignLocalModelError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "CampaignLocalModelError";
  }
}

function openDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new CampaignLocalModelError("The M04 local model is unavailable in production.", 403);
  }
  const file = resolve(/* turbopackIgnore: true */ process.env.M04_SQLITE_PATH || "data/m04-local.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma foreign_keys = on;");
  db.exec(readFileSync(resolve("lib/campaign-planning/sqlite-schema.sql"), "utf8"));
  seedLocalModel(db);
  return db;
}

function withTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("begin immediate;");
  try {
    const result = operation();
    db.exec("commit;");
    return result;
  } catch (error) {
    db.exec("rollback;");
    throw error;
  }
}

function now() {
  return new Date().toISOString();
}

function addDays(timestamp: string, days: number) {
  const value = new Date(timestamp);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function parseJson<T>(value: DbValue, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function hashJson(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function activeDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new CampaignLocalModelError("Campaign flight dates are invalid.");
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}

function dailyBudget(allocationMicros: number, days: number, platform: CreateCampaignPlanInput["platform"]) {
  const increment = platform === "tiktok" ? 100_000 : 10_000;
  const rounded = Math.floor(allocationMicros / days / increment) * increment;
  if (rounded < increment) throw new CampaignLocalModelError("The allocation is too small for the campaign flight.");
  return rounded;
}

function seedLocalModel(db: DatabaseSync) {
  const seeded = db.prepare("select key from m04_local_seed_state where key='v1'").get();
  if (seeded) return;

  withTransaction(db, () => {
    const accounts = [
      [1, "Northstar Retail", "google", "mock-google-1001", "Northstar Google Ads", "MYR", "Asia/Kuala_Lumpur"],
      [2, "Harbor Homes", "meta", "mock-meta-2001", "Harbor Meta Ads", "MYR", "Asia/Kuala_Lumpur"],
      [3, "BrightPath Learning", "tiktok", "mock-tiktok-3001", "BrightPath TikTok Ads", "SGD", "Asia/Singapore"],
      [4, "Northstar Retail", "google", "mock-google-1002", "Northstar PMax", "MYR", "Asia/Kuala_Lumpur"],
    ] as const;
    const insertAccount = db.prepare(`insert into m04_local_ad_accounts
      (id,client_name,platform,provider_account_id,account_name,currency,timezone) values (?,?,?,?,?,?,?)`);
    for (const account of accounts) insertAccount.run(...account);

    const packages = [
      [1, "Northstar Retail", "northstar-q3", "Northstar Q3 Growth", "MYR", "2026-08-01", "2026-10-31", 80_000_000_000],
      [2, "Harbor Homes", "harbor-launch", "Harbor Website Leads", "MYR", "2026-08-01", "2026-09-30", 45_000_000_000],
      [3, "BrightPath Learning", "brightpath-aug", "BrightPath August", "SGD", "2026-08-01", "2026-09-15", 30_000_000_000],
    ] as const;
    const insertPackage = db.prepare(`insert into m04_local_budget_packages
      (id,client_name,package_key,name,currency,start_date,end_date,envelope_micros) values (?,?,?,?,?,?,?,?)`);
    for (const item of packages) insertPackage.run(...item);

    const draft = createPlanRows(db, {
      clientName: "Northstar Retail", platform: "google", accountId: 1, packageId: 1,
      campaignName: "Northstar Search — Brand", objective: "Leads", destination: "https://northstar.example/contact",
      startDate: "2026-08-25", endDate: "2026-09-30", allocationMicros: 12_000_000_000,
    }, SEED_ACTOR);

    const awaiting = createPlanRows(db, {
      clientName: "Harbor Homes", platform: "meta", accountId: 2, packageId: 2,
      campaignName: "Harbor Website Leads", objective: "Leads", destination: "https://harbor.example/enquire",
      startDate: "2026-08-24", endDate: "2026-09-20", allocationMicros: 9_500_000_000,
    }, SEED_ACTOR);
    applyActionRows(db, awaiting, { action: "submit", lockVersion: 0 }, SEED_ACTOR);

    const ready = createPlanRows(db, {
      clientName: "BrightPath Learning", platform: "tiktok", accountId: 3, packageId: 3,
      campaignName: "BrightPath Course Discovery", objective: "Traffic", destination: "https://brightpath.example/courses",
      startDate: "2026-08-23", endDate: "2026-09-15", allocationMicros: 7_200_000_000,
    }, SEED_ACTOR);
    applyActionRows(db, ready, { action: "submit", lockVersion: 0 }, SEED_ACTOR);
    applyActionRows(db, ready, { action: "approve", lockVersion: 1 }, SEED_ACTOR);
    applyActionRows(db, ready, { action: "simulate_gate_1", lockVersion: 2 }, SEED_ACTOR);

    const launched = createPlanRows(db, {
      clientName: "Northstar Retail", platform: "google", accountId: 4, packageId: 1,
      campaignName: "Northstar Performance Max", objective: "Sales", destination: "https://northstar.example/shop",
      startDate: "2026-08-20", endDate: "2026-09-30", allocationMicros: 18_000_000_000,
    }, SEED_ACTOR);
    applyActionRows(db, launched, { action: "submit", lockVersion: 0 }, SEED_ACTOR);
    applyActionRows(db, launched, { action: "approve", lockVersion: 1 }, SEED_ACTOR);
    applyActionRows(db, launched, { action: "simulate_gate_1", lockVersion: 2 }, SEED_ACTOR);
    applyActionRows(db, launched, { action: "simulate_gate_2", lockVersion: 3 }, SEED_ACTOR);
    applyActionRows(db, launched, { action: "create_handoff", lockVersion: 4 }, SEED_ACTOR);

    db.prepare("insert into m04_local_seed_state (key,seeded_at) values ('v1',?)").run(now());
    void draft;
  });
}

function createPlanRows(db: DatabaseSync, input: CreateCampaignPlanInput, actor: CampaignActor) {
  const account = db.prepare("select * from m04_local_ad_accounts where id=? and is_active=1 and access_status='verified'").get(input.accountId) as DbRow | undefined;
  const budgetPackage = db.prepare("select * from m04_local_budget_packages where id=? and status='active'").get(input.packageId) as DbRow | undefined;
  if (!account) throw new CampaignLocalModelError("The selected local ad account is unavailable.");
  if (!budgetPackage) throw new CampaignLocalModelError("The selected local budget package is unavailable.");
  if (account.platform !== input.platform) throw new CampaignLocalModelError("The selected account does not match the platform.");
  if (account.client_name !== input.clientName || budgetPackage.client_name !== input.clientName) throw new CampaignLocalModelError("The client, account, and package must match.");
  if (account.currency !== budgetPackage.currency) throw new CampaignLocalModelError("The account and package currencies must match.");
  if (input.startDate < String(budgetPackage.start_date) || input.endDate > String(budgetPackage.end_date)) throw new CampaignLocalModelError("The campaign flight must remain inside the package flight.");
  if (!Number.isInteger(input.allocationMicros) || input.allocationMicros <= 0) throw new CampaignLocalModelError("The allocation must be a positive integer amount.");

  const days = activeDays(input.startDate, input.endDate);
  const recommendedDaily = dailyBudget(input.allocationMicros, days, input.platform);
  const projectedTotal = recommendedDaily * days;
  const timestamp = now();
  const planResult = db.prepare(`insert into m04_local_campaign_plans
    (client_name,package_id,account_id,platform,status,created_by,created_at,updated_at)
    values (?,?,?,?,?,?,?,?)`).run(input.clientName, input.packageId, input.accountId, input.platform, "draft", actor.email, timestamp, timestamp);
  const planId = Number(planResult.lastInsertRowid);
  const payload = {
    schema: "m04.local-plan.v1", campaign_name: input.campaignName, platform: input.platform,
    objective: input.objective, destination: input.destination, start_date: input.startDate,
    end_date: input.endDate, allocation_micros: input.allocationMicros,
    daily_budget_micros: recommendedDaily, projected_total_micros: projectedTotal,
    mock: true,
  };
  const revisionHash = hashJson(payload);
  const revisionResult = db.prepare(`insert into m04_local_campaign_plan_revisions
    (plan_id,revision_no,campaign_name,start_date,end_date,allocation_micros,daily_budget_micros,projected_total_micros,
     objective,destination,payload_json,canonical_json,revision_hash,author_email,created_at)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      planId, 1, input.campaignName, input.startDate, input.endDate, input.allocationMicros, recommendedDaily,
      projectedTotal, input.objective, input.destination, JSON.stringify(payload), JSON.stringify(payload), revisionHash,
      actor.email, timestamp,
    );
  const revisionId = Number(revisionResult.lastInsertRowid);
  db.prepare("update m04_local_campaign_plans set active_revision_id=? where id=?").run(revisionId, planId);
  appendAudit(db, planId, null, "plan_created", null, "draft", actor, { revisionId, localOnly: true });
  return planId;
}

function appendAudit(
  db: DatabaseSync,
  planId: number,
  buildId: number | null,
  eventType: string,
  fromStatus: string | null,
  toStatus: string | null,
  actor: CampaignActor,
  metadata: Record<string, unknown>,
) {
  db.prepare(`insert into m04_local_campaign_audit_events
    (plan_id,build_id,event_type,from_status,to_status,actor_id,actor_email,metadata_json,created_at)
    values (?,?,?,?,?,?,?,?,?)`).run(planId, buildId, eventType, fromStatus, toStatus, actor.id, actor.email, JSON.stringify(metadata), now());
}

function currentPlanContext(db: DatabaseSync, planId: number) {
  const row = db.prepare(`select plan.*, revision.revision_no, revision.campaign_name, revision.start_date, revision.end_date,
      revision.allocation_micros, revision.daily_budget_micros, revision.projected_total_micros, revision.objective,
      revision.destination, revision.payload_json, revision.canonical_json, revision.revision_hash,
      account.currency, account.account_name, package.name package_name, package.envelope_micros, package.committed_micros
    from m04_local_campaign_plans plan
    join m04_local_campaign_plan_revisions revision on revision.id=plan.active_revision_id
    join m04_local_ad_accounts account on account.id=plan.account_id
    join m04_local_budget_packages package on package.id=plan.package_id
    where plan.id=?`).get(planId) as DbRow | undefined;
  if (!row) throw new CampaignLocalModelError("Campaign plan not found.", 404);
  return row;
}

function applyActionRows(db: DatabaseSync, planId: number, input: CampaignPlanActionInput, actor: CampaignActor) {
  const plan = currentPlanContext(db, planId);
  if (Number(plan.lock_version) !== input.lockVersion) throw new CampaignLocalModelError("This campaign changed. Refresh before continuing.", 409);
  const timestamp = now();

  if (input.action === "save_revision") {
    if (plan.status !== "draft") throw new CampaignLocalModelError("Only a draft can receive a new local revision.", 409);
    const nextNo = Number(plan.revision_no) + 1;
    const revision = db.prepare(`insert into m04_local_campaign_plan_revisions
      (plan_id,revision_no,campaign_name,start_date,end_date,allocation_micros,daily_budget_micros,projected_total_micros,
       objective,destination,payload_json,canonical_json,revision_hash,author_email,created_at)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        planId, nextNo, plan.campaign_name, plan.start_date, plan.end_date, plan.allocation_micros,
        plan.daily_budget_micros, plan.projected_total_micros, plan.objective, plan.destination,
        plan.payload_json, plan.canonical_json, plan.revision_hash, actor.email, timestamp,
      );
    db.prepare("update m04_local_campaign_plans set active_revision_id=?,lock_version=lock_version+1,updated_at=? where id=?").run(Number(revision.lastInsertRowid), timestamp, planId);
    appendAudit(db, planId, null, "revision_saved", "draft", "draft", actor, { revisionNo: nextNo });
    return;
  }

  if (input.action === "submit") {
    if (plan.status !== "draft") throw new CampaignLocalModelError("Only a draft can be submitted.", 409);
    const available = Number(plan.envelope_micros) - Number(plan.committed_micros);
    if (Number(plan.allocation_micros) > available) throw new CampaignLocalModelError("The package does not have enough remaining allocation.", 409);
    db.prepare("update m04_local_budget_packages set committed_micros=committed_micros+?,lock_version=lock_version+1 where id=?").run(plan.allocation_micros, plan.package_id);
    db.prepare("update m04_local_campaign_plans set reserved_micros=?,status='awaiting_approval',lock_version=lock_version+1,updated_at=? where id=?").run(plan.allocation_micros, timestamp, planId);
    appendAudit(db, planId, null, "plan_submitted", "draft", "awaiting_approval", actor, { allocationMicros: plan.allocation_micros });
    return;
  }

  if (input.action === "approve") {
    if (plan.status !== "awaiting_approval") throw new CampaignLocalModelError("Only a submitted plan can be approved.", 409);
    const approval = db.prepare(`insert into m04_local_campaign_approvals
      (plan_id,revision_id,revision_hash,decision,comment,approved_by_email,approved_at,expires_at)
      values (?,?,?,?,?,?,?,?)`).run(planId, plan.active_revision_id, plan.revision_hash, "approved", "Approved in local model", actor.email, timestamp, addDays(timestamp, 7));
    const build = db.prepare(`insert into m04_local_campaign_builds
      (plan_id,revision_id,revision_hash,approval_id,package_id,account_id,platform,status,created_at,updated_at)
      values (?,?,?,?,?,?,?,'pending_gate_1',?,?)`).run(planId, plan.active_revision_id, plan.revision_hash, Number(approval.lastInsertRowid), plan.package_id, plan.account_id, plan.platform, timestamp, timestamp);
    db.prepare("update m04_local_campaign_plans set approved_revision_id=active_revision_id,approved_hash=?,status='approved',lock_version=lock_version+1,updated_at=? where id=?").run(plan.revision_hash, timestamp, planId);
    appendAudit(db, planId, Number(build.lastInsertRowid), "revision_approved", "awaiting_approval", "approved", actor, { mock: true });
    return;
  }

  const build = db.prepare("select * from m04_local_campaign_builds where plan_id=?").get(planId) as DbRow | undefined;
  if (!build) throw new CampaignLocalModelError("This plan has no local build.", 409);

  if (input.action === "simulate_gate_1") {
    if (plan.status !== "approved" || build.status !== "pending_gate_1") throw new CampaignLocalModelError("Gate 1 simulation requires an approved plan.", 409);
    const definitions = resourceDefinitions(String(plan.platform), String(plan.campaign_name));
    const intent = { resources: definitions.map(({ key, type }) => ({ logical_resource_key: key, resource_type: type })) };
    const attempt = db.prepare(`insert into m04_local_campaign_gate_attempts
      (build_id,gate,action,status,intent_json,outcome_json,actor_email,started_at,completed_at)
      values (?,1,'create','succeeded',?,?,?,?,?)`).run(build.id, JSON.stringify(intent), JSON.stringify({ localSimulation: true, created: definitions.length }), actor.email, timestamp, timestamp);
    const attemptId = Number(attempt.lastInsertRowid);
    let parentId: string | null = null;
    for (const definition of definitions) {
      const providerId = `mock-${plan.platform}-${definition.type}-${randomUUID().slice(0, 8)}`;
      const resource = db.prepare(`insert into m04_local_campaign_build_resources
        (build_id,logical_resource_key,resource_type,provider_resource_id,provider_parent_resource_id,provider_response_json)
        values (?,?,?,?,?,?)`).run(build.id, definition.key, definition.type, providerId, parentId, JSON.stringify({ localSimulation: true }));
      db.prepare(`insert into m04_local_campaign_qa_results
        (attempt_id,resource_id,gate,field_path,expected_json,observed_json,result,evidence_json,created_at)
        values (?,?,1,'delivery.status',?,?, 'match', ?,?)`).run(attemptId, Number(resource.lastInsertRowid), JSON.stringify(gate1Status(String(plan.platform))), JSON.stringify(gate1Status(String(plan.platform))), JSON.stringify({ source: "local-model" }), timestamp);
      parentId = providerId;
    }
    db.prepare("update m04_local_campaign_builds set status='ready_to_deliver',gate_1_completed_at=?,lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, timestamp, build.id);
    db.prepare("update m04_local_campaign_plans set status='launch_in_progress',lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, planId);
    appendAudit(db, planId, Number(build.id), "gate_1_simulated", "approved", "launch_in_progress", actor, { providerWrites: false, resources: definitions.length });
    return;
  }

  if (input.action === "simulate_gate_2") {
    if (plan.status !== "launch_in_progress" || build.status !== "ready_to_deliver") throw new CampaignLocalModelError("Gate 2 simulation requires completed local Gate 1 QA.", 409);
    const resources = db.prepare("select * from m04_local_campaign_build_resources where build_id=? order by id").all(build.id) as DbRow[];
    const intent = { schema: "m04.gate2.v1", platform: plan.platform, delivery: { mode: "activate_now" }, resources: resources.map((resource) => ({ logical_resource_key: resource.logical_resource_key, resource_type: resource.resource_type, required_fields: { "delivery.status": gate2Status(String(plan.platform)) } })) };
    const attempt = db.prepare(`insert into m04_local_campaign_gate_attempts
      (build_id,gate,action,status,intent_json,outcome_json,actor_email,started_at,completed_at)
      values (?,2,'deliver','succeeded',?,?,?,?,?)`).run(build.id, JSON.stringify(intent), JSON.stringify({ localSimulation: true }), actor.email, timestamp, timestamp);
    for (const resource of resources) {
      db.prepare(`insert into m04_local_campaign_qa_results
        (attempt_id,resource_id,gate,field_path,expected_json,observed_json,result,evidence_json,created_at)
        values (?,?,2,'delivery.status',?,?, 'match', ?,?)`).run(Number(attempt.lastInsertRowid), resource.id, JSON.stringify(gate2Status(String(plan.platform))), JSON.stringify(gate2Status(String(plan.platform))), JSON.stringify({ source: "local-model" }), timestamp);
    }
    db.prepare("update m04_local_campaign_build_resources set verified_at=? where build_id=?").run(timestamp, build.id);
    db.prepare("update m04_local_campaign_builds set status='verified',gate_2_completed_at=?,verified_at=?,lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, timestamp, timestamp, build.id);
    db.prepare("update m04_local_campaign_plans set lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, planId);
    appendAudit(db, planId, Number(build.id), "gate_2_simulated", "launch_in_progress", "launch_in_progress", actor, { providerWrites: false });
    return;
  }

  if (input.action === "create_handoff") {
    if (plan.status !== "launch_in_progress" || build.status !== "verified") throw new CampaignLocalModelError("A verified local build is required before handoff.", 409);
    const resources = db.prepare("select * from m04_local_campaign_build_resources where build_id=? order by logical_resource_key").all(build.id) as DbRow[];
    const campaign = resources.find((resource) => resource.resource_type === "campaign");
    if (!campaign?.provider_resource_id) throw new CampaignLocalModelError("The local build has no campaign resource.", 409);
    const children = resources.filter((resource) => resource.resource_type !== "campaign").map((resource) => String(resource.provider_resource_id));
    db.prepare(`insert into m04_local_campaign_monitoring_handoffs
      (build_id,plan_id,revision_id,provider_campaign_id,provider_child_ids_json,evidence_json,created_at)
      values (?,?,?,?,?,?,?)`).run(build.id, planId, plan.active_revision_id, campaign.provider_resource_id, JSON.stringify(children), JSON.stringify({ localSimulation: true, verifiedAt: build.verified_at }), timestamp);
    db.prepare("update m04_local_campaign_builds set status='handoff_complete',lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, build.id);
    db.prepare("update m04_local_campaign_plans set status='launched',lock_version=lock_version+1,updated_at=? where id=?").run(timestamp, planId);
    appendAudit(db, planId, Number(build.id), "monitoring_handoff_created", "launch_in_progress", "launched", actor, { providerWrites: false });
    return;
  }

  throw new CampaignLocalModelError("Unsupported local campaign action.");
}

function resourceDefinitions(platform: string, campaignName: string) {
  if (platform === "meta") return [
    { key: "campaign:main", type: "campaign" }, { key: "ad-set:prospecting", type: "ad_set" }, { key: "ad:primary", type: "ad" },
  ];
  if (platform === "tiktok") return [
    { key: "campaign:main", type: "campaign" }, { key: "ad-group:prospecting", type: "ad_group" }, { key: "ad:primary", type: "ad" },
  ];
  if (campaignName.toLowerCase().includes("performance max")) return [
    { key: "campaign:main", type: "campaign" }, { key: "asset-group:main", type: "asset_group" }, { key: "asset:primary", type: "asset" },
  ];
  return [
    { key: "campaign:main", type: "campaign" }, { key: "ad-group:main", type: "ad_group" }, { key: "ad:primary", type: "ad" },
  ];
}

function gate1Status(platform: string) {
  return platform === "google" ? "PAUSED" : platform === "meta" ? "OFF" : "DISABLED";
}

function gate2Status(platform: string) {
  return platform === "google" ? "ENABLED" : platform === "meta" ? "ACTIVE" : "ENABLE";
}

function mapRevision(row: DbRow): CampaignRevision {
  return {
    id: Number(row.id), revisionNo: Number(row.revision_no), campaignName: String(row.campaign_name),
    startDate: String(row.start_date), endDate: String(row.end_date), allocationMicros: Number(row.allocation_micros),
    dailyBudgetMicros: Number(row.daily_budget_micros), projectedTotalMicros: Number(row.projected_total_micros),
    objective: String(row.objective), destination: String(row.destination), payload: parseJson(row.payload_json, {}),
    hash: String(row.revision_hash), authorEmail: String(row.author_email), createdAt: String(row.created_at),
  };
}

function listCampaignPlansFromDatabase(db: DatabaseSync): CampaignPlanningListPayload {
  const campaigns = (db.prepare(`select plan.id, plan.client_name, plan.platform, plan.status, plan.lock_version, plan.updated_at,
      revision.campaign_name, revision.start_date, revision.end_date, revision.allocation_micros, revision.objective,
      account.account_name, account.currency, package.name package_name, build.status build_status
    from m04_local_campaign_plans plan
    join m04_local_campaign_plan_revisions revision on revision.id=plan.active_revision_id
    join m04_local_ad_accounts account on account.id=plan.account_id
    join m04_local_budget_packages package on package.id=plan.package_id
    left join m04_local_campaign_builds build on build.plan_id=plan.id
    order by plan.updated_at desc, plan.id desc`).all() as DbRow[]).map((row): CampaignPlanSummary => ({
      id: Number(row.id), campaignName: String(row.campaign_name), clientName: String(row.client_name),
      platform: String(row.platform) as CampaignPlanSummary["platform"], accountName: String(row.account_name),
      packageName: String(row.package_name), currency: String(row.currency), allocationMicros: Number(row.allocation_micros),
      startDate: String(row.start_date), endDate: String(row.end_date), objective: String(row.objective),
      status: String(row.status) as CampaignPlanSummary["status"], buildStatus: row.build_status ? String(row.build_status) as CampaignPlanSummary["buildStatus"] : null,
      lockVersion: Number(row.lock_version), updatedAt: String(row.updated_at),
    }));
  const accounts = (db.prepare("select * from m04_local_ad_accounts where is_active=1 order by client_name,account_name").all() as DbRow[]).map((row): CampaignAccountOption => ({
    id: Number(row.id), clientName: String(row.client_name), platform: String(row.platform) as CampaignAccountOption["platform"],
    providerAccountId: String(row.provider_account_id), accountName: String(row.account_name), currency: String(row.currency), timezone: String(row.timezone),
  }));
  const packages = (db.prepare("select * from m04_local_budget_packages where status='active' order by client_name,name").all() as DbRow[]).map((row): CampaignPackageOption => ({
    id: Number(row.id), clientName: String(row.client_name), name: String(row.name), currency: String(row.currency),
    startDate: String(row.start_date), endDate: String(row.end_date), envelopeMicros: Number(row.envelope_micros),
    committedMicros: Number(row.committed_micros), remainingMicros: Number(row.envelope_micros) - Number(row.committed_micros),
  }));
  return {
    ...LOCAL_META,
    summary: {
      total: campaigns.length, draft: campaigns.filter((item) => item.status === "draft").length,
      awaitingApproval: campaigns.filter((item) => item.status === "awaiting_approval").length,
      approvedOrLaunching: campaigns.filter((item) => item.status === "approved" || item.status === "launch_in_progress").length,
      launched: campaigns.filter((item) => item.status === "launched").length,
    },
    accounts, packages, campaigns, generatedAt: now(),
  };
}

function getCampaignPlanFromDatabase(db: DatabaseSync, planId: number): CampaignPlanDetail | null {
  const plan = db.prepare(`select plan.*, revision.campaign_name, revision.start_date, revision.end_date,
      revision.allocation_micros, revision.objective, revision.destination, account.account_name, account.currency,
      package.name package_name, build.status build_status
    from m04_local_campaign_plans plan
    join m04_local_campaign_plan_revisions revision on revision.id=plan.active_revision_id
    join m04_local_ad_accounts account on account.id=plan.account_id
    join m04_local_budget_packages package on package.id=plan.package_id
    left join m04_local_campaign_builds build on build.plan_id=plan.id where plan.id=?`).get(planId) as DbRow | undefined;
  if (!plan) return null;
  const revisionRows = db.prepare("select * from m04_local_campaign_plan_revisions where plan_id=? order by revision_no desc").all(planId) as DbRow[];
  const approval = db.prepare("select * from m04_local_campaign_approvals where plan_id=? order by id desc limit 1").get(planId) as DbRow | undefined;
  const build = db.prepare("select * from m04_local_campaign_builds where plan_id=?").get(planId) as DbRow | undefined;
  const buildId = build ? Number(build.id) : -1;
  const resources = build ? db.prepare("select * from m04_local_campaign_build_resources where build_id=? order by id").all(buildId) as DbRow[] : [];
  const attempts = build ? db.prepare("select * from m04_local_campaign_gate_attempts where build_id=? order by id").all(buildId) as DbRow[] : [];
  const qa = build ? db.prepare(`select qa.*, attempt.gate, resource.logical_resource_key
    from m04_local_campaign_qa_results qa
    join m04_local_campaign_gate_attempts attempt on attempt.id=qa.attempt_id
    join m04_local_campaign_build_resources resource on resource.id=qa.resource_id
    where attempt.build_id=? order by qa.id`).all(buildId) as DbRow[] : [];
  const audits = db.prepare("select * from m04_local_campaign_audit_events where plan_id=? order by id desc").all(planId) as DbRow[];
  const handoff = build ? db.prepare("select * from m04_local_campaign_monitoring_handoffs where build_id=?").get(buildId) as DbRow | undefined : undefined;
  const currentRevision = mapRevision(revisionRows.find((row) => Number(row.id) === Number(plan.active_revision_id)) ?? revisionRows[0]);
  return {
    ...LOCAL_META,
    plan: {
      id: Number(plan.id), campaignName: String(plan.campaign_name), clientName: String(plan.client_name),
      platform: String(plan.platform) as CampaignPlanSummary["platform"], accountName: String(plan.account_name),
      packageName: String(plan.package_name), currency: String(plan.currency), allocationMicros: Number(plan.allocation_micros),
      startDate: String(plan.start_date), endDate: String(plan.end_date), objective: String(plan.objective),
      status: String(plan.status) as CampaignPlanSummary["status"], buildStatus: plan.build_status ? String(plan.build_status) as CampaignPlanSummary["buildStatus"] : null,
      lockVersion: Number(plan.lock_version), updatedAt: String(plan.updated_at), accountId: Number(plan.account_id),
      packageId: Number(plan.package_id), destination: String(plan.destination), createdBy: String(plan.created_by), createdAt: String(plan.created_at),
    },
    currentRevision,
    revisions: revisionRows.map(mapRevision),
    approval: approval ? {
      id: Number(approval.id), revisionId: Number(approval.revision_id), revisionHash: String(approval.revision_hash),
      decision: String(approval.decision), comment: String(approval.comment), approvedByEmail: String(approval.approved_by_email),
      approvedAt: String(approval.approved_at), expiresAt: String(approval.expires_at),
    } : null,
    build: build ? {
      id: Number(build.id), status: String(build.status) as NonNullable<CampaignBuild>["status"],
      gate1CompletedAt: build.gate_1_completed_at ? String(build.gate_1_completed_at) : null,
      gate2CompletedAt: build.gate_2_completed_at ? String(build.gate_2_completed_at) : null,
      verifiedAt: build.verified_at ? String(build.verified_at) : null, lockVersion: Number(build.lock_version),
    } : null,
    resources: resources.map((row): CampaignResource => ({
      id: Number(row.id), logicalResourceKey: String(row.logical_resource_key), resourceType: String(row.resource_type),
      providerResourceId: row.provider_resource_id ? String(row.provider_resource_id) : null,
      providerParentResourceId: row.provider_parent_resource_id ? String(row.provider_parent_resource_id) : null,
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
    })),
    attempts: attempts.map((row): CampaignGateAttempt => ({
      id: Number(row.id), gate: Number(row.gate), action: String(row.action), status: String(row.status),
      intent: parseJson(row.intent_json, {}), outcome: parseJson(row.outcome_json, {}), startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
    })),
    qaResults: qa.map((row): CampaignQaResult => ({
      id: Number(row.id), gate: Number(row.gate), resourceKey: String(row.logical_resource_key), fieldPath: String(row.field_path),
      expected: parseJson(row.expected_json, null), observed: parseJson(row.observed_json, null), result: String(row.result),
      evidence: parseJson(row.evidence_json, {}), createdAt: String(row.created_at),
    })),
    auditEvents: audits.map((row): CampaignAuditEvent => ({
      id: Number(row.id), eventType: String(row.event_type), fromStatus: row.from_status ? String(row.from_status) : null,
      toStatus: row.to_status ? String(row.to_status) : null, actorEmail: String(row.actor_email), metadata: parseJson(row.metadata_json, {}),
      createdAt: String(row.created_at),
    })),
    handoff: handoff ? {
      id: Number(handoff.id), providerCampaignId: String(handoff.provider_campaign_id),
      providerChildIds: parseJson<string[]>(handoff.provider_child_ids_json, []), evidence: parseJson(handoff.evidence_json, {}),
      createdAt: String(handoff.created_at),
    } : null,
  };
}

export function listCampaignPlans() {
  const db = openDatabase();
  try { return listCampaignPlansFromDatabase(db); }
  finally { db.close(); }
}

export function getCampaignPlan(planId: number) {
  const db = openDatabase();
  try { return getCampaignPlanFromDatabase(db, planId); }
  finally { db.close(); }
}

export function createCampaignPlan(input: CreateCampaignPlanInput, actor: CampaignActor) {
  const db = openDatabase();
  try {
    const planId = withTransaction(db, () => createPlanRows(db, input, actor));
    const detail = getCampaignPlanFromDatabase(db, planId);
    if (!detail) throw new CampaignLocalModelError("The local campaign could not be read after creation.", 500);
    return detail;
  } finally { db.close(); }
}

export function applyCampaignPlanAction(planId: number, input: CampaignPlanActionInput, actor: CampaignActor) {
  const db = openDatabase();
  try {
    withTransaction(db, () => applyActionRows(db, planId, input, actor));
    const detail = getCampaignPlanFromDatabase(db, planId);
    if (!detail) throw new CampaignLocalModelError("The local campaign could not be read after the action.", 500);
    return detail;
  } finally { db.close(); }
}
