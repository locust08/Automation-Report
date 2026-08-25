import { canonicalM03Hash, m03BaselineKey, type M03ProviderBaseline } from "@/lib/change-control/provider-contract";
import { retrieveOfficialM03Baseline } from "@/lib/change-control/provider-baselines";
import { M03RepositoryError, verifyM04LaunchHandoff } from "@/lib/change-control/repository";
import type { M03MockChangeRequestInput } from "@/lib/change-control/types";

export type M03SourceBoundary =
  | { source_kind: "m04_verified_launch"; evidence: Record<string, unknown>; source_revision_hash: string }
  | { source_kind: "legacy_provider_adoption"; evidence: Record<string, unknown>; baseline: M03ProviderBaseline };

export async function verifyM03SourceBoundary(input: M03MockChangeRequestInput): Promise<M03SourceBoundary> {
  const hasPlan = input.source_m04_plan_id != null;
  const hasRevision = input.source_m04_revision_id != null;
  if (hasPlan !== hasRevision) throw new M03RepositoryError("Enter both the M04 plan ID and revision ID, or leave both blank for audited legacy adoption.", 400);
  if (hasPlan && hasRevision) {
    const evidence = await verifyM04LaunchHandoff(input);
    return {
      source_kind: "m04_verified_launch",
      source_revision_hash: String(evidence.revision_hash ?? ""),
      evidence,
    };
  }

  const baseline = await retrieveOfficialM03Baseline(input.platform, {
    accountIdentity: input.account_identity,
    campaignIdentity: input.campaign_identity,
    items: input.items,
  });
  const reviewed = Object.fromEntries(input.items.map((item) => [m03BaselineKey(item), item.baseline_value]));
  if (baseline.payload_hash !== canonicalM03Hash(reviewed)) {
    throw new M03RepositoryError("The official provider baseline does not match the entered baseline values. Refresh the campaign and resolve the conflict before creating this request.", 409);
  }
  return {
    source_kind: "legacy_provider_adoption",
    baseline,
    evidence: {
      baseline_hash: baseline.payload_hash,
      captured_at: baseline.captured_at,
      source: baseline.source,
    },
  };
}
