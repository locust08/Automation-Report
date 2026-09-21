import { googleAdsClient } from "../lib/google-ads/client";
import { GoogleAdsApiError } from "../lib/google-ads/rest-client";

async function main() {
  const customerId = process.argv[2]?.replace(/-/g, "");
  const loginCustomerId = process.argv[3]?.replace(/-/g, "") || null;
  if (!customerId || !/^\d{10}$/.test(customerId)) throw new Error("Supply a customer ID and optional MCC ID.");
  const client = googleAdsClient();
  const options = { loginCustomerId, validateOnly: true } as const;
  const rows = await client.searchAll<{ campaign?: { id?: string; status?: string }; adGroup?: { id?: string } }>(customerId,
    "SELECT campaign.id, campaign.status, ad_group.id FROM ad_group WHERE campaign.advertising_channel_type = 'SEARCH' AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' LIMIT 1", options);
  const sample = rows[0];
  if (!sample?.campaign?.id || !sample.adGroup?.id) throw new Error("No Search campaign/ad group is available for validation.");
  const campaign = `customers/${customerId}/campaigns/${sample.campaign.id}`;
  const group = `customers/${customerId}/adGroups/${sample.adGroup.id}`;
  const families: Array<{ name: string; service: string; operations: unknown[] }> = [
    { name: "management campaign edit", service: "campaigns", operations: [{ update: { resourceName: campaign, status: sample.campaign.status }, updateMask: "status" }] },
    { name: "negative exact and phrase publishing", service: "adGroupCriteria", operations: ["EXACT", "PHRASE"].map(matchType => ({ create: { adGroup: group, negative: true, status: "ENABLED", keyword: { text: "m07 validation only", matchType } } })) },
    { name: "positive exact publishing", service: "adGroupCriteria", operations: [{ create: { adGroup: group, negative: false, status: "ENABLED", keyword: { text: "m07 validation only", matchType: "EXACT" } } }] },
    { name: "placement exclusion publishing", service: "campaignCriteria", operations: [{ create: { campaign, negative: true, placement: { url: "example.com" } } }] },
    { name: "paused Search campaign creation", service: "googleAds", operations: [
      { campaignBudgetOperation: { create: { resourceName: `customers/${customerId}/campaignBudgets/-1`, name: "M07 validation budget", amountMicros: "10000000", deliveryMethod: "STANDARD", explicitlyShared: false } } },
      { campaignOperation: { create: { resourceName: `customers/${customerId}/campaigns/-2`, name: `M07 validation ${Date.now()}`, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: `customers/${customerId}/campaignBudgets/-1`, targetSpend: {}, containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING", networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false } } } },
    ] },
  ];
  const results: unknown[] = [];
  for (const family of families) {
    try { await client.mutate(customerId, family.service, family.operations, options); results.push({ family: family.name, validateOnly: true, ok: true }); }
    catch (error) { results.push({ family: family.name, validateOnly: true, ok: false, error: error instanceof GoogleAdsApiError ? { category: error.category, code: error.errorCode, requestId: error.requestId } : "Validation failed" }); process.exitCode = 1; }
  }
  console.log(JSON.stringify({ customerId, loginCustomerId, results, note: "No live mutations submitted. Additional approved fixtures are required for PMax assets and other managed ad families." }, null, 2));
}
main().catch(() => { console.error("Validation smoke failed; check credentials and customer/MCC inputs."); process.exitCode = 1; });
