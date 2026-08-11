import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory=mkdtempSync(join(tmpdir(),"placement-optimization-"));process.env.SEARCH_TERM_SQLITE_PATH=join(temporaryDirectory,"test.sqlite");
const require=createRequire(import.meta.url);const repository=require("../lib/placement-optimization/sqlite-repository") as typeof import("../lib/placement-optimization/sqlite-repository");
const base={campaignId:"1",campaignName:"Display",adGroupId:"2",adGroupName:"General",impressions:100,clicks:4,spend:12,conversions:0,videoViews:0,targetUrl:null,analysis:{classification:"Test risk",recommendedAction:"exclude" as const,confidence:90,reason:"Test placement",confirmationRequired:false,aiStatus:"rules_fallback" as const}};
try{
  repository.persistPlacements({customerId:"1234567890",customerName:"Test Account",startDate:"2026-07-01",endDate:"2026-07-31",refreshedAt:new Date().toISOString(),rows:Array.from({length:6},(_,index)=>({...base,resourceName:`resource-${index}`,placement:`example-${index}.com`,displayName:`Placement ${index}`,placementType:index===1?"YOUTUBE_VIDEO":"WEBSITE"}))});
  let dashboard=repository.loadPlacementDashboard({customerId:"1234567890",customerName:"Test Account",startDate:"2026-07-01",endDate:"2026-07-31",refreshedAt:new Date().toISOString()});const ids=dashboard.rows.map(row=>Number(row.id));
  const optimizer={id:"co-test",email:"co@example.com",role:"co"};
  repository.saveOptimizerDecision({recommendationIds:[ids[0],ids[1]],decision:"exclude",reviewer:optimizer});repository.saveOptimizerDecision({recommendationIds:[ids[2]],decision:"keep",reviewer:optimizer});repository.saveOptimizerDecision({recommendationIds:[ids[3]],decision:"kiv",reviewer:optimizer});repository.saveOptimizerDecision({recommendationIds:[ids[4]],decision:"exclude",reviewer:optimizer});repository.saveOptimizerDecision({recommendationIds:[ids[5]],decision:"exclude",reviewer:optimizer});
  dashboard=repository.loadPlacementDashboard({customerId:"1234567890",customerName:"Test Account",startDate:"2026-07-01",endDate:"2026-07-31",refreshedAt:new Date().toISOString()});if(dashboard.summary.approved!==4||dashboard.summary.kept!==1||dashboard.summary.kiv!==1||dashboard.reports.length!==0)throw new Error("Placement history counts are incorrect.");
  const cleared=repository.clearPlacementDecision({recommendationIds:[ids[0]],reviewer:optimizer});if(cleared.updated!==1)throw new Error("Placement decision was not removed.");
  dashboard=repository.loadPlacementDashboard({customerId:"1234567890",customerName:"Test Account",startDate:"2026-07-01",endDate:"2026-07-31",refreshedAt:new Date().toISOString()});const clearedRow=dashboard.rows.find(row=>Number(row.id)===ids[0]);if(!clearedRow||clearedRow.currentDecision!==null||clearedRow.reviewHistory[0]?.action!=="decision_removed")throw new Error("Removal history was not retained.");console.log("Placement decision history SQLite workflow test passed.");
}finally{rmSync(temporaryDirectory,{recursive:true,force:true});}
