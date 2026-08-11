import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { GooglePlacementPerformanceRow } from "@/lib/reporting/google";
import type { PlacementApproverDecision, PlacementDashboardPayload, PlacementDecision, PlacementOptimizationRow, PlacementReviewEvent } from "@/lib/placement-optimization/types";

type Analysis = { classification: string; recommendedAction: PlacementDecision; confidence: number; reason: string; confirmationRequired: boolean; aiStatus: "generated" | "rules_fallback" | "not_required" };

function openDatabase() {
  const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/placement-optimization/sqlite-schema.sql"), "utf8"));
  const placementColumns = database.prepare("PRAGMA table_info(ad_automation_placements)").all() as Array<{ name: string }>;
  if (!placementColumns.some((column) => column.name === "source_view")) {
    database.exec("ALTER TABLE ad_automation_placements ADD COLUMN source_view TEXT NOT NULL DEFAULT 'detail_placement_view';");
  }
  const reviewTable = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ad_automation_placement_reviews'").get() as { sql?: string } | undefined;
  if (reviewTable?.sql?.includes("UNIQUE(recommendation_id")) {
    database.exec(`
      ALTER TABLE ad_automation_placement_reviews RENAME TO legacy_placement_reviews;
      CREATE TABLE ad_automation_placement_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommendation_id INTEGER NOT NULL REFERENCES ad_automation_placement_recommendations(id) ON DELETE CASCADE,
        reviewer_user_id TEXT NOT NULL,
        reviewer_email TEXT NOT NULL,
        reviewer_role TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_status TEXT,
        resulting_status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO ad_automation_placement_reviews SELECT * FROM legacy_placement_reviews;
      DROP TABLE legacy_placement_reviews;
      CREATE INDEX IF NOT EXISTS placement_review_recommendation_idx ON ad_automation_placement_reviews(recommendation_id);
    `);
  }
  database.exec("pragma foreign_keys = on;");
  return database;
}

export function persistPlacements(input: { customerId: string; customerName: string; startDate: string; endDate: string; refreshedAt: string; rows: Array<GooglePlacementPerformanceRow & { analysis: Analysis }> }) {
  const db = openDatabase();
  try {
    const upsertPlacement = db.prepare(`
      INSERT INTO ad_automation_placements (google_customer_id,customer_name,source_resource_name,source_view,placement,display_name,placement_type,target_url,campaign_name,ad_group_name,impressions,clicks,spend,conversions,video_views,start_date,end_date,refreshed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(google_customer_id,source_resource_name,start_date,end_date) DO UPDATE SET customer_name=excluded.customer_name,source_view=excluded.source_view,placement=excluded.placement,display_name=excluded.display_name,placement_type=excluded.placement_type,target_url=excluded.target_url,campaign_name=excluded.campaign_name,ad_group_name=excluded.ad_group_name,impressions=excluded.impressions,clicks=excluded.clicks,spend=excluded.spend,conversions=excluded.conversions,video_views=excluded.video_views,refreshed_at=excluded.refreshed_at
      RETURNING id
    `);
    const upsertRecommendation = db.prepare(`
      INSERT INTO ad_automation_placement_recommendations (placement_id,classification,recommended_action,confidence,reason,confirmation_required,ai_status)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(placement_id) DO UPDATE SET classification=excluded.classification,recommended_action=excluded.recommended_action,confidence=excluded.confidence,reason=excluded.reason,confirmation_required=excluded.confirmation_required,ai_status=excluded.ai_status,updated_at=datetime('now')
    `);
    db.exec("begin immediate;");
    for (const row of input.rows) {
      const saved = upsertPlacement.get(input.customerId,input.customerName,row.resourceName,row.sourceView ?? "performance_max_placement_view",row.placement,row.displayName,row.placementType,row.targetUrl,row.campaignName,row.adGroupName,row.impressions,row.clicks,row.spend,row.conversions,row.videoViews,input.startDate,input.endDate,input.refreshedAt) as { id: number };
      upsertRecommendation.run(saved.id,row.analysis.classification,row.analysis.recommendedAction,row.analysis.confidence,row.analysis.reason,row.analysis.confirmationRequired ? 1 : 0,row.analysis.aiStatus);
    }
    db.exec("commit;");
  } catch (error) {
    try { db.exec("rollback;"); } catch { /* no active transaction */ }
    throw error;
  } finally { db.close(); }
}

export function loadPlacementDashboard(input: { customerId: string; customerName: string; startDate: string; endDate: string; refreshedAt: string; warnings?: string[]; performanceMaxCampaignCount?: number }): PlacementDashboardPayload {
  const db = openDatabase();
  try {
    const raw = db.prepare(`
      SELECT rec.id, p.source_resource_name,p.placement,p.display_name,p.placement_type,p.target_url,p.campaign_name,p.ad_group_name,p.impressions,p.clicks,p.spend,p.conversions,p.video_views,rec.classification,rec.recommended_action,rec.confidence,rec.reason,rec.confirmation_required,rec.ai_status,rec.review_status,rec.current_decision
      FROM ad_automation_placement_recommendations rec JOIN ad_automation_placements p ON p.id=rec.placement_id
      WHERE p.google_customer_id=? AND p.start_date=? AND p.end_date=? AND p.source_view='performance_max_placement_view' ORDER BY p.impressions DESC,p.display_name
    `).all(input.customerId,input.startDate,input.endDate) as Array<Record<string, string | number | null>>;
    const events = db.prepare(`SELECT reviews.* FROM ad_automation_placement_reviews reviews JOIN ad_automation_placement_recommendations rec ON rec.id=reviews.recommendation_id JOIN ad_automation_placements p ON p.id=rec.placement_id WHERE p.google_customer_id=? ORDER BY reviews.id DESC`).all(input.customerId) as Array<Record<string,string|number|null>>;
    const eventsById = new Map<number, PlacementReviewEvent[]>();
    for (const event of events) {
      const id = Number(event.recommendation_id); const list = eventsById.get(id) ?? [];
      list.push({ id:String(event.id),reviewerEmail:String(event.reviewer_email),reviewerRole:String(event.reviewer_role),action:String(event.action),resultingStatus:String(event.resulting_status),createdAt:String(event.created_at) }); eventsById.set(id,list);
    }
    const rows: PlacementOptimizationRow[] = raw.map((row) => ({
      id:String(row.id),resourceName:String(row.source_resource_name),placement:String(row.placement),displayName:String(row.display_name),placementType:String(row.placement_type),targetUrl:row.target_url ? String(row.target_url) : null,campaignName:String(row.campaign_name),adGroupName:String(row.ad_group_name),impressions:Number(row.impressions),clicks:Number(row.clicks),spend:Number(row.spend),conversions:Number(row.conversions),videoViews:Number(row.video_views),classification:String(row.classification),recommendedAction:String(row.recommended_action) as PlacementDecision,confidence:Number(row.confidence),reason:String(row.reason),confirmationRequired:Boolean(row.confirmation_required),aiStatus:String(row.ai_status) as PlacementOptimizationRow["aiStatus"],reviewStatus:String(row.review_status),currentDecision:row.current_decision ? String(row.current_decision) : null,reviewHistory:eventsById.get(Number(row.id)) ?? [],
    }));
    const websiteRows = rows.filter((row) => row.placementType === "WEBSITE");
    const knownCampaignCount = new Set(
      rows
        .map((row) => row.campaignName)
        .filter((name) => name !== "Unknown Performance Max campaign"),
    ).size;
    const campaignCount =
      input.performanceMaxCampaignCount ??
      (rows.length > 0 ? Math.max(1, knownCampaignCount) : 0);
    return { account:{customerId:input.customerId,customerName:input.customerName,startDate:input.startDate,endDate:input.endDate,refreshedAt:input.refreshedAt},summary:{total:rows.length,needsReview:rows.filter(r=>r.reviewStatus==="pending_optimizer").length,awaitingApproval:rows.filter(r=>r.reviewStatus==="ready_for_approval").length,kept:rows.filter(r=>r.reviewStatus==="kept").length,kiv:rows.filter(r=>r.reviewStatus==="kiv").length,approved:rows.filter(r=>r.reviewStatus==="ready_for_publishing").length,rejected:rows.filter(r=>r.reviewStatus==="approver_rejected").length},performanceMax:{available:rows.length>0,campaignCount,totalImpressions:rows.reduce((sum,row)=>sum+row.impressions,0),uniqueSites:new Set(websiteRows.map((row)=>row.placement)).size,topSites:websiteRows.slice(0,5).map(({id,displayName,placement,targetUrl,campaignName,impressions})=>({id,displayName,placement,targetUrl,campaignName,impressions}))},rows,changeSets:[],reports:[],warnings:input.warnings ?? [] };
  } finally { db.close(); }
}

export function saveOptimizerDecision(input: { recommendationIds:number[]; decision:PlacementDecision; reviewer:{id:string;email:string;role:string} }) {
  const status = input.decision === "exclude" ? "ready_for_publishing" : input.decision === "keep" ? "kept" : "kiv";
  return saveSimpleDecision({ ...input, status, action:`optimizer_${input.decision}` });
}

function saveSimpleDecision(input:{recommendationIds:number[];decision:string;status:string;action:string;reviewer:{id:string;email:string;role:string}}) {
  const db=openDatabase(); try {
    const update=db.prepare(`UPDATE ad_automation_placement_recommendations SET review_status=?,current_decision=?,updated_at=datetime('now') WHERE id=? AND NOT (review_status=? AND current_decision=?)`);
    const history=db.prepare(`INSERT INTO ad_automation_placement_reviews (recommendation_id,reviewer_user_id,reviewer_email,reviewer_role,action,previous_status,resulting_status) VALUES (?,?,?,?,?,?,?)`);
    const read=db.prepare(`SELECT review_status FROM ad_automation_placement_recommendations WHERE id=?`);
    db.exec("begin immediate;"); let updated=0;
    for(const id of input.recommendationIds){const previous=read.get(id) as {review_status:string}|undefined;if(!previous)throw new Error(`Placement recommendation ${id} was not found.`);const result=update.run(input.status,input.decision,id,input.status,input.decision);if(Number(result.changes)>0){updated++;history.run(id,input.reviewer.id,input.reviewer.email,input.reviewer.role,input.action,previous.review_status,input.status);}}
    db.exec("commit;"); return {updated,skipped:input.recommendationIds.length-updated};
  }catch(error){try{db.exec("rollback;");}catch{}throw error;}finally{db.close();}
}

export function savePlacementApproverDecision(input:{recommendationIds:number[];decision:PlacementApproverDecision;reviewer:{id:string;email:string;role:string}}){
  const db=openDatabase();
  try {
    const read=db.prepare(`SELECT review_status FROM ad_automation_placement_recommendations WHERE id=?`);
    for(const id of input.recommendationIds){
      const row=read.get(id) as {review_status:string}|undefined;
      if(!row)throw new Error(`Placement recommendation ${id} was not found.`);
      if(row.review_status!=="ready_for_approval")throw new Error("Every selected placement must be awaiting approval.");
    }
  } finally { db.close(); }
  return saveSimpleDecision({
    recommendationIds: input.recommendationIds,
    decision: input.decision,
    status:
      input.decision === "approved"
        ? "ready_for_publishing"
        : input.decision === "rejected"
          ? "approver_rejected"
          : "returned_for_clarification",
    action: `approver_${input.decision}`,
    reviewer: input.reviewer,
  });
}

export function clearPlacementDecision(input:{recommendationIds:number[];reviewer:{id:string;email:string;role:string}}){
  const db=openDatabase(); try {
    const read=db.prepare(`SELECT review_status,current_decision FROM ad_automation_placement_recommendations WHERE id=?`);
    const update=db.prepare(`UPDATE ad_automation_placement_recommendations SET review_status='pending_optimizer',current_decision=NULL,updated_at=datetime('now') WHERE id=?`);
    const history=db.prepare(`INSERT INTO ad_automation_placement_reviews (recommendation_id,reviewer_user_id,reviewer_email,reviewer_role,action,previous_status,resulting_status) VALUES (?,?,?,?,?,?,?)`);
    db.exec("begin immediate;"); let updated=0;
    for(const id of input.recommendationIds){
      const previous=read.get(id) as {review_status:string;current_decision:string|null}|undefined;
      if(!previous)throw new Error(`Placement recommendation ${id} was not found.`);
      if(previous.current_decision===null&&previous.review_status==="pending_optimizer")continue;
      update.run(id); updated++;
      history.run(id,input.reviewer.id,input.reviewer.email,input.reviewer.role,"decision_removed",previous.review_status,"pending_optimizer");
    }
    db.exec("commit;"); return {updated,skipped:input.recommendationIds.length-updated};
  }catch(error){try{db.exec("rollback;");}catch{}throw error;}finally{db.close();}
}
