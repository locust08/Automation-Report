import { canonicalM03Hash, m03BaselineKey, type M03ProviderBaseline } from "@/lib/change-control/provider-contract";
import { retrieveOfficialM03Baseline } from "@/lib/change-control/provider-baselines";
import { M03RepositoryError, verifyM04LaunchHandoff } from "@/lib/change-control/repository";
import type { M03MockChangeRequestInput } from "@/lib/change-control/types";
import { z } from "zod";
import { officialPauseTransport } from "./pause-transport";

export type M03SourceBoundary =
  | { source_kind: "m04_verified_launch"; evidence: Record<string, unknown>; source_revision_hash: string }
  | { source_kind: "legacy_provider_adoption"; evidence: Record<string, unknown>; baseline: M03ProviderBaseline };

export async function verifyM03SourceBoundary(input: M03MockChangeRequestInput, env: Record<string, string | undefined> = process.env): Promise<M03SourceBoundary> {
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

  const scopedPause = ["google", "meta"].includes(input.platform) && input.items.length === 1 && input.items[0]!.entity_type === "campaign" && input.items[0]!.entity_identity === input.campaign_identity && input.items[0]!.field_path === "campaign.status" && input.items[0]!.proposed_value === "PAUSED";
  const baseline = scopedPause ? await pauseBaseline(input, env) : await retrieveOfficialM03Baseline(input.platform, {
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
      // Context links only; official account/campaign baseline remains authority.
      ...m18Context(input),
    },
  };
}

async function pauseBaseline(input: M03MockChangeRequestInput, env: Record<string, string | undefined>): Promise<M03ProviderBaseline> {
  if (input.platform === "tiktok") throw new Error("TikTok pause is outside this pilot.");
  const transport = await officialPauseTransport({ actor_id: "00000000-0000-4000-8000-000000000000", platform: input.platform, account_identity: input.account_identity, campaign_identity: input.campaign_identity }, env);
  const observed = await transport.read();
  if (observed.account_id !== input.account_identity || observed.campaign_id !== input.campaign_identity) throw new Error("Official pause adoption ownership mismatch.");
  const canonical_payload = { [m03BaselineKey(input.items[0]!)]: observed.status };
  return { platform: input.platform, account_identity: input.account_identity, campaign_identity: input.campaign_identity, source: "provider", captured_at: new Date().toISOString(), canonical_payload, payload_hash: canonicalM03Hash(canonical_payload) };
}

function m18Context(input: M03MockChangeRequestInput) {
  const evidence = input.items[0]?.evidence;
  if (!evidence || !["m18_workflow_id", "m18_revision_id", "m18_receipt_id"].some(k => k in evidence)) return {};
  const references = z.object({ m18_workflow_id: z.string().uuid(), m18_revision_id: z.string().uuid(), m18_receipt_id: z.string().uuid() }).safeParse(evidence);
  if (!references.success) throw new M03RepositoryError("Provide all three valid M18 workflow, revision and receipt references, or leave all three blank.", 400);
  return references.data;
}
