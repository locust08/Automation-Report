import assert from "node:assert/strict";
import test from "node:test";

import * as readinessModule from "./campaign-provider-readiness";
import { buildCampaignDraftRequest } from "./campaign-wizard-payload";
import { createCampaignWizardForm } from "./campaign-wizard";
import { prepareCampaignPlanDraft } from "./campaign-plan-preparation";

const account = { id: 10, clientId: "11111111-1111-4111-8111-111111111111", clientName: "Client", platform: "google" as const, providerAccountId: "mock-google", accountName: "Google", currency: "MYR", timezone: "Asia/Kuala_Lumpur" };

function unresolvedPlan() {
  return buildCampaignDraftRequest({
    ...createCampaignWizardForm("google"), accountId: "10", packageId: "20", campaignName: "Search",
    headline: "One, Two, Three", descriptions: "First, Second", euPoliticalAds: "does_not_contain",
  }, account);
}

test("unresolved references remain structurally valid but are not provider ready", () => {
  const evaluate = (readinessModule as unknown as { evaluateCampaignProviderReadiness: (value: unknown) => unknown }).evaluateCampaignProviderReadiness;
  assert.equal(typeof evaluate, "function");
  assert.deepEqual(evaluate(unresolvedPlan()), {
    schemaVersion: 2,
    structurallyValid: true,
    providerReady: false,
    unresolvedResources: [{ logicalKey: "conversion:primary", resourceType: "conversion_action", role: "conversion_action", referenceId: "mock-conversion-action" }],
  });
});

test("resolved references can be provider ready while execution remains locked", () => {
  const evaluate = (readinessModule as unknown as { evaluateCampaignProviderReadiness: (value: unknown) => unknown }).evaluateCampaignProviderReadiness;
  const plan = structuredClone(unresolvedPlan());
  const preparation = plan.provider_preparation!;
  for (const reference of preparation.resource_references!) {
    reference.source = "provider";
    reference.provider_resource_id = `providers/${reference.reference_id}`;
    reference.resolution_status = "resolved";
  }
  assert.deepEqual(evaluate(plan), {
    schemaVersion: 2,
    structurallyValid: true,
    providerReady: true,
    unresolvedResources: [],
  });
  assert.equal(readinessModule.evaluateCampaignProviderReadiness(prepareCampaignPlanDraft(plan).plan).providerReady, true);
});

test("a provider-dependent compliance result keeps an otherwise resolved plan pending", () => {
  const plan = structuredClone(unresolvedPlan());
  const preparation = plan.provider_preparation!;
  preparation.compliance = { ...preparation.compliance, existing_post_eligibility_confirmed: false };
  for (const reference of preparation.resource_references!) {
    reference.provider_resource_id = `providers/${reference.reference_id}`;
    reference.resolution_status = "resolved";
  }
  assert.equal(readinessModule.evaluateCampaignProviderReadiness(plan).providerReady, false);
});

test("an invalid payload is neither structurally valid nor provider ready", () => {
  assert.deepEqual(readinessModule.evaluateCampaignProviderReadiness({ schema_version: 2 }), {
    schemaVersion: 2,
    structurallyValid: false,
    providerReady: false,
    unresolvedResources: [],
  });
});

test("legacy V1 revisions remain readable but require V2 conversion before provider readiness", () => {
  const plan = structuredClone(unresolvedPlan());
  plan.schema_version = 1;
  delete plan.entities;
  plan.provider_preparation = { provider_execution_locked: true, compliance: {}, intended_statuses: {}, provider_fields: {}, resource_references: [] };
  const readiness = readinessModule.evaluateCampaignProviderReadiness(plan);
  assert.equal(readiness.structurallyValid, true);
  assert.equal(readiness.providerReady, false);
});
