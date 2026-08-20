import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  fetchTikTokSecretsFromDoppler,
  mergeTikTokSecretsIntoEnv,
} from "../lib/tiktok/local-secret-sync";

function readServiceTokenSecurely(): string {
  const injected = process.env.TIKTOK_SOURCE_DOPPLER_TOKEN?.trim();
  if (injected) return injected;
  if (process.platform !== "win32") {
    throw new Error("This local sync currently requires Windows PowerShell.");
  }
  const script = [
    "$secure = Read-Host 'Paste the ai-backend/dev Doppler service token' -AsSecureString",
    "$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)",
    "try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) }",
    "finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }",
  ].join("; ");
  return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  }).trim();
}

async function main() {
  const destination = path.resolve(process.cwd(), ".env.local");
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const token = readServiceTokenSecurely();
  try {
    const secrets = await fetchTikTokSecretsFromDoppler({ token });
    const existing = await readFile(destination, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const merged = mergeTikTokSecretsIntoEnv(existing, secrets);
    await writeFile(temporary, merged, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
    process.stdout.write("TikTok secrets were synced to the git-ignored .env.local file. No values were printed.\n");
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "TikTok secret sync failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
