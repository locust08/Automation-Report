import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("local M04 model connects, fetches, and completes a simulated campaign lifecycle", async () => {
  const root = mkdtempSync(join(tmpdir(), "m04-local-model-"));
  process.env.M04_SQLITE_PATH = join(root, "campaigns.sqlite");
  process.env.NODE_ENV = "test";
  try {
    const repository = await import("../lib/campaign-planning/sqlite-repository.ts");
    const actor = { id: "test-admin", email: "test-admin@localhost" };
    const seeded = repository.listCampaignPlans();
    assert.equal(seeded.mode, "local-model");
    assert.equal(seeded.providerWrites, false);
    assert.ok(seeded.campaigns.length >= 4);

    let detail = repository.createCampaignPlan({
      clientName: "Northstar Retail", platform: "google", accountId: 1, packageId: 1,
      campaignName: "Local lifecycle test", objective: "Conversions", destination: "https://example.com/test",
      startDate: "2026-08-22", endDate: "2026-09-21", allocationMicros: 5_000_000_000,
    }, actor);
    for (const action of ["submit", "approve", "simulate_gate_1", "simulate_gate_2", "create_handoff"] as const) {
      detail = repository.applyCampaignPlanAction(detail.plan.id, { action, lockVersion: detail.plan.lockVersion }, actor);
    }
    const fetched = repository.getCampaignPlan(detail.plan.id);
    assert.equal(fetched.plan.status, "launched");
    assert.equal(fetched.build?.status, "handoff_complete");
    assert.ok(fetched.handoff?.providerCampaignId);
    assert.ok(fetched.auditEvents.length >= 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

