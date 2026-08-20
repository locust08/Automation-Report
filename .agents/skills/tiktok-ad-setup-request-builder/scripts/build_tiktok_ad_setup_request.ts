#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildTikTokSetupRevision } from "../../../../lib/tiktok/setup-plan";

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

async function writeOutput(value: unknown, flags: Flags) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const requested = stringFlag(flags, "output");
  if (!requested) {
    process.stdout.write(serialized);
    return;
  }
  const workspace = path.resolve(process.cwd());
  const destination = path.resolve(requested);
  if (destination !== workspace && !destination.startsWith(`${workspace}${path.sep}`)) {
    throw new Error("--output must stay inside the current workspace");
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, serialized, {
    mode: 0o600,
    flag: flags.overwrite === true ? "w" : "wx",
  });
  process.stdout.write(`${JSON.stringify({ output: path.relative(workspace, destination) }, null, 2)}\n`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help === true) {
    process.stdout.write([
      "TikTok Ad Setup Request Builder",
      "",
      "Usage:",
      "  node --import tsx .agents/skills/tiktok-ad-setup-request-builder/scripts/build_tiktok_ad_setup_request.ts --input <file> [--output <file>] [--overwrite]",
      "",
    ].join("\n"));
    return;
  }
  const inputPath = stringFlag(flags, "input");
  if (!inputPath) throw new Error("--input is required");
  const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as unknown;
  await writeOutput(buildTikTokSetupRevision(input), flags);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    name: "TikTokSetupBuilderError",
    message: error instanceof Error ? error.message : "TikTok setup build failed",
  }, null, 2)}\n`);
  process.exitCode = 1;
});
