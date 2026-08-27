import type { M03ChangeItemInput } from "./types";
import type { M03RequestForm, M03RequestPrefill } from "./workspace";
import { getM03GoogleChangeField, googleChangeFieldsForEntity, type M03GoogleEntityType } from "./google-capability-registry";

type GoogleField = { fieldKey: string; value: unknown };
type GoogleNode = { id: string; name: string; status: string; fields: readonly GoogleField[] };

export type M03GoogleManagementResource = {
  entityType: Exclude<M03GoogleEntityType, "recommendation">;
  entityIdentity: string;
  name: string;
  status: string;
  campaignIdentity: string;
  campaignName: string;
  adGroupIdentity?: string;
  fields: readonly GoogleField[];
};

export function toGoogleCampaignManagementResource(campaign: GoogleNode): M03GoogleManagementResource {
  return { entityType: "campaign", entityIdentity: campaign.id, name: campaign.name, status: campaign.status, campaignIdentity: campaign.id, campaignName: campaign.name, fields: campaign.fields };
}

export function toGoogleAdGroupManagementResource(campaign: GoogleNode, adGroup: GoogleNode): M03GoogleManagementResource {
  return { entityType: "ad_group", entityIdentity: adGroup.id, name: adGroup.name, status: adGroup.status, campaignIdentity: campaign.id, campaignName: campaign.name, adGroupIdentity: adGroup.id, fields: adGroup.fields };
}

export function toGoogleAdManagementResource(campaign: GoogleNode, adGroup: GoogleNode, ad: GoogleNode): M03GoogleManagementResource {
  return { entityType: "ad", entityIdentity: ad.id, name: ad.name, status: ad.status, campaignIdentity: campaign.id, campaignName: campaign.name, adGroupIdentity: adGroup.id, fields: ad.fields };
}

export function resolveGoogleManagementBaseline(resource: M03GoogleManagementResource, fieldPath: string) {
  const capability = getM03GoogleChangeField(fieldPath);
  if (!capability || capability.entity_type !== resource.entityType) return { available: false as const, value: undefined };
  const sourceKey = capability.source_field_key ?? capability.field_path;
  const source = resource.fields.find((field) => field.fieldKey === sourceKey);
  if (source) return { available: true as const, value: source.value };
  if (fieldPath.endsWith(".name")) return { available: true as const, value: resource.name };
  if (fieldPath.endsWith(".status")) return { available: true as const, value: resource.status };
  return { available: false as const, value: undefined };
}

export function buildGoogleManagementRequestPrefill(input: { accountIdentity: string; accountName: string; resource: M03GoogleManagementResource; fieldPath?: string }): M03RequestPrefill {
  const field = input.fieldPath ? getM03GoogleChangeField(input.fieldPath) : googleChangeFieldsForEntity(input.resource.entityType)[0];
  if (!field || field.entity_type !== input.resource.entityType) throw new Error("The selected field is not supported for this Google Ads resource.");
  return {
    accountIdentity: input.accountIdentity.replace(/\D/g, ""),
    campaignIdentity: input.resource.campaignIdentity,
    entityType: input.resource.entityType,
    entityIdentity: input.resource.entityIdentity,
    title: `${field.label} · ${input.resource.name}`,
    items: [buildItem(input, field.field_path)],
  };
}

export function resolveGoogleManagementResourceForForm(form: M03RequestForm, resources: readonly M03GoogleManagementResource[]) {
  const first = form.items[0];
  if (!first) return { resource: null, issue: "This request has no Google Ads entity." };
  const resource = resources.find((candidate) => candidate.entityType === first.entity_type && candidate.entityIdentity === first.entity_identity) ?? null;
  return resource ? { resource, issue: null } : { resource: null, issue: `Synchronized Google Ads ${first.entity_type} ${first.entity_identity} is unavailable. Refresh official data before saving.` };
}

export function refreshGoogleManagementFormFromResource(form: M03RequestForm, input: { accountIdentity: string; accountName: string; resource: M03GoogleManagementResource }): M03RequestForm {
  return {
    ...form,
    items: form.items.map((item) => ({ ...buildItem(input, item.field_path), proposed_value: item.proposed_value })),
  };
}

export function validateGoogleManagementRequestForm(form: M03RequestForm, resource: M03GoogleManagementResource | null): string[] {
  const issues: string[] = [];
  if (!resource) issues.push("The synchronized Google Ads resource is unavailable. Refresh official data before saving.");
  for (const item of form.items) {
    if (typeof item.evidence?.baseline_unavailable_message === "string") issues.push(`${item.evidence.baseline_unavailable_message} Refresh official data before saving.`);
  }
  return issues;
}

export function buildGoogleManagementChangeItem(input: { accountIdentity: string; accountName: string; resource: M03GoogleManagementResource; fieldPath: string }) {
  return buildItem(input, input.fieldPath);
}

function buildItem(input: { accountIdentity: string; accountName: string; resource: M03GoogleManagementResource }, fieldPath: string): M03ChangeItemInput {
  const field = getM03GoogleChangeField(fieldPath)!;
  const baseline = resolveGoogleManagementBaseline(input.resource, fieldPath);
  const customerId = input.accountIdentity.replace(/\D/g, "");
  const mapping: Record<string, unknown> = { customer_id: customerId, campaign_id: input.resource.campaignIdentity };
  if (input.resource.adGroupIdentity) mapping.ad_group_id = input.resource.adGroupIdentity;
  if (input.resource.entityType === "ad") {
    mapping.ad_id = input.resource.entityIdentity;
    mapping.previous_ad_id = input.resource.entityIdentity;
    mapping.intended_status = "PAUSED";
  }
  return {
    entity_type: input.resource.entityType,
    entity_identity: input.resource.entityIdentity,
    field_path: field.field_path,
    value_type: field.value_type,
    baseline_value: baseline.available ? baseline.value : "",
    proposed_value: "",
    evidence: {
      source: "google_management",
      baseline_source: "synchronized_google_resource",
      account_name: input.accountName,
      campaign_name: input.resource.campaignName,
      ...(!baseline.available ? { baseline_unavailable_message: `Official baseline unavailable for ${field.label}.` } : {}),
    },
    platform_resource_mapping: mapping,
  };
}
