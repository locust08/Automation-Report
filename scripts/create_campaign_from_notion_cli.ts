import {
  createSearchCampaignFromMediaPlan,
  parseMediaPlanCliArgs,
} from "@/lib/google-ads/createSearchCampaignFromMediaPlan";

async function main() {
  const args = parseMediaPlanCliArgs(process.argv.slice(2));
  if (!args) {
    throw new Error("Expected --source=media-plan with --batchId and --googleCid.");
  }

  const result = await createSearchCampaignFromMediaPlan(args);
  if ("plannedPayload" in result) {
    console.log(JSON.stringify(result.plannedPayload, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        success: false,
        source: "media-plan",
        error: error instanceof Error ? error.message : String(error),
        failedStep: "validation",
      },
      null,
      2
    )
  );
  process.exit(1);
});
