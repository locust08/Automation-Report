import { budgetRows, budgetRpc } from "@/lib/budget/repository";

const EXPECTED = {
  notionAccountId: "3584fcc4-f701-8003-843e-d7e3316fc758",
  clientId: "3584fcc4-f701-808a-b7aa-eae25eacf3a2",
  cycleId: "35e4fcc4-f701-803c-92f6-f7cac2926a4f",
  providerAccountId: "1998676917",
  loginCustomerId: "3666137525",
  currency: "MYR",
  start: "2026-10-01",
  end: "2026-10-31",
  approvedAmount: 7500,
} as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const operatorId = required("M05_RELEASE_OPERATOR_ID");
  const sourceRevision = required("M05_DSCAFF_SOURCE_REVISION");
  const approvedAt = required("M05_DSCAFF_APPROVED_AT");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operatorId)
    || sourceRevision.length > 200 || !Number.isFinite(Date.parse(approvedAt))
    || Date.parse(approvedAt) > Date.now()) throw new Error("Pilot provenance is invalid.");

  const seeded = await budgetRpc("m05_ads_seed_dscaff_pilot", {
    p_operator_id: operatorId, p_source_revision: sourceRevision, p_approved_at: approvedAt,
  });
  const accounts = await budgetRows("m05_ads_accounts", {
    select: "id,notion_account_id,client_id,platform,provider_account_id,currency,timezone,google_access_mode,google_login_customer_id,mapping_verified_at",
    notion_account_id: `eq.${EXPECTED.notionAccountId}`, limit: "2",
  });
  const account = accounts[0];
  if (seeded.status !== "verified" || accounts.length !== 1 || !account
    || account.notion_account_id !== EXPECTED.notionAccountId || account.client_id !== EXPECTED.clientId
    || account.platform !== "google" || account.provider_account_id !== EXPECTED.providerAccountId
    || account.currency !== EXPECTED.currency || account.google_access_mode !== "manager"
    || account.google_login_customer_id !== EXPECTED.loginCustomerId || typeof account.timezone !== "string"
    || !account.timezone || !account.mapping_verified_at) throw new Error("Dscaff account readback failed.");

  const allocations = await budgetRows("m05_ads_allocations", {
    select: "id,account_id,notion_cycle_id,plan_reference,start_date,end_date,approved_amount,currency,approved_by,approved_at,source_revision",
    account_id: `eq.${account.id}`, notion_cycle_id: `eq.${EXPECTED.cycleId}`,
    source_revision: `eq.${sourceRevision}`, limit: "2",
  });
  const allocation = allocations[0];
  if (allocations.length !== 1 || !allocation || allocation.notion_cycle_id !== EXPECTED.cycleId
    || allocation.plan_reference !== "INV.GR-2605/004" || allocation.start_date !== EXPECTED.start
    || allocation.end_date !== EXPECTED.end || Number(allocation.approved_amount) !== EXPECTED.approvedAmount
    || allocation.currency !== EXPECTED.currency || allocation.approved_by !== operatorId
    || allocation.approved_at !== new Date(approvedAt).toISOString()
    || allocation.source_revision !== sourceRevision) throw new Error("Dscaff allocation readback failed.");

  process.stdout.write(`${JSON.stringify({ status: "verified", accountId: account.id,
    allocationId: allocation.id, timezone: account.timezone, sourceRevision })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Dscaff pilot seed failed."}\n`);
  process.exitCode = 1;
});
