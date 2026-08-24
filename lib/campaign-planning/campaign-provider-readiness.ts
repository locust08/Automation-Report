import { campaignPlanDraftInputSchema, campaignPlanSchema } from "./domain";

export type CampaignUnresolvedResource = {
  logicalKey: string;
  resourceType: string;
  role: string;
  referenceId: string;
};

export type CampaignProviderReadiness = {
  schemaVersion: number;
  structurallyValid: boolean;
  providerReady: boolean;
  unresolvedResources: CampaignUnresolvedResource[];
};

export function evaluateCampaignProviderReadiness(value: unknown): CampaignProviderReadiness {
  const structurallyValid = campaignPlanDraftInputSchema.safeParse(value).success || campaignPlanSchema.safeParse(value).success;
  const plan = objectValue(value);
  const schemaVersion = numberValue(plan.schema_version, 1);
  const preparation = objectValue(plan.provider_preparation);
  const compliance = objectValue(preparation.compliance);
  const references = Array.isArray(preparation.resource_references)
    ? preparation.resource_references.map(objectValue)
    : [];
  const unresolvedResources = references
    .filter((reference) => reference.resolution_status !== "resolved" || !stringValue(reference.provider_resource_id))
    .map((reference) => ({
      logicalKey: stringValue(reference.logical_key),
      resourceType: stringValue(reference.resource_type),
      role: stringValue(reference.role),
      referenceId: stringValue(reference.reference_id),
    }));
  return {
    schemaVersion,
    structurallyValid,
    providerReady: schemaVersion === 2 && structurallyValid && unresolvedResources.length === 0 && !Object.values(compliance).some((value) => value === false || value === "pending"),
    unresolvedResources,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
