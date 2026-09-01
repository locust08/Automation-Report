import {
  getM03MetaChangeField,
  m03MetaChangeFieldsForEntity,
  type M03MetaEntityType,
} from "./meta-capability-registry";
import type { M03ChangeItemInput } from "./types";
import type { M03RequestForm, M03RequestPrefill } from "./workspace";

export type M03MetaManagementCreative = {
  id?: string | null;
  body?: string | null;
  title?: string | null;
  description?: string | null;
  linkUrl?: string | null;
  callToActionType?: string | null;
  pageId?: string | null;
  instagramActorId?: string | null;
  imageHash?: string | null;
  videoId?: string | null;
  effectiveObjectStoryId?: string | null;
};

export type M03MetaManagementResource = {
  entityType: M03MetaEntityType;
  entityIdentity: string;
  name: string;
  status: string;
  campaignIdentity: string;
  campaignName: string;
  adSetIdentity?: string;
  managementFields: Record<string, unknown>;
  creative?: M03MetaManagementCreative | null;
};

export type M03MetaManagementBuilderInput = {
  accountIdentity: string;
  accountName: string;
  resource: M03MetaManagementResource;
  fieldPath?: string;
};

type MetaManagementNode = {
  id: string;
  name: string;
  status: string;
  managementFields?: Record<string, unknown>;
};

type MetaManagementAdNode = MetaManagementNode & {
  creative?: M03MetaManagementCreative | null;
};

export type M03MetaBaselineResolution =
  | { available: true; value: unknown }
  | { available: false; value: undefined; message: string };

export function resolveMetaManagementBaseline(
  resource: M03MetaManagementResource,
  fieldPath: string,
): M03MetaBaselineResolution {
  const field = getM03MetaChangeField(fieldPath);
  if (!field || field.entity_type !== resource.entityType) {
    return {
      available: false,
      value: undefined,
      message: `Official baseline unavailable for ${fieldPath || "the selected field"}.`,
    };
  }
  if (fieldPath.endsWith(".name")) return { available: true, value: resource.name };
  if (fieldPath.endsWith(".status")) return { available: true, value: resource.status };

  const creativeKey = CREATIVE_BASELINE_KEYS[fieldPath];
  if (creativeKey && resource.creative && Object.prototype.hasOwnProperty.call(resource.creative, creativeKey)) {
    return { available: true, value: resource.creative[creativeKey] ?? "" };
  }
  if (Object.prototype.hasOwnProperty.call(resource.managementFields, fieldPath)) {
    return { available: true, value: resource.managementFields[fieldPath] };
  }
  return {
    available: false,
    value: undefined,
    message: `Official baseline unavailable for ${field.label} (${field.field_path}).`,
  };
}

export function toMetaCampaignManagementResource(campaign: MetaManagementNode): M03MetaManagementResource {
  return {
    entityType: "campaign",
    entityIdentity: campaign.id,
    name: campaign.name,
    status: campaign.status,
    campaignIdentity: campaign.id,
    campaignName: campaign.name,
    managementFields: { ...campaign.managementFields },
  };
}

export function toMetaAdSetManagementResource(
  campaign: MetaManagementNode,
  adSet: MetaManagementNode,
): M03MetaManagementResource {
  return {
    entityType: "ad_set",
    entityIdentity: adSet.id,
    name: adSet.name,
    status: adSet.status,
    campaignIdentity: campaign.id,
    campaignName: campaign.name,
    adSetIdentity: adSet.id,
    managementFields: { ...adSet.managementFields },
  };
}

export function toMetaAdManagementResource(
  campaign: MetaManagementNode,
  adSet: MetaManagementNode,
  ad: MetaManagementAdNode,
): M03MetaManagementResource {
  return {
    entityType: "ad",
    entityIdentity: ad.id,
    name: ad.name,
    status: ad.status,
    campaignIdentity: campaign.id,
    campaignName: campaign.name,
    adSetIdentity: adSet.id,
    managementFields: { ...ad.managementFields },
    creative: ad.creative ? { ...ad.creative } : ad.creative,
  };
}

export function buildMetaManagementRequestPrefill(input: M03MetaManagementBuilderInput): M03RequestPrefill {
  const field = selectedField(input);
  return {
    accountIdentity: normalizeMetaAccountIdentity(input.accountIdentity),
    campaignIdentity: input.resource.campaignIdentity,
    entityType: input.resource.entityType,
    entityIdentity: input.resource.entityIdentity,
    title: `${field.label} · ${input.resource.name}`,
    items: [buildMetaManagementChangeItem(input, field.field_path)],
  };
}

export function addMetaManagementPrefillItem(
  prefill: M03RequestPrefill,
  input: M03MetaManagementBuilderInput & { fieldPath: string },
): M03RequestPrefill {
  return {
    ...prefill,
    items: [...prefill.items, buildMetaManagementChangeItem(input, input.fieldPath)],
  };
}

export function buildMetaManagementChangeItem(
  input: M03MetaManagementBuilderInput,
  fieldPath = selectedField(input).field_path,
): M03ChangeItemInput {
  const field = getM03MetaChangeField(fieldPath);
  if (!field || field.entity_type !== input.resource.entityType) {
    throw new Error(`${fieldPath || "The selected field"} is not supported for this Meta ${input.resource.entityType}.`);
  }
  const baseline = resolveMetaManagementBaseline(input.resource, fieldPath);
  return {
    entity_type: input.resource.entityType,
    entity_identity: input.resource.entityIdentity,
    field_path: field.field_path,
    value_type: field.value_type,
    baseline_value: baseline.available ? baseline.value : "",
    proposed_value: "",
    evidence: {
      source: "meta_management",
      baseline_source: "synchronized_meta_resource",
      account_name: input.accountName,
      campaign_name: input.resource.campaignName,
      ...(!baseline.available ? { baseline_unavailable_message: baseline.message } : {}),
    },
    platform_resource_mapping: buildMetaResourceMapping(input.accountIdentity, input.resource, field.mutation_mode),
  };
}

export function validateMetaManagementRequestForm(
  form: M03RequestForm,
  options: { officialResource?: M03MetaManagementResource | null } = {},
): string[] {
  const issues: string[] = [];
  if (!form.title.trim()) issues.push("Request title is required.");
  if (!form.reason.trim()) issues.push("Reason is required.");
  const first = form.items[0];
  if (options.officialResource === null && first) {
    issues.push(`Synchronized Meta ${first.entity_type} ${first.entity_identity} is unavailable. Refresh official data before editing or saving.`);
  }
  for (const item of form.items) {
    const field = getM03MetaChangeField(item.field_path);
    const label = field ? `${field.label} (${field.field_path})` : item.field_path || "the selected field";
    const baselineMessage = typeof item.evidence?.baseline_unavailable_message === "string"
      ? item.evidence.baseline_unavailable_message
      : null;
    if (baselineMessage) issues.push(`${baselineMessage} Refresh official data before saving.`);
    if (first && (item.entity_type !== first.entity_type || item.entity_identity !== first.entity_identity)) {
      issues.push(`All Meta management items must retain ${first.entity_type} ${first.entity_identity}.`);
    }
    if (isMissingProposedValue(item.proposed_value)) issues.push(`Proposed value is required for ${label}.`);
    if (field?.mutation_mode === "creative_replacement") {
      addMissingMappingIssue(issues, item.platform_resource_mapping, "account_id", "Meta account ID");
      addMissingMappingIssue(issues, item.platform_resource_mapping, "campaign_id", "Meta campaign ID");
      addMissingMappingIssue(issues, item.platform_resource_mapping, "ad_set_id", "Meta ad set ID");
      addMissingMappingIssue(issues, item.platform_resource_mapping, "previous_ad_id", "previous Meta ad ID");
      addMissingMappingIssue(issues, item.platform_resource_mapping, "page_id", "Facebook Page ID");
    }
  }
  return issues;
}

export function resolveMetaManagementResourceForForm(
  form: M03RequestForm,
  resources: readonly M03MetaManagementResource[],
): { resource: M03MetaManagementResource | null; issue: string | null } {
  const first = form.items[0];
  if (!first) return { resource: null, issue: "This request has no Meta entity. Refresh official data before editing or saving." };
  const sameEntity = form.items.every((item) => item.entity_type === first.entity_type && item.entity_identity === first.entity_identity);
  if (!sameEntity) return { resource: null, issue: "This request targets multiple Meta entities. Refresh official data and reconcile the request before editing." };
  const resource = resources.find((candidate) => candidate.entityType === first.entity_type && candidate.entityIdentity === first.entity_identity) ?? null;
  return resource
    ? { resource, issue: null }
    : { resource: null, issue: `Synchronized Meta ${first.entity_type} ${first.entity_identity} is unavailable. Refresh official data before editing or saving.` };
}

export function refreshMetaManagementFormFromResource(
  form: M03RequestForm,
  input: Omit<M03MetaManagementBuilderInput, "fieldPath">,
): M03RequestForm {
  return {
    ...form,
    items: form.items.map((item) => {
      const refreshed = buildMetaManagementChangeItem({ ...input, fieldPath: item.field_path });
      return { ...refreshed, proposed_value: item.proposed_value };
    }),
  };
}

function selectedField(input: M03MetaManagementBuilderInput) {
  const field = input.fieldPath
    ? getM03MetaChangeField(input.fieldPath)
    : m03MetaChangeFieldsForEntity(input.resource.entityType)[0];
  if (!field || field.entity_type !== input.resource.entityType) {
    throw new Error(`${input.fieldPath || "The selected field"} is not supported for this Meta ${input.resource.entityType}.`);
  }
  return field;
}

function buildMetaResourceMapping(
  accountIdentity: string,
  resource: M03MetaManagementResource,
  mutationMode: "direct_update" | "creative_replacement",
): Record<string, unknown> {
  const mapping: Record<string, unknown> = {
    account_id: normalizeMetaAccountIdentity(accountIdentity),
    campaign_id: resource.campaignIdentity,
  };
  if (resource.adSetIdentity) mapping.ad_set_id = resource.adSetIdentity;
  if (resource.entityType === "ad") mapping.ad_id = resource.entityIdentity;
  if (mutationMode !== "creative_replacement") return mapping;

  mapping.previous_ad_id = resource.entityIdentity;
  mapping.intended_status = "PAUSED";
  const creative = resource.creative;
  copyMappingValue(mapping, "previous_creative_id", creative?.id);
  copyMappingValue(mapping, "page_id", creative?.pageId);
  copyMappingValue(mapping, "instagram_actor_id", creative?.instagramActorId);
  copyMappingValue(mapping, "image_hash", creative?.imageHash);
  copyMappingValue(mapping, "video_id", creative?.videoId);
  copyMappingValue(mapping, "effective_object_story_id", creative?.effectiveObjectStoryId);
  return mapping;
}

function copyMappingValue(mapping: Record<string, unknown>, key: string, value: string | null | undefined) {
  if (value?.trim()) mapping[key] = value.trim();
}

function addMissingMappingIssue(
  issues: string[],
  mapping: Record<string, unknown> | undefined,
  key: string,
  label: string,
) {
  if (typeof mapping?.[key] !== "string" || !String(mapping[key]).trim()) {
    issues.push(`${label} is required for creative replacement.`);
  }
}

function normalizeMetaAccountIdentity(value: string) {
  return value.trim().replace(/^act_/i, "").replace(/\D/g, "");
}

function isMissingProposedValue(value: unknown) {
  return value == null || (typeof value === "string" && !value.trim());
}

const CREATIVE_BASELINE_KEYS: Record<string, keyof M03MetaManagementCreative> = {
  "ad.copy.primary_text": "body",
  "ad.copy.headline": "title",
  "ad.copy.description": "description",
  "ad.creative.call_to_action": "callToActionType",
  "ad.creative.destination_url": "linkUrl",
};
