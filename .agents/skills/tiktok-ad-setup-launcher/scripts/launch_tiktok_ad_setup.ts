#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createTikTokAdsClient } from "../../../../lib/tiktok/ads-client";
import {
  activateTikTokSetup,
  createTikTokDisabledSetup,
  previewTikTokDisabledSetup,
  previewTikTokSetupActivation,
  type TikTokSetupLaunchReceipt,
} from "../../../../lib/tiktok/setup-launcher";

type Flags = Record<string, string | boolean>;

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const name = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[name] = true;
    else {
      flags[name] = next;
      index += 1;
    }
  }
  return flags;
}

function stringFlag(flags: Flags, name: string) {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function requireConfirmation(flags: Flags) {
  const value = stringFlag(flags, "confirm-advertiser-name");
  if (!value) throw new Error("--confirm-advertiser-name is required for apply or activate");
  return value;
}

function requireExecutionMode(flags: Flags) {
  const value = stringFlag(flags, "execution-mode");
  if (value !== "single-persistent-host") {
    throw new Error(
      "--execution-mode single-persistent-host is required; multi-host, serverless, or ephemeral execution needs a shared transactional receipt backend",
    );
  }
  return "SINGLE_PERSISTENT_HOST" as const;
}

function summary(receipt: TikTokSetupLaunchReceipt, receiptPath: string) {
  return {
    receipt: path.relative(process.cwd(), receiptPath),
    revisionId: receipt.revisionId,
    advertiser: receipt.advertiser,
    status: receipt.status,
    resources: Object.values(receipt.steps).map((step) => ({
      operationKey: step.operationKey,
      status: step.status,
      resourceId: step.resourceId,
    })),
    activation: receipt.activation?.steps.map((step) => ({
      operationKey: step.operationKey,
      status: step.status,
      resourceId: step.resourceId,
    })),
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help === true) {
    process.stdout.write([
      "TikTok Ad Setup Launcher",
      "",
      "Preview new:--revision <file> --execution-mode single-persistent-host --initialize-new-receipt",
      "Preview existing: --revision <file> --execution-mode single-persistent-host",
      "Create:     --revision <file> --execution-mode single-persistent-host --apply --confirm-advertiser-name <exact>",
      "Act preview:--revision <file> --execution-mode single-persistent-host --activation-preview",
      "Activate:   --revision <file> --execution-mode single-persistent-host --activate --confirm-advertiser-name <exact>",
      "",
    ].join("\n"));
    return;
  }
  const revisionPath = stringFlag(flags, "revision");
  if (!revisionPath) throw new Error("--revision is required");
  const modes = [flags.apply === true, flags["activation-preview"] === true, flags.activate === true]
    .filter(Boolean).length;
  if (modes > 1) throw new Error("Choose only one of --apply, --activation-preview, or --activate");
  if (flags["initialize-new-receipt"] === true && modes > 0) {
    throw new Error("--initialize-new-receipt is accepted only for the initial disabled-setup preview");
  }

  const revision = JSON.parse(await readFile(path.resolve(revisionPath), "utf8")) as unknown;
  const executionMode = requireExecutionMode(flags);
  const client = await createTikTokAdsClient();
  const result = flags.apply === true
    ? await createTikTokDisabledSetup({
      client,
      revision,
      executionMode,
      confirmAdvertiserName: requireConfirmation(flags),
    })
    : flags["activation-preview"] === true
      ? await previewTikTokSetupActivation({ client, revision, executionMode })
      : flags.activate === true
        ? await activateTikTokSetup({
          client,
          revision,
          executionMode,
          confirmAdvertiserName: requireConfirmation(flags),
        })
        : await previewTikTokDisabledSetup({
          client,
          revision,
          executionMode,
          initializeNewReceipt: flags["initialize-new-receipt"] === true,
        });
  process.stdout.write(`${JSON.stringify(summary(result.receipt, result.receiptPath), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    name: "TikTokSetupLauncherError",
    message: error instanceof Error ? error.message : "TikTok setup launch failed",
  }, null, 2)}\n`);
  process.exitCode = 1;
});
