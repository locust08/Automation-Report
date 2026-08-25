import { getCachedManagedCampaigns } from "@/lib/ads-management/cache";
import type { ManagedFieldValue } from "@/lib/ads-management/types";

export type GoogleSynchronizedResourceType = "campaign" | "ad_group" | "ad";

export interface GoogleSynchronizedResource {
  id: string;
  type: GoogleSynchronizedResourceType;
  name: string;
  status: string;
  campaign_id: string;
  parent_id: string | null;
  fields: Array<Pick<ManagedFieldValue, "fieldKey" | "fieldLabel" | "valueType" | "value" | "editable">>;
}

export async function discoverGoogleSynchronizedResources(input: {
  accountIdentity: string;
  type: GoogleSynchronizedResourceType;
  parentIdentity?: string;
  search?: string;
}) {
  const { campaigns, synchronizedAt } = await getCachedManagedCampaigns(input.accountIdentity, {});
  const resources: GoogleSynchronizedResource[] = [];
  for (const campaign of campaigns) {
    if (input.type === "campaign") {
      resources.push({ id: campaign.id, type: "campaign", name: campaign.name, status: campaign.status, campaign_id: campaign.id, parent_id: null, fields: editableFields(campaign.fields) });
      continue;
    }
    for (const adGroup of campaign.adGroups) {
      if (input.type === "ad_group") {
        if (!input.parentIdentity || input.parentIdentity === campaign.id) resources.push({ id: adGroup.id, type: "ad_group", name: adGroup.name, status: adGroup.status, campaign_id: campaign.id, parent_id: campaign.id, fields: editableFields(adGroup.fields) });
        continue;
      }
      for (const ad of adGroup.ads) {
        if (!input.parentIdentity || input.parentIdentity === adGroup.id || input.parentIdentity === campaign.id) resources.push({ id: ad.id, type: "ad", name: ad.name, status: ad.status, campaign_id: campaign.id, parent_id: adGroup.id, fields: editableFields(ad.fields) });
      }
    }
  }
  const term = input.search?.trim().toLowerCase();
  return { synchronized_at: synchronizedAt, resources: term ? resources.filter((resource) => resource.id.toLowerCase().includes(term) || resource.name.toLowerCase().includes(term)) : resources };
}

function editableFields(fields: ManagedFieldValue[]) {
  return fields.filter((field) => field.editable).map(({ fieldKey, fieldLabel, valueType, value, editable }) => ({ fieldKey, fieldLabel, valueType, value, editable }));
}
