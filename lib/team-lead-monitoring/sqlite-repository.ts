import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MonitoringActivity,
  MonitoringItem,
  MonitoringModule,
  MonitoringPriority,
  TeamLeadMonitoringPayload,
} from "@/lib/team-lead-monitoring/types";

type DbValue = string | number | null;
type DbRow = Record<string, DbValue>;

function openDatabase() {
  const path = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  db.exec(readFileSync(resolve("lib/placement-optimization/sqlite-schema.sql"), "utf8"));
  db.exec(readFileSync(resolve("lib/team-lead-monitoring/sqlite-schema.sql"), "utf8"));
  db.exec("pragma foreign_keys = on;");
  return db;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function searchPriority(row: DbRow): MonitoringPriority {
  const spend = Number(row.spend);
  const clicks = Number(row.clicks);
  const conversions = Number(row.conversions);
  if ((spend >= 500 && conversions === 0) || (Number(row.safety_score) >= 90 && spend >= 100)) return "critical";
  if (spend >= 100 || (clicks >= 10 && conversions === 0) || Number(row.safety_score) >= 90) return "high";
  if (spend > 0 || clicks > 0) return "medium";
  return "normal";
}

function placementPriority(row: DbRow): MonitoringPriority {
  const spend = Number(row.spend);
  const clicks = Number(row.clicks);
  const conversions = Number(row.conversions);
  const confidence = Number(row.confidence);
  if ((spend >= 500 || clicks >= 50) && conversions === 0) return "critical";
  if (spend >= 100 || (clicks >= 10 && conversions === 0) || (confidence >= 90 && row.recommended_action === "exclude")) return "high";
  if (spend > 0 || clicks > 0) return "medium";
  return "normal";
}

function escalationMap(db: DatabaseSync) {
  const rows = db.prepare(`select * from ad_automation_workflow_escalations where status='active'`).all() as DbRow[];
  return new Map(rows.map((row) => [`${row.module}:${row.source_id}`, {
    id: String(row.id), note: String(row.note), escalatedByEmail: String(row.escalated_by_email),
    createdAt: String(row.created_at), resolvedAt: null,
  }]));
}

export function loadTeamLeadMonitoring(): TeamLeadMonitoringPayload {
  const db = openDatabase();
  try {
    const escalations = escalationMap(db);
    const searchRows = db.prepare(`
      select rec.id, rec.review_status, rec.current_decision, rec.safety_score, rec.updated_at,
             st.google_customer_id, st.customer_name, st.search_term, st.campaign_name,
             st.spend, st.clicks, st.conversions, st.first_detected_at
      from ad_automation_search_term_recommendations rec
      join ad_automation_search_terms st on st.id=rec.search_term_id
    `).all() as DbRow[];
    const placementRows = db.prepare(`
      select rec.id, rec.review_status, rec.current_decision, rec.confidence, rec.recommended_action, rec.updated_at,
             p.google_customer_id, p.customer_name, p.display_name, p.placement, p.campaign_name,
             p.spend, p.clicks, p.conversions, p.refreshed_at
      from ad_automation_placement_recommendations rec
      join ad_automation_placements p on p.id=rec.placement_id
    `).all() as DbRow[];

    const items: MonitoringItem[] = [
      ...searchRows.map((row): MonitoringItem => ({
        key: `search_term:${row.id}`, module: "search_term", sourceId: String(row.id),
        accountId: String(row.google_customer_id), accountName: String(row.customer_name || row.google_customer_id),
        item: String(row.search_term), campaign: String(row.campaign_name), spend: Number(row.spend),
        conversions: Number(row.conversions), priority: searchPriority(row), status: String(row.review_status),
        statusLabel: statusLabel(String(row.review_status)), lastDecision: row.current_decision ? String(row.current_decision) : null,
        updatedAt: String(row.updated_at), waitingSince: String(row.first_detected_at || row.updated_at),
        href: `/search-term-optimization?googleAccountId=${encodeURIComponent(String(row.google_customer_id))}`,
        escalation: escalations.get(`search_term:${row.id}`) ?? null,
      })),
      ...placementRows.map((row): MonitoringItem => ({
        key: `placement:${row.id}`, module: "placement", sourceId: String(row.id),
        accountId: String(row.google_customer_id), accountName: String(row.customer_name || row.google_customer_id),
        item: String(row.display_name || row.placement), campaign: String(row.campaign_name), spend: Number(row.spend),
        conversions: Number(row.conversions), priority: placementPriority(row), status: String(row.review_status),
        statusLabel: statusLabel(String(row.review_status)), lastDecision: row.current_decision ? String(row.current_decision) : null,
        updatedAt: String(row.updated_at), waitingSince: String(row.refreshed_at || row.updated_at),
        href: `/placement-optimization?googleAccountId=${encodeURIComponent(String(row.google_customer_id))}`,
        escalation: escalations.get(`placement:${row.id}`) ?? null,
      })),
    ];
    const rank: Record<MonitoringPriority, number> = { critical: 0, high: 1, medium: 2, normal: 3 };
    items.sort((a, b) => Number(Boolean(b.escalation)) - Number(Boolean(a.escalation)) || rank[a.priority] - rank[b.priority] || b.spend - a.spend || b.updatedAt.localeCompare(a.updatedAt));
    const pendingFirst = new Set(["pending", "in_review", "pending_optimizer", "returned_for_clarification"]);
    const pendingApproval = new Set(["ready_for_approval"]);
    const approved = new Set(["approved_for_publishing", "ready_for_publishing", "published"]);
    const negative = new Set(["rejected", "approver_rejected", "kept", "excluded"]);
    const failed = new Set(["failed", "verification_failed", "publishing_failed"]);
    const accounts = [...new Map(items.map((item) => [item.accountId, { id: item.accountId, name: item.accountName }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    const failedSearchSets = (db.prepare(`select count(*) count from ad_automation_search_term_change_sets where status in ('failed','cancelled')`).get() as { count: number }).count;
    const failedPlacementSets = (db.prepare(`select count(*) count from ad_automation_placement_change_sets where status in ('failed','cancelled')`).get() as { count: number }).count;
    return {
      summary: {
        pendingFirstReview: items.filter((item) => pendingFirst.has(item.status)).length,
        pendingApproval: items.filter((item) => pendingApproval.has(item.status)).length,
        returned: items.filter((item) => item.status === "returned_for_clarification").length,
        approved: items.filter((item) => approved.has(item.status)).length,
        negativeOrRejected: items.filter((item) => negative.has(item.status)).length,
        escalated: items.filter((item) => item.escalation).length,
        failed: items.filter((item) => failed.has(item.status)).length + Number(failedSearchSets) + Number(failedPlacementSets),
      }, accounts, items, generatedAt: new Date().toISOString(),
    };
  } finally { db.close(); }
}

export function loadMonitoringActivity(input: { offset: number; limit: number }) {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      select * from (
        select 'search_term' module, 'search:' || reviews.id id, st.google_customer_id account_id,
               coalesce(st.customer_name, st.google_customer_id) account_name, st.search_term item,
               reviews.action action, reviews.reviewer_email actor_email, reviews.created_at occurred_at,
               reviews.resulting_status resulting_status
        from ad_automation_search_term_reviews reviews
        join ad_automation_search_term_recommendations rec on rec.id=reviews.recommendation_id
        join ad_automation_search_terms st on st.id=rec.search_term_id
        union all
        select 'placement', 'placement:' || reviews.id, p.google_customer_id,
               coalesce(p.customer_name, p.google_customer_id), coalesce(p.display_name, p.placement),
               reviews.action, reviews.reviewer_email, reviews.created_at, reviews.resulting_status
        from ad_automation_placement_reviews reviews
        join ad_automation_placement_recommendations rec on rec.id=reviews.recommendation_id
        join ad_automation_placements p on p.id=rec.placement_id
        union all
        select 'escalation', 'escalation:' || id, google_customer_id, google_customer_id,
               module || ' #' || source_id, case when status='active' then 'escalated' else 'escalation_resolved' end,
               coalesce(resolved_by_email, escalated_by_email), coalesce(resolved_at, created_at), status
        from ad_automation_workflow_escalations
        union all
        select 'search_term', 'search_set:' || id, google_customer_id, google_customer_id,
               'Change set #' || id, 'change_set_created', approved_by_email, approved_at, status
        from ad_automation_search_term_change_sets
        union all
        select 'placement', 'placement_set:' || id, google_customer_id, google_customer_id,
               'Placement change set #' || id, 'change_set_created', approved_by_email, approved_at, status
        from ad_automation_placement_change_sets
        union all
        select 'placement', 'placement_report:' || id, google_customer_id, customer_name,
               'PM report #' || id, 'pm_report_generated', 'System', generated_at, 'report_ready'
        from ad_automation_placement_pm_reports
      ) order by occurred_at desc limit ? offset ?
    `).all(input.limit, input.offset) as DbRow[];
    const count = db.prepare(`
      select (select count(*) from ad_automation_search_term_reviews) +
             (select count(*) from ad_automation_placement_reviews) +
             (select count(*) from ad_automation_workflow_escalations) +
             (select count(*) from ad_automation_search_term_change_sets) +
             (select count(*) from ad_automation_placement_change_sets) +
             (select count(*) from ad_automation_placement_pm_reports) total
    `).get() as { total: number };
    return { activities: rows.map((row): MonitoringActivity => ({
      id: String(row.id), module: String(row.module) as MonitoringActivity["module"],
      accountId: String(row.account_id), accountName: String(row.account_name), item: String(row.item),
      action: statusLabel(String(row.action)), actorEmail: String(row.actor_email),
      occurredAt: String(row.occurred_at), resultingStatus: statusLabel(String(row.resulting_status)),
    })), total: Number(count.total) };
  } finally { db.close(); }
}

export function createEscalation(input: { module: MonitoringModule; sourceId: number; accountId: string; note: string; actor: { id: string; email: string } }) {
  const db = openDatabase();
  try {
    const existing = db.prepare(`select id from ad_automation_workflow_escalations where module=? and source_id=? and status='active'`).get(input.module, input.sourceId) as { id: number } | undefined;
    if (existing) return { id: String(existing.id), created: false };
    const result = db.prepare(`insert into ad_automation_workflow_escalations (module,source_id,google_customer_id,note,escalated_by_user_id,escalated_by_email) values (?,?,?,?,?,?)`)
      .run(input.module, input.sourceId, input.accountId, input.note.trim(), input.actor.id, input.actor.email);
    return { id: String(result.lastInsertRowid), created: true };
  } finally { db.close(); }
}

export function resolveEscalation(input: { id: number; actor: { id: string; email: string } }) {
  const db = openDatabase();
  try {
    const result = db.prepare(`update ad_automation_workflow_escalations set status='resolved',resolved_at=datetime('now'),resolved_by_user_id=?,resolved_by_email=? where id=? and status='active'`)
      .run(input.actor.id, input.actor.email, input.id);
    return { updated: Number(result.changes) };
  } finally { db.close(); }
}

export function listActiveEscalations(input: { module: MonitoringModule; accountId: string }) {
  const db = openDatabase();
  try {
    return (db.prepare(`select id,source_id,note,escalated_by_email,created_at from ad_automation_workflow_escalations where module=? and google_customer_id=? and status='active' order by created_at desc`)
      .all(input.module, input.accountId) as DbRow[]).map((row) => ({
        id: String(row.id), sourceId: String(row.source_id), note: String(row.note),
        escalatedByEmail: String(row.escalated_by_email), createdAt: String(row.created_at),
      }));
  } finally { db.close(); }
}
