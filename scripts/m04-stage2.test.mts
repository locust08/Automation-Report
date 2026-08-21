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
  const google = campaignPlanDraftInputSchema.parse(googleSearchDraft);
  const meta = campaignPlanDraftInputSchema.parse(metaDraft);
  const tiktok = campaignPlanDraftInputSchema.parse(tikTokDraft);
  assert.equal(google.platform === "google" && google.campaign_type, "search");
  assert.equal(meta.platform === "meta" && meta.conversion_location, "website");
  assert.equal(tiktok.platform === "tiktok" && tiktok.creative.spark_ad, false);
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

test("development auth maps the local bypass subject to an explicitly configured CRM08 actor", async () => {
  const repository = require("../lib/campaign-planning/supabase-repository.ts") as typeof import("../lib/campaign-planning/supabase-repository.ts");
  const previousBypass = process.env.DEV_AUTH_BYPASS;
  const previousActor = process.env.DEV_AUTH_BYPASS_ACTOR_ID;
  process.env.DEV_AUTH_BYPASS = "true";
  process.env.DEV_AUTH_BYPASS_ACTOR_ID = "c4b46e06-bbe9-4f91-855e-d43d6e31c8fe";
  try {
    assert.equal(
      repository.resolveCampaignActorId("local-development-admin"),
      "c4b46e06-bbe9-4f91-855e-d43d6e31c8fe",
    );
    assert.equal(
      repository.resolveCampaignActorId("5a718bf0-df4d-487d-a871-db1fd72c0b84"),
      "5a718bf0-df4d-487d-a871-db1fd72c0b84",
    );
  } finally {
    restoreEnvironment("DEV_AUTH_BYPASS", previousBypass);
    restoreEnvironment("DEV_AUTH_BYPASS_ACTOR_ID", previousActor);
  }
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
