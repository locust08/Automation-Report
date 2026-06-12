#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mediaPlanCli = path.join(repoRoot, "scripts", "create_campaign_from_notion_cli.ts");
const legacyScript = path.join(
  repoRoot,
  ".agents",
  "skills",
  "google-ads-notion-campaign-builder",
  "scripts",
  "create_campaign_from_notion.mjs"
);

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
Usage:
  node scripts/create_campaign_from_notion.mjs --batchId <MP-YYYYMMDD-HHMMSS> --googleCid <cid> --source=media-plan [--dryRun]

Media plan options:
  --batchId <id>          Approved media-plan batch ID.
  --googleCid <cid>       Google Ads customer ID.
  --source=media-plan     Required for the Phase 4 media-plan flow.
  --dryRun                Query Notion and print the planned payload without Google Ads or Notion updates.
`.trim());
  if (existsSync(legacyScript)) {
    console.log("\nLegacy Notion setup-row flow is still available through:");
    console.log(`  node ${path.relative(repoRoot, legacyScript)} --help`);
  }
  process.exit(0);
}

if (isMediaPlanInvocation(argv)) {
  const result = spawnSync("npx", ["tsx", mediaPlanCli, ...argv], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (!existsSync(legacyScript)) {
  console.error("Legacy create_campaign_from_notion.mjs script was not found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [legacyScript, ...argv], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);

function isMediaPlanInvocation(args) {
  return args.some(
    (arg) =>
      arg === "--source=media-plan" ||
      arg === "media-plan" ||
      arg === "--batchId" ||
      arg.startsWith("--batchId=") ||
      arg === "--googleCid" ||
      arg.startsWith("--googleCid=")
  );
}
