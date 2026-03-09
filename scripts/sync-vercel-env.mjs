#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const REQUIRED_KEYS = [
  ["META_ACCESS_TOKEN"],
  ["GOOGLE_ADS_DEVELOPER_TOKEN"],
];

const OPTIONAL_KEYS = [
  ["GOOGLE_ADS_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_WORKSPACE_OAUTH_ACCESS_TOKEN"],
  ["GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN"],
  ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"],
  ["GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"],
  ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"],
  ["GOOGLE_ADS_API_VERSION"],
  ["REPORT_COMPANY_NAME"],
  ["REPORT_COMPANY_NAME_MAP"],
];

const VALID_TARGETS = new Set(["development", "preview", "production"]);

function normalizeTargets(rawTargets) {
  if (rawTargets.length === 0) {
    return ["production"];
  }

  const parsed = rawTargets.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
  if (parsed.length === 0) {
    return ["production"];
  }

  const invalid = parsed.filter((target) => !VALID_TARGETS.has(target));
  if (invalid.length > 0) {
    console.error(`Invalid target(s): ${invalid.join(", ")}. Use development, preview, production.`);
    process.exit(1);
  }

  return Array.from(new Set(parsed));
}

function readFirstNonEmpty(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return { key: names[0], value: value.trim() };
    }
  }
  return null;
}

function collectSecrets() {
  const secrets = new Map();

  for (const names of REQUIRED_KEYS) {
    const resolved = readFirstNonEmpty(names);
    if (!resolved) {
      console.error(`Missing required secret: ${names.join(" | ")}`);
      process.exit(1);
    }
    secrets.set(resolved.key, resolved.value);
  }

  for (const names of OPTIONAL_KEYS) {
    const resolved = readFirstNonEmpty(names);
    if (resolved) {
      secrets.set(resolved.key, resolved.value);
    }
  }

  return secrets;
}

function runVercel(args, input) {
  const result = spawnSync("vercel", args, {
    input,
    stdio: [input ? "pipe" : "inherit", "inherit", "inherit"],
    shell: process.platform === "win32",
    encoding: "utf8",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("Vercel CLI not found. Install it with `npm i -g vercel` or use `npx vercel`.");
      process.exit(1);
    }

    console.error(result.error.message);
    process.exit(1);
  }

  return result.status === 0;
}

function syncTarget(target, secrets) {
  console.log(`\nSyncing ${secrets.size} secret(s) to Vercel target: ${target}`);

  for (const [key, value] of secrets.entries()) {
    runVercel(["env", "rm", key, target, "--yes"], undefined);

    const added = runVercel(["env", "add", key, target], `${value}\n`);
    if (!added) {
      console.error(`Failed to set ${key} for ${target}.`);
      process.exit(1);
    }
  }
}

function main() {
  const targets = normalizeTargets(process.argv.slice(2));
  const secrets = collectSecrets();

  console.log("Using environment values from current process.");
  console.log("Run this script through Doppler, for example:");
  console.log("doppler run --config prd -- npm run vercel:env:sync -- production");

  for (const target of targets) {
    syncTarget(target, secrets);
  }

  console.log("\nVercel environment sync completed.");
}

main();
