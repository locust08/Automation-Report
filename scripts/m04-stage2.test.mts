import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  M04_BUILD_STATES,
  M04_BUILD_TRANSITIONS,
  calculateCampaignBudget,
  campaignPlanDraftInputSchema,
  canTransitionCampaignBuild,
  evaluateCampaignApproval,
  prepareCampaignPlanDraft,
} = require("../lib/campaign-planning/domain.ts") as typeof import("../lib/campaign-planning/domain.ts");

const commonDraft = {
  client_id: "10000000-0000-4000-8000-000000000001",
  client_name: "Stage 2 Fixture Client",
  ad_account_id: 1,
  budget_package_id: 1,
  campaign_name: "Stage 2 fixture",
  provider_account_id: "mock-account-001",
  currency: "MYR",
  timezone: "Asia/Kuala_Lumpur",
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  allocated_budget: 31.005,
  destination: "https://example.test/landing",
  tracking: {
    url_parameters: { utm_campaign: "stage-2", utm_source: "paid" },
    tracking_template: "{lpurl}?source=m04",
  },
} as const;

const googleSearchDraft = {
  ...commonDraft,
  platform: "google",
  objective: "leads",
  campaign_type: "search",
  bidding_strategy: "target_cpa",
  bid_targets: { target_cpa: 2 },
  network_settings: {
    google_search: true,
    search_partners: false,
    display_network: false,
  },
  locations: ["MY-KUL", "MY-SEL"],
  languages: ["en", "ms"],
  placements: { inventory: "google_search" },
  targeting: { audience_segments: [], excluded_locations: [] },
  conversion: { action_id: "mock-google-conversion-001", category: "submit_lead_form" },
  campaign_structure: {
    groups: [{ name: "Core intent", keywords: [{ text: "stage two", match_type: "phrase" }] }],
  },
  creative: {
    format: "responsive_search_ad",
    headlines: ["Stage 2 planning", "Local draft only", "No provider calls"],
    descriptions: ["A deterministic local planning draft.", "Stored only in local Supabase."],
    path_1: "stage-2",
  },
} as const;

const metaDraft = {
  ...commonDraft,
  platform: "meta",
  provider_account_id: "act_mock_meta_001",
  objective: "leads",
  buying_type: "auction",
  conversion_location: "website",
  optimization_goal: "offsite_conversions",
  billing_event: "impressions",
  pixel_id: "mock-meta-pixel-001",
  conversion_event: "lead",
  placements: { mode: "manual", values: ["facebook_feed", "instagram_feed"] },
  targeting: {
    countries: ["MY"],
    age_min: 21,
    age_max: 55,
    genders: ["all"],
    interests: ["business software"],
  },
  creative: {
    format: "image",
    image_asset_id: "mock-meta-image-001",
    primary_text: "Plan locally before any provider work.",
    headline: "Stage 2 draft",
    call_to_action: "learn_more",
  },
} as const;

const tikTokDraft = {
  ...commonDraft,
  platform: "tiktok",
  provider_account_id: "mock-tiktok-001",
  objective: "web_conversions",
  campaign_type: "auction",
  budget_mode: "daily",
  optimization_goal: "complete_payment",
  pixel_id: "mock-tiktok-pixel-001",
  conversion_event: "purchase",
  placements: { mode: "automatic" },
  targeting: {
    countries: ["MY"],
    languages: ["en", "ms"],
    age_groups: ["25-34", "35-44"],
    genders: ["all"],
    interests: ["business"],
    operating_systems: ["android", "ios"],
  },
  identity: { type: "regular", display_name: "Stage 2 Fixture" },
  creative: {
    format: "single_video",
    spark_ad: false,
    video_id: "mock-tiktok-video-001",
    ad_text: "This is a local planning record.",
    call_to_action: "shop_now",
  },
} as const;

test("Stage 2 accepts one supported Google, Meta, and TikTok plan", () => {
  assert.equal(campaignPlanDraftInputSchema.parse(googleSearchDraft).campaign_type, "search");
  assert.equal(campaignPlanDraftInputSchema.parse(metaDraft).conversion_location, "website");
  assert.equal(campaignPlanDraftInputSchema.parse(tikTokDraft).creative.spark_ad, false);
});

test("Stage 2 rejects unsupported platform combinations instead of approximating them", () => {
  assert.throws(() => campaignPlanDraftInputSchema.parse({ ...googleSearchDraft, campaign_type: "display" }));
  assert.throws(() => campaignPlanDraftInputSchema.parse({ ...metaDraft, objective: "awareness" }));
  assert.throws(() => campaignPlanDraftInputSchema.parse({ ...metaDraft, conversion_location: "instant_form" }));
  assert.throws(() => campaignPlanDraftInputSchema.parse({ ...tikTokDraft, budget_mode: "lifetime" }));
  assert.throws(() => campaignPlanDraftInputSchema.parse({
    ...tikTokDraft,
    creative: { ...tikTokDraft.creative, spark_ad: true },
  }));
});

test("inclusive dates and platform increments produce deterministic budgets", () => {
  assert.deepEqual(calculateCampaignBudget({
    platform: "google",
    allocated_budget: 31.005,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
  }), {
    flight_days: 31,
    platform_increment: 0.01,
    increment_amount: 0,
    daily_budget: 1,
    projected_total: 31,
  });

  assert.deepEqual(calculateCampaignBudget({
    platform: "tiktok",
    allocated_budget: 31.5,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
  }), {
    flight_days: 31,
    platform_increment: 1,
    increment_amount: 0,
    daily_budget: 1,
    projected_total: 31,
  });

  assert.throws(() => calculateCampaignBudget({
    platform: "google",
    allocated_budget: 1,
    start_date: "2026-02-29",
    end_date: "2026-03-01",
  }));
});

test("canonical hashes ignore object-key and unordered targeting order", () => {
  const first = prepareCampaignPlanDraft(googleSearchDraft);
  const reordered = prepareCampaignPlanDraft({
    ...googleSearchDraft,
    locations: ["MY-SEL", "MY-KUL"],
    languages: ["ms", "en"],
    tracking: {
      tracking_template: "{lpurl}?source=m04",
      url_parameters: { utm_source: "paid", utm_campaign: "stage-2" },
    },
  });

  assert.equal(first.canonical_json, reordered.canonical_json);
  assert.equal(first.payload_hash, reordered.payload_hash);
  assert.match(first.payload_hash, /^[a-f0-9]{64}$/);
  assert.equal(first.plan.increment_amount, 0);
  assert.equal(first.plan.daily_budget, 1);
  assert.equal(first.plan.projected_total, 31);
});

test("approval evaluation rejects missing, expired, superseded, and stale locks", () => {
  const base = {
    now: "2026-08-21T12:00:00.000Z",
    active_revision_id: 7,
    active_revision_hash: "a".repeat(64),
    latest_approval_id: 11,
  } as const;
  const approval = {
    id: 11,
    decision: "approved",
    revision_id: 7,
    revision_hash: "a".repeat(64),
    expires_at: "2026-08-22T12:00:00.000Z",
  } as const;

  assert.equal(evaluateCampaignApproval({ ...base, approval: null }).reason, "missing");
  assert.equal(evaluateCampaignApproval({
    ...base,
    approval: { ...approval, expires_at: "2026-08-21T11:59:59.999Z" },
  }).reason, "expired");
  assert.equal(evaluateCampaignApproval({ ...base, latest_approval_id: 12, approval }).reason, "superseded");
  assert.equal(evaluateCampaignApproval({
    ...base,
    approval: { ...approval, revision_id: 6 },
  }).reason, "revision_mismatch");
  assert.equal(evaluateCampaignApproval({
    ...base,
    approval: { ...approval, revision_hash: "b".repeat(64) },
  }).reason, "hash_mismatch");
  assert.deepEqual(evaluateCampaignApproval({ ...base, approval }), { approved: true, reason: "approved" });
});

test("the complete 12-state build table allows only declared transitions", () => {
  assert.equal(M04_BUILD_STATES.length, 12);
  assert.deepEqual(M04_BUILD_TRANSITIONS.pending_gate_1, ["gate_1_in_progress", "cancelled"]);
  assert.equal(canTransitionCampaignBuild("gate_1_in_progress", "ready_to_deliver"), true);
  assert.equal(canTransitionCampaignBuild("gate_1_in_progress", "verified"), false);
  assert.equal(canTransitionCampaignBuild("ready_to_deliver", "gate_2_in_progress"), true);
  assert.equal(canTransitionCampaignBuild("delivery_unverified", "gate_2_in_progress"), true);
  assert.equal(canTransitionCampaignBuild("verified", "handoff_complete"), true);
  assert.equal(canTransitionCampaignBuild("handoff_complete", "pending_gate_1"), false);
  assert.equal(canTransitionCampaignBuild("cancelled", "gate_1_in_progress"), false);
});

test("the local Supabase repository stores exactly one Google Search draft revision", async () => {
  const repository = require("../lib/campaign-planning/supabase-repository.ts") as typeof import("../lib/campaign-planning/supabase-repository.ts");
  const expected = prepareCampaignPlanDraft(googleSearchDraft);
  const created = await repository.createCampaignPlanDraft(googleSearchDraft);
  const fetched = await repository.getCampaignPlan(created.plan.id);
  const listed = await repository.listCampaignPlans();

  assert.equal(listed.campaigns.filter((plan) => plan.id === created.plan.id).length, 1);
  assert.equal(fetched.plan.platform, "google");
  assert.equal(fetched.currentRevision.payloadHash, expected.payload_hash);
  assert.equal(fetched.currentRevision.canonicalJson, expected.canonical_json);

  const planRows = await readLocalSupabaseRows("ads_campaign_plans", `id=eq.${created.plan.id}`);
  assert.equal(planRows.length, 1);
  const revisionRows = await readLocalSupabaseRows(
    "ads_campaign_plan_revisions",
    `plan_id=eq.${created.plan.id}`,
  ) as Array<{ id: number; canonical_json: string; payload_hash: string }>;
  assert.equal(revisionRows.length, 1);
  assert.equal(revisionRows[0]?.canonical_json, expected.canonical_json);
  assert.equal(revisionRows[0]?.payload_hash, expected.payload_hash);

  const revisionId = revisionRows[0]?.id;
  assert.ok(revisionId);
  assert.equal((await readLocalSupabaseRows("ads_google_campaign_revision_details", `revision_id=eq.${revisionId}`)).length, 1);
  assert.equal((await readLocalSupabaseRows("ads_meta_campaign_revision_details", `revision_id=eq.${revisionId}`)).length, 0);
  assert.equal((await readLocalSupabaseRows("ads_tiktok_campaign_revision_details", `revision_id=eq.${revisionId}`)).length, 0);

  for (const table of [
    "ads_campaign_approvals",
    "ads_campaign_builds",
    "ads_campaign_build_resources",
    "ads_campaign_gate_attempts",
    "ads_campaign_qa_results",
    "ads_campaign_monitoring_handoffs",
  ]) {
    assert.equal((await readLocalSupabaseRows(table)).length, 0, `${table} must remain empty`);
  }
});

async function readLocalSupabaseRows(table: string, filter?: string): Promise<unknown[]> {
  const baseUrl = process.env.M04_SUPABASE_URL;
  const serviceRoleKey = process.env.M04_SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(baseUrl, "M04_SUPABASE_URL must be configured by the disposable test runner");
  assert.ok(serviceRoleKey, "M04_SUPABASE_SERVICE_ROLE_KEY must be configured by the disposable test runner");

  const query = filter ? `?select=*&${filter}` : "?select=*";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/${table}${query}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  assert.equal(response.ok, true, `Unable to read ${table}: ${response.status}`);
  return await response.json() as unknown[];
}
