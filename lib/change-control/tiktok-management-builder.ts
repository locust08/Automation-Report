import type { M03ChangeItemInput } from "./types";
import type { M03RequestForm, M03RequestPrefill } from "./workspace";
import {
  getM03TikTokChangeField,
  m03TikTokChangeFieldsForEntity,
  type M03TikTokEntityType,
} from "./tiktok-capability-registry";

type TikTokNode = {
  id: string;
  name: string;
  status: string;
  managementFields?: Record<string, unknown>;
};

export type M03TikTokManagementResource = {
  entityType: M03TikTokEntityType;
  entityIdentity: string;
  name: string;
  status: string;
  campaignIdentity: string;
  campaignName: string;
  adGroupIdentity?: string;
  managementFields: Record<string, unknown>;
};

export function toTikTokCampaignManagementResource(campaign: TikTokNode): M03TikTokManagementResource {
  return resource("campaign", campaign, campaign.id, campaign.name);
}

export function toTikTokAdGroupManagementResource(campaign: TikTokNode, adGroup: TikTokNode): M03TikTokManagementResource {
  return { ...resource("ad_group", adGroup, campaign.id, campaign.name), adGroupIdentity: adGroup.id };
}

export function toTikTokAdManagementResource(campaign: TikTokNode, adGroup: TikTokNode, ad: TikTokNode): M03TikTokManagementResource {
  return { ...resource("ad", ad, campaign.id, campaign.name), adGroupIdentity: adGroup.id };
}

export function resolveTikTokManagementBaseline(resourceInput: M03TikTokManagementResource, fieldPath: string) {
  const capability = getM03TikTokChangeField(fieldPath);
  if (!capability || capability.entity_type !== resourceInput.entityType) return { available: false as const, value: undefined };
  if (Object.prototype.hasOwnProperty.call(resourceInput.managementFields, fieldPath)) {
    return { available: true as const, value: resourceInput.managementFields[fieldPath] };
  }
  if (fieldPath.endsWith(".name")) return { available: true as const, value: resourceInput.name };
  if (fieldPath.endsWith(".status")) return { available: true as const, value: resourceInput.status };
  return { available: false as const, value: undefined };
}

export function buildTikTokManagementRequestPrefill(input: {
  accountIdentity: string;
  accountName: string;
  resource: M03TikTokManagementResource;
  fieldPath?: string;
}): M03RequestPrefill {
  const field = input.fieldPath
    ? getM03TikTokChangeField(input.fieldPath)
    : m03TikTokChangeFieldsForEntity(input.resource.entityType)[0];
  if (!field || field.entity_type !== input.resource.entityType) throw new Error("The selected field is not supported for this TikTok Ads resource.");
  return {
    accountIdentity: input.accountIdentity.trim(),
    campaignIdentity: input.resource.campaignIdentity,
    entityType: input.resource.entityType,
    entityIdentity: input.resource.entityIdentity,
    title: `${field.label} · ${input.resource.name}`,
    items: [buildTikTokManagementChangeItem({ ...input, fieldPath: field.field_path })],
  };
}

export function buildTikTokManagementChangeItem(input: {
  accountIdentity: string;
  accountName: string;
  resource: M03TikTokManagementResource;
  fieldPath: string;
}): M03ChangeItemInput {
  const field = getM03TikTokChangeField(input.fieldPath);
  if (!field || field.entity_type !== input.resource.entityType) throw new Error("The selected field is not supported for this TikTok Ads resource.");
  const baseline = resolveTikTokManagementBaseline(input.resource, field.field_path);
  const mapping: Record<string, unknown> = {
    advertiser_id: input.accountIdentity.trim(),
    campaign_id: input.resource.campaignIdentity,
  };
  if (input.resource.adGroupIdentity) mapping.adgroup_id = input.resource.adGroupIdentity;
  if (input.resource.entityType === "ad") {
    mapping.ad_id = input.resource.entityIdentity;
    mapping.previous_ad_id = input.resource.entityIdentity;
    mapping.identity_id = input.resource.managementFields["ad.creative.identity_reference"];
    mapping.video_id = input.resource.managementFields["ad.creative.video_reference"];
    mapping.creative_mode = "REGULAR";
    mapping.intended_status = "DISABLE";
  }
  return {
    entity_type: input.resource.entityType,
    entity_identity: input.resource.entityIdentity,
    field_path: field.field_path,
    value_type: field.value_type,
    baseline_value: baseline.available ? baseline.value : "",
    proposed_value: "",
    evidence: {
      source: "tiktok_management",
      baseline_source: "synchronized_tiktok_resource",
      account_name: input.accountName,
      campaign_name: input.resource.campaignName,
      ...(!baseline.available ? { baseline_unavailable_message: `Official baseline unavailable for ${field.label}.` } : {}),
    },
    platform_resource_mapping: cleanMapping(mapping),
  };
}

export function resolveTikTokManagementResourceForForm(form: M03RequestForm, resources: readonly M03TikTokManagementResource[]) {
  const first = form.items[0];
  if (!first) return { resource: null, issue: "This request has no TikTok Ads entity." };
  const found = resources.find((candidate) => candidate.entityType === first.entity_type && candidate.entityIdentity === first.entity_identity) ?? null;
  return found ? { resource: found, issue: null } : { resource: null, issue: `Synchronized TikTok Ads ${first.entity_type} ${first.entity_identity} is unavailable. Refresh official data before saving.` };
}

export function refreshTikTokManagementFormFromResource(form: M03RequestForm, input: { accountIdentity: string; accountName: string; resource: M03TikTokManagementResource }): M03RequestForm {
  return {
    ...form,
    items: form.items.map((item) => ({ ...buildTikTokManagementChangeItem({ ...input, fieldPath: item.field_path }), proposed_value: item.proposed_value })),
  };
}

export function validateTikTokManagementRequestForm(form: M03RequestForm, officialResource: M03TikTokManagementResource | null): string[] {
  const issues: string[] = [];
  if (!officialResource) issues.push("The synchronized TikTok Ads resource is unavailable. Refresh official data before saving.");
  for (const item of form.items) {
    if (officialResource && (item.entity_type !== officialResource.entityType || item.entity_identity !== officialResource.entityIdentity)) {
      issues.push(`All TikTok management items must retain ${officialResource.entityType} ${officialResource.entityIdentity}.`);
    }
    if (typeof item.evidence?.baseline_unavailable_message === "string") issues.push(`${item.evidence.baseline_unavailable_message} Refresh official data before saving.`);
  }
  return issues;
}

function resource(entityType: M03TikTokEntityType, node: TikTokNode, campaignIdentity: string, campaignName: string): M03TikTokManagementResource {
  return { entityType, entityIdentity: node.id, name: node.name, status: node.status, campaignIdentity, campaignName, managementFields: node.managementFields ?? {} };
}

function cleanMapping(mapping: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(mapping).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}
