import assert from "node:assert/strict";
import test from "node:test";

import { resolveM03Capability } from "./provider-contract";
import {
  M03_GOOGLE_CHANGE_FIELDS,
  googleChangeFieldsForEntity,
} from "./google-capability-registry";
import {
  buildGoogleManagementRequestPrefill,
  refreshGoogleManagementFormFromResource,
  resolveGoogleManagementResourceForForm,
  resolveGoogleManagementBaseline,
  toGoogleAdGroupManagementResource,
  toGoogleAdManagementResource,
  toGoogleCampaignManagementResource,
} from "./google-management-builder";
import { buildM03RequestForm } from "./workspace";

const campaign = {
  id: "campaign-1",
  name: "Search MY",
  status: "ENABLED",
  fields: [
    field("campaign", "campaign-1", "campaign.name", "Campaign name", "Search MY"),
    field("campaign", "campaign-1", "campaign.status", "Campaign status", "ENABLED"),
    field("campaign", "campaign-1", "campaign_budget.amount_micros", "Daily budget", "25000000", "number"),
  ],
  adGroups: [],
};

test("every displayed Google management field resolves to a reviewed provider rule", () => {
  assert.ok(M03_GOOGLE_CHANGE_FIELDS.length > 0);
  for (const field of M03_GOOGLE_CHANGE_FIELDS) {
    const capability = resolveM03Capability("google", field.field_path);
    assert.equal(capability.mode, field.mutation_mode, field.field_path);
    assert.equal(capability.provider_resource, field.provider_resource, field.field_path);
  }
});

test("Google campaign prefill maps synchronized field keys to canonical paths and official baselines", () => {
  const resource = toGoogleCampaignManagementResource(campaign);
  const prefill = buildGoogleManagementRequestPrefill({
    accountIdentity: "123-456-7890",
    accountName: "Google - Example",
    resource,
    fieldPath: "campaign.budget.amount_micros",
  });

  assert.equal(prefill.accountIdentity, "1234567890");
  assert.equal(prefill.campaignIdentity, "campaign-1");
  assert.deepEqual(prefill.items[0], {
    entity_type: "campaign",
    entity_identity: "campaign-1",
    field_path: "campaign.budget.amount_micros",
    value_type: "number",
    baseline_value: "25000000",
    proposed_value: "",
    evidence: {
      source: "google_management",
      baseline_source: "synchronized_google_resource",
      account_name: "Google - Example",
      campaign_name: "Search MY",
    },
    platform_resource_mapping: { customer_id: "1234567890", campaign_id: "campaign-1" },
  });
});

test("Google ad group and ad prefills retain provider resource mappings", () => {
  const adGroup = {
    id: "group-1",
    name: "Malaysia",
    status: "ENABLED",
    fields: [field("ad_group", "group-1", "ad_group.cpc_bid_micros", "CPC bid", "1500000", "number")],
    ads: [],
  };
  const ad = {
    id: "ad-1",
    name: "Responsive ad",
    status: "ENABLED",
    fields: [field("ad", "ad-1", "ad.headlines", "Headlines", [{ text: "Old headline" }], "json")],
  };
  const groupResource = toGoogleAdGroupManagementResource(campaign, adGroup);
  const adResource = toGoogleAdManagementResource(campaign, adGroup, ad);

  assert.equal(resolveGoogleManagementBaseline(groupResource, "ad_group.bid.cpc_bid_micros").value, "1500000");
  assert.deepEqual(buildGoogleManagementRequestPrefill({ accountIdentity: "1234567890", accountName: "Google", resource: adResource, fieldPath: "ad.copy.headlines" }).items[0]?.platform_resource_mapping, {
    customer_id: "1234567890",
    campaign_id: "campaign-1",
    ad_group_id: "group-1",
    ad_id: "ad-1",
    previous_ad_id: "ad-1",
    intended_status: "PAUSED",
  });
  assert.ok(googleChangeFieldsForEntity("ad").some((entry) => entry.field_path === "ad.copy.headlines"));
});

test("Google embedded edits resolve and refresh the exact synchronized resource while preserving operator input", () => {
  const resource = toGoogleCampaignManagementResource(campaign);
  const form = buildM03RequestForm({ scope: { platform: "google", accountIdentity: "1234567890" }, prefill: buildGoogleManagementRequestPrefill({ accountIdentity: "1234567890", accountName: "Google", resource, fieldPath: "campaign.name" }) });
  form.reason = "Keep this reason";
  form.items[0]!.proposed_value = "New campaign name";

  assert.equal(resolveGoogleManagementResourceForForm(form, [resource]).resource?.entityIdentity, "campaign-1");
  const refreshedResource = { ...resource, name: "Official latest name", fields: [field("campaign", "campaign-1", "campaign.name", "Campaign name", "Official latest name")] };
  const refreshed = refreshGoogleManagementFormFromResource(form, { accountIdentity: "1234567890", accountName: "Google", resource: refreshedResource });
  assert.equal(refreshed.reason, "Keep this reason");
  assert.equal(refreshed.items[0]?.proposed_value, "New campaign name");
  assert.equal(refreshed.items[0]?.baseline_value, "Official latest name");
});

function field(entityType: string, entityId: string, fieldKey: string, fieldLabel: string, value: unknown, valueType = "string") {
  return { entityType, entityId, entityName: entityId, fieldKey, fieldLabel, valueType, value, editable: true };
}
