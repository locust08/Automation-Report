import assert from "node:assert/strict";
import test from "node:test";

import {
  addMetaManagementPrefillItem,
  buildMetaManagementRequestPrefill,
  resolveMetaManagementBaseline,
  refreshMetaManagementFormFromResource,
  resolveMetaManagementResourceForForm,
  toMetaAdManagementResource,
  toMetaAdSetManagementResource,
  toMetaCampaignManagementResource,
  validateMetaManagementRequestForm,
  type M03MetaManagementResource,
} from "./meta-management-builder";
import { buildM03RequestForm } from "./workspace";

const campaign: M03MetaManagementResource = {
  entityType: "campaign",
  entityIdentity: "campaign-1",
  name: "Prospecting",
  status: "ACTIVE",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  managementFields: {
    "campaign.budget.lifetime": 250000,
    "campaign.bid.strategy": "LOWEST_COST_WITHOUT_CAP",
  },
};

const adSet: M03MetaManagementResource = {
  entityType: "ad_set",
  entityIdentity: "adset-1",
  name: "Malaysia adults",
  status: "PAUSED",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  adSetIdentity: "adset-1",
  managementFields: {
    "ad_set.budget.lifetime": 125000,
    "ad_set.schedule.end_time": "2026-09-30T16:00:00+0000",
    "ad_set.bid.strategy": "COST_CAP",
    "ad_set.bid.amount": 4500,
    "ad_set.targeting.geo_locations": { countries: ["MY"] },
  },
};

const ad: M03MetaManagementResource = {
  entityType: "ad",
  entityIdentity: "ad-1",
  name: "Red creative",
  status: "ACTIVE",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  adSetIdentity: "adset-1",
  creative: {
    id: "creative-1",
    body: "Old primary text",
    title: "Old headline",
    description: "Old description",
    linkUrl: "https://example.com/old",
    callToActionType: "LEARN_MORE",
    pageId: "page-1",
    instagramActorId: "instagram-1",
    imageHash: "image-hash-1",
    videoId: "video-1",
    effectiveObjectStoryId: "page-1_post-1",
  },
  managementFields: {},
};

test("Meta campaign, ad-set, and ad prefills use official typed baselines and stable identity evidence", () => {
  const campaignPrefill = buildMetaManagementRequestPrefill({
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: campaign,
    fieldPath: "campaign.budget.lifetime",
  });
  const adSetPrefill = buildMetaManagementRequestPrefill({
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.targeting.geo_locations",
  });
  const adPrefill = buildMetaManagementRequestPrefill({
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: ad,
    fieldPath: "ad.name",
  });

  assert.deepEqual(campaignPrefill.items[0], {
    entity_type: "campaign",
    entity_identity: "campaign-1",
    field_path: "campaign.budget.lifetime",
    value_type: "number",
    baseline_value: 250000,
    proposed_value: "",
    evidence: {
      source: "meta_management",
      baseline_source: "synchronized_meta_resource",
      account_name: "Facebook - Example",
      campaign_name: "Prospecting",
    },
    platform_resource_mapping: { account_id: "123456", campaign_id: "campaign-1" },
  });
  assert.equal(adSetPrefill.items[0]?.value_type, "json");
  assert.deepEqual(adSetPrefill.items[0]?.baseline_value, { countries: ["MY"] });
  assert.deepEqual(adSetPrefill.items[0]?.platform_resource_mapping, {
    account_id: "123456",
    campaign_id: "campaign-1",
    ad_set_id: "adset-1",
  });
  assert.equal(adPrefill.items[0]?.baseline_value, "Red creative");
  assert.equal(campaignPrefill.accountIdentity, "123456");
  assert.equal(campaignPrefill.campaignIdentity, "campaign-1");
  assert.match(campaignPrefill.title, /Lifetime budget.*Prospecting/i);
});

test("Meta baseline resolution distinguishes an official empty value from a missing baseline", () => {
  const officialEmpty: M03MetaManagementResource = {
    ...ad,
    creative: { ...ad.creative, description: "" },
  };

  assert.deepEqual(resolveMetaManagementBaseline(officialEmpty, "ad.copy.description"), {
    available: true,
    value: "",
  });
  assert.deepEqual(resolveMetaManagementBaseline({ ...adSet, managementFields: {} }, "ad_set.bid.amount"), {
    available: false,
    value: undefined,
    message: "Official baseline unavailable for Bid amount (ad_set.bid.amount).",
  });

  const prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource: { ...adSet, managementFields: {} },
    fieldPath: "ad_set.bid.amount",
  });
  const form = buildM03RequestForm({ scope: { platform: "meta", accountIdentity: "123456" }, prefill });
  form.title = "Change bid amount";
  form.reason = "Improve delivery";
  form.items[0]!.proposed_value = "5000";
  assert.deepEqual(validateMetaManagementRequestForm(form), [
    "Official baseline unavailable for Bid amount (ad_set.bid.amount). Refresh official data before saving.",
  ]);
});

test("Meta dependent multi-item construction retains entity identity, mappings, registry types, and official baselines", () => {
  let prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.budget.lifetime",
  });
  prefill = addMetaManagementPrefillItem(prefill, {
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.schedule.end_time",
  });
  prefill = addMetaManagementPrefillItem(prefill, {
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.bid.strategy",
  });
  prefill = addMetaManagementPrefillItem(prefill, {
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.bid.amount",
  });

  assert.deepEqual(prefill.items.map((item) => [item.field_path, item.value_type, item.baseline_value]), [
    ["ad_set.budget.lifetime", "number", 125000],
    ["ad_set.schedule.end_time", "string", "2026-09-30T16:00:00+0000"],
    ["ad_set.bid.strategy", "string", "COST_CAP"],
    ["ad_set.bid.amount", "number", 4500],
  ]);
  assert.ok(prefill.items.every((item) => item.entity_identity === "adset-1"));
  assert.ok(prefill.items.every((item) => item.platform_resource_mapping?.ad_set_id === "adset-1"));
});

test("Meta creative prefills include deterministic replacement mappings and reject each missing required mapping", () => {
  const prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "act_123456",
    accountName: "Facebook - Example",
    resource: ad,
    fieldPath: "ad.copy.primary_text",
  });
  assert.deepEqual(prefill.items[0]?.platform_resource_mapping, {
    account_id: "123456",
    campaign_id: "campaign-1",
    ad_set_id: "adset-1",
    ad_id: "ad-1",
    previous_ad_id: "ad-1",
    previous_creative_id: "creative-1",
    intended_status: "PAUSED",
    page_id: "page-1",
    instagram_actor_id: "instagram-1",
    image_hash: "image-hash-1",
    video_id: "video-1",
    effective_object_story_id: "page-1_post-1",
  });

  const form = buildM03RequestForm({ scope: { platform: "meta", accountIdentity: "123456" }, prefill });
  form.title = "Replace creative";
  form.reason = "Approved copy refresh";
  form.items[0]!.proposed_value = "New primary text";
  assert.deepEqual(validateMetaManagementRequestForm(form), []);

  for (const [missing, expected] of [
    ["account_id", /Meta account ID/],
    ["campaign_id", /Meta campaign ID/],
    ["ad_set_id", /Meta ad set ID/],
    ["previous_ad_id", /previous Meta ad ID/],
    ["page_id", /Facebook Page ID/],
  ] as const) {
    const mapping = { ...form.items[0]!.platform_resource_mapping };
    delete mapping[missing];
    form.items[0] = { ...form.items[0]!, platform_resource_mapping: mapping };
    assert.match(validateMetaManagementRequestForm(form).join(" "), expected);
    form.items[0] = { ...form.items[0]!, platform_resource_mapping: { ...prefill.items[0]!.platform_resource_mapping } };
  }
});

test("Meta form validation blocks blank title, reason, proposed values, and mixed entity identities", () => {
  const prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.bid.amount",
  });
  const form = buildM03RequestForm({ scope: { platform: "meta", accountIdentity: "123456" }, prefill });
  form.title = "";
  form.items.push({ ...form.items[0]!, field_path: "ad_set.bid.strategy", entity_identity: "different-adset" });

  assert.deepEqual(validateMetaManagementRequestForm(form), [
    "Request title is required.",
    "Reason is required.",
    "Proposed value is required for Bid amount (ad_set.bid.amount).",
    "All Meta management items must retain ad_set adset-1.",
    "Proposed value is required for Bid strategy (ad_set.bid.strategy).",
  ]);
});

test("synchronized Meta report nodes convert without dropping official fields or creative identities", () => {
  const campaignNode = {
    id: "campaign-1",
    name: "Prospecting",
    status: "ACTIVE",
    managementFields: { "campaign.bid.strategy": "LOWEST_COST_WITHOUT_CAP" },
  };
  const adSetNode = {
    id: "adset-1",
    name: "Malaysia adults",
    status: "PAUSED",
    managementFields: { "ad_set.bid.amount": 4500 },
  };
  const adNode = {
    id: "ad-1",
    name: "Red creative",
    status: "ACTIVE",
    managementFields: { "ad.status": "ACTIVE" },
    creative: { id: "creative-1", pageId: "page-1", instagramActorId: "ig-1" },
  };

  assert.deepEqual(toMetaCampaignManagementResource(campaignNode), {
    entityType: "campaign",
    entityIdentity: "campaign-1",
    name: "Prospecting",
    status: "ACTIVE",
    campaignIdentity: "campaign-1",
    campaignName: "Prospecting",
    managementFields: { "campaign.bid.strategy": "LOWEST_COST_WITHOUT_CAP" },
  });
  assert.deepEqual(toMetaAdSetManagementResource(campaignNode, adSetNode), {
    entityType: "ad_set",
    entityIdentity: "adset-1",
    name: "Malaysia adults",
    status: "PAUSED",
    campaignIdentity: "campaign-1",
    campaignName: "Prospecting",
    adSetIdentity: "adset-1",
    managementFields: { "ad_set.bid.amount": 4500 },
  });
  assert.deepEqual(toMetaAdManagementResource(campaignNode, adSetNode, adNode), {
    entityType: "ad",
    entityIdentity: "ad-1",
    name: "Red creative",
    status: "ACTIVE",
    campaignIdentity: "campaign-1",
    campaignName: "Prospecting",
    adSetIdentity: "adset-1",
    managementFields: { "ad.status": "ACTIVE" },
    creative: { id: "creative-1", pageId: "page-1", instagramActorId: "ig-1" },
  });
});

test("embedded edits resolve their own synchronized entity instead of the page's last selected entity", () => {
  const form = buildM03RequestForm({
    scope: { platform: "meta", accountIdentity: "123456" },
    prefill: buildMetaManagementRequestPrefill({
      accountIdentity: "123456",
      accountName: "Facebook - Example",
      resource: adSet,
      fieldPath: "ad_set.bid.amount",
    }),
  });

  const resolved = resolveMetaManagementResourceForForm(form, [campaign, ad, adSet]);
  assert.equal(resolved.resource?.entityIdentity, "adset-1");
  assert.equal(resolved.issue, null);

  const missing = resolveMetaManagementResourceForForm(form, [campaign, ad]);
  assert.equal(missing.resource, null);
  assert.match(missing.issue ?? "", /ad_set adset-1.*Refresh official data/i);
  assert.match(validateMetaManagementRequestForm(form, { officialResource: null }).join(" "), /Refresh official data/i);
});

test("official baseline refresh preserves operator fields and replaces only synchronized baseline evidence", () => {
  const prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource: adSet,
    fieldPath: "ad_set.bid.amount",
  });
  const form = buildM03RequestForm({ scope: { platform: "meta", accountIdentity: "123456" }, prefill });
  form.title = "Keep this title";
  form.reason = "Keep this reason";
  form.sourceM04PlanId = "42";
  form.sourceM04RevisionId = "84";
  form.items[0]!.proposed_value = "5000";

  const refreshed = refreshMetaManagementFormFromResource(form, {
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource: { ...adSet, managementFields: { ...adSet.managementFields, "ad_set.bid.amount": 4750 } },
  });

  assert.equal(refreshed.title, "Keep this title");
  assert.equal(refreshed.reason, "Keep this reason");
  assert.equal(refreshed.sourceM04PlanId, "42");
  assert.equal(refreshed.sourceM04RevisionId, "84");
  assert.equal(refreshed.items[0]?.proposed_value, "5000");
  assert.equal(refreshed.items[0]?.baseline_value, 4750);
});

test("creative mapping refresh never preserves a fabricated required provider ID", () => {
  const resource = { ...ad, creative: { ...ad.creative, pageId: null } };
  const prefill = buildMetaManagementRequestPrefill({
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource,
    fieldPath: "ad.copy.primary_text",
  });
  const form = buildM03RequestForm({ scope: { platform: "meta", accountIdentity: "123456" }, prefill });
  form.title = "Replace copy";
  form.reason = "Approved refresh";
  form.items[0]!.proposed_value = "New copy";
  assert.equal(form.items[0]?.platform_resource_mapping?.page_id, undefined);
  assert.match(validateMetaManagementRequestForm(form).join(" "), /Facebook Page ID/);

  form.items[0]!.platform_resource_mapping = { ...form.items[0]!.platform_resource_mapping, page_id: "fabricated-page" };
  const refreshed = refreshMetaManagementFormFromResource(form, {
    accountIdentity: "123456",
    accountName: "Facebook - Example",
    resource,
  });
  assert.equal(refreshed.items[0]?.platform_resource_mapping?.page_id, undefined);
  assert.match(validateMetaManagementRequestForm(refreshed).join(" "), /Facebook Page ID/);
});
