import { getDemandGenReport } from "../lib/reporting/service";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

async function main() {
  const input = { accountId: null, metaAccountId: null, googleAccountId: "5849785984", platform: "google" as const, startDate: "2026-09-01", endDate: "2026-09-30", cacheRefreshKey: String(Date.now()) };
  const originalLog = console.log;
  const originalInfo = console.info;
  console.log = () => undefined; // Shared routing logs are not part of this safe receipt.
  console.info = () => undefined;
  let report: Awaited<ReturnType<typeof getDemandGenReport>>;
  try {
    const discovery = await getDemandGenReport(input, null);
    report = await getDemandGenReport(input, discovery.campaigns.map(campaign => campaign.id));
  } finally { console.log = originalLog; console.info = originalInfo; }
  for (const ad of report.ads ?? []) {
    assert.ok(ad.adResource?.startsWith(`customers/${input.googleAccountId}/adGroupAds/`));
    if (ad.selectedCreative?.selection === "top_performing") {
      const ordered = [...(ad.creatives ?? [])].filter(creative => (creative.metrics.impressions ?? 0) > 0).sort((a,b) => b.metrics.conversions! - a.metrics.conversions! || b.metrics.clicks! - a.metrics.clicks! || b.metrics.impressions! - a.metrics.impressions! || a.assetResource.localeCompare(b.assetResource));
      assert.equal(ad.selectedCreative.assetId, ordered[0].assetId);
    }
  }
  const receipt = { account: report.account, startDate: report.startDate, endDate: report.endDate, complete: report.complete, creativeCoverageComplete: report.creativeCoverageComplete, warningCount: report.warnings.length,
    ads: report.ads?.map(ad => ({ id: ad.id, resource: ad.adResource, name: ad.name, campaign: ad.campaignName, metrics: ad.metrics, selected: ad.selectedCreative && { assetId: ad.selectedCreative.assetId, kind: ad.selectedCreative.kind, selection: ad.selectedCreative.selection, metrics: ad.selectedCreative.metrics },
      candidates: ad.creatives?.map(creative => ({ assetId: creative.assetId, kind: creative.kind, previewAvailable: Boolean(creative.previewUrl), metrics: creative.metrics, performanceComplete: creative.performanceComplete })) })) };
  await mkdir("artifacts/demand-creative-verification", { recursive: true });
  await writeFile("artifacts/demand-creative-verification/magnet-september.json", JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({ account: report.account, complete: report.complete, creativeCoverageComplete: report.creativeCoverageComplete, ads: report.ads?.length, rankedAds: report.ads?.filter(ad => ad.selectedCreative?.selection === "top_performing").length, example: receipt.ads?.find(ad => ad.selected?.kind === "video" && ad.selected.selection === "top_performing"), receipt: "artifacts/demand-creative-verification/magnet-september.json" }));
}
main().catch(() => { console.error("Demand Gen read-only reconciliation failed; no credentials or raw provider errors logged."); process.exitCode = 1; });
