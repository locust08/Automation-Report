import assert from "node:assert/strict";
import test from "node:test";

import { buildM03RequestForm } from "./workspace";
import {
  buildTikTokManagementRequestPrefill,
  resolveTikTokManagementBaseline,
  toTikTokAdManagementResource,
  toTikTokAdGroupManagementResource,
  toTikTokCampaignManagementResource,
  validateTikTokManagementRequestForm,
  type M03TikTokManagementResource,
} from "./tiktok-management-builder";

const campaign: M03TikTokManagementResource = {
  entityType: "campaign",
  entityIdentity: "campaign-1",
  name: "Prospecting",
  status: "ENABLE",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  managementFields: { "campaign.budget.amount": 240 },
};

const adGroup: M03TikTokManagementResource = {
  entityType: "ad_group",
  entityIdentity: "adgroup-1",
  name: "Broad audience",
  status: "DISABLE",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  adGroupIdentity: "adgroup-1",
  managementFields: { "ad_group.optimization_goal": "CONVERT" },
};

const ad: M03TikTokManagementResource = {
  entityType: "ad",
  entityIdentity: "ad-1",
  name: "Video A",
  status: "ENABLE",
  campaignIdentity: "campaign-1",
  campaignName: "Prospecting",
  adGroupIdentity: "adgroup-1",
  managementFields: {
    "ad.copy.primary_text": "Original copy",
    "ad.creative.video_reference": "video-1",
    "ad.creative.identity_reference": "identity-1",
  },
};

test("TikTok management prefills preserve official baselines and parent mappings", () => {
  const prefill = buildTikTokManagementRequestPrefill({
    accountIdentity: "advertiser-1",
    accountName: "TikTok - Example",
    resource: adGroup,
    fieldPath: "ad_group.optimization_goal",
  });

  assert.equal(prefill.accountIdentity, "advertiser-1");
  assert.equal(prefill.campaignIdentity, "campaign-1");
  assert.deepEqual(prefill.items[0], {
    entity_type: "ad_group",
    entity_identity: "adgroup-1",
    field_path: "ad_group.optimization_goal",
    value_type: "string",
    baseline_value: "CONVERT",
    proposed_value: "",
    evidence: {
      source: "tiktok_management",
      baseline_source: "synchronized_tiktok_resource",
      account_name: "TikTok - Example",
      campaign_name: "Prospecting",
    },
    platform_resource_mapping: {
      advertiser_id: "advertiser-1",
      campaign_id: "campaign-1",
      adgroup_id: "adgroup-1",
    },
  });
});

test("TikTok creative prefills contain deterministic disabled replacement evidence", () => {
  const prefill = buildTikTokManagementRequestPrefill({
    accountIdentity: "advertiser-1",
    accountName: "TikTok - Example",
    resource: ad,
    fieldPath: "ad.creative.video_reference",
  });

  assert.deepEqual(prefill.items[0]?.platform_resource_mapping, {
    advertiser_id: "advertiser-1",
    campaign_id: "campaign-1",
    adgroup_id: "adgroup-1",
    ad_id: "ad-1",
    previous_ad_id: "ad-1",
    identity_id: "identity-1",
    video_id: "video-1",
    creative_mode: "REGULAR",
    intended_status: "DISABLE",
  });
});

test("TikTok management blocks a draft whose official baseline is unavailable", () => {
  const missing = { ...campaign, managementFields: {} };
  assert.equal(resolveTikTokManagementBaseline(missing, "campaign.budget.amount").available, false);
  const prefill = buildTikTokManagementRequestPrefill({
    accountIdentity: "advertiser-1",
    accountName: "TikTok - Example",
    resource: missing,
    fieldPath: "campaign.budget.amount",
  });
  const form = buildM03RequestForm({ scope: { platform: "tiktok", accountIdentity: "advertiser-1" }, prefill });
  form.title = "Budget change";
  form.reason = "Approved optimization";
  form.items[0]!.proposed_value = "300";
  assert.match(validateTikTokManagementRequestForm(form, missing).join(" "), /Official baseline unavailable/);
});

test("TikTok preview nodes convert to management resources without losing official fields", () => {
  const campaignNode = { id: "campaign-1", name: "Prospecting", status: "ENABLE", managementFields: campaign.managementFields };
  const adGroupNode = { id: "adgroup-1", name: "Broad", status: "DISABLE", managementFields: adGroup.managementFields };
  const adNode = { id: "ad-1", name: "Video A", status: "ENABLE", managementFields: ad.managementFields };

  assert.equal(toTikTokCampaignManagementResource(campaignNode).entityType, "campaign");
  assert.equal(toTikTokAdGroupManagementResource(campaignNode, adGroupNode).adGroupIdentity, "adgroup-1");
  assert.equal(toTikTokAdManagementResource(campaignNode, adGroupNode, adNode).managementFields["ad.copy.primary_text"], "Original copy");
});
