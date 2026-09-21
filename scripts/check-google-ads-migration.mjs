import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function inspectGoogleAdsSource(path, source) {
  const problems = [];
  const legacy = ["GOOGLE_ADS_" + "DEVELOPER_TOKEN", "developer" + "_token", "developer" + "Token", "googleDeveloper" + "Token"];
  if (!path.endsWith(".md")) legacy.push("developer" + "-token");
  if (legacy.some(value => source.includes(value))) problems.push("legacy credential/header");
  const isTest = /(?:\.test\.|\/tests\/)/.test(path);
  if (!isTest && /google/i.test(source) && /(?:googleads\.googleapis\.com\/v(?:22|23|24)\b|(?:GOOGLE_ADS_(?:API_)?(?:DEFAULT_)?VERSION|googleAdsApiVersion|apiVersion)\s*[:=]\s*["']?v?(?:22|23|24)\b)/.test(source)) problems.push("unsupported Google Ads API version");
  if (/NEXT_PUBLIC_(?:GOOGLE|GOOGLE_ADS|GOOGLE_OAUTH)_(?:ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|CLIENT_ID)/.test(source)) problems.push("browser-exposed OAuth configuration");
  if (/^["']use client["'];?/m.test(source) && /(?:google-ads\/(?:client|rest-client)|GOOGLE_(?:ADS|OAUTH)_(?:ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET))/.test(source)) problems.push("browser credential/transport import");
  return problems.map(problem => `${path}: ${problem}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean))];
  const errors = files.filter(file => /\.(?:[cm]?[jt]sx?|py|toml|ya?ml|jsonc?|md)$/.test(file) || file === ".env.example").flatMap(file => inspectGoogleAdsSource(file, readFileSync(file, "utf8")));
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Google Ads migration scan passed (${files.length} maintained files).`);
}
