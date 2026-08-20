#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import {
  isTikTokAdsActionName,
  TIKTOK_ADS_ACTIONS,
  type TikTokAdsActionName,
} from "../../../../lib/tiktok/ads-actions";
import {
  buildTikTokAnalysisRequest,
  summarizeTikTokReport,
  TIKTOK_ANALYSIS_PROFILES,
  type TikTokAnalysisProfile,
} from "../../../../lib/tiktok/ads-analysis";
import {
  createTikTokAdsClient,
  TikTokAdsApiError,
  type TikTokAdsClient,
} from "../../../../lib/tiktok/ads-client";
import {
  checkTikTokAdvertiserCapabilities,
  preflightTikTokMutation,
  prepareTikTokMutationPayload,
  verifyTikTokMutation,
} from "../../../../lib/tiktok/ads-operations";
import {
  collectTikTokResultIds,
  createTikTokMutationPreview,
  finalizeTikTokMutationReceipt,
  requireTikTokMutationPreview,
} from "../../../../lib/tiktok/ads-receipts";
import { redactTikTokSecrets } from "../../../../lib/tiktok/ads-schemas";
import { getTikTokBusinessAuthorizationContext } from "../../../../lib/tiktok/token-manager";
import { getAuthorizedTikTokAdvertisers } from "../../../../lib/tiktok/oauth";

type Flags = Record<string, string | boolean>;

const HELP = `TikTok Ads via Doppler

Run through Doppler:
  doppler run -- npm run tiktok:ads -- <resource> <action> [options]

Commands:
  capability check
  account list|get
  campaign list|get|create|update|status
  adgroup list|get|create|update|budget|status
  ad list|get|create|update|status
  report sync|async-create|async-status|async-download
  asset image search|upload
  asset video search|upload
  spark authorize|list|get|create
  analysis advertiser|campaign|adgroup|ad|creative|audience|daily

Options:
  --advertiser-id <id>             Required except for account list
  --input <json-file>              Request parameters or mutation payload
  --output <json-file>             Write sanitized output inside the workspace
  --apply                          Apply a previously previewed mutation
  --confirm-advertiser-name <name> Required with --apply
  --auth-code-stdin                Read a Spark post authorization code without echo
  --start-date <YYYY-MM-DD>        Reporting/capability window
  --end-date <YYYY-MM-DD>          Reporting/capability window
  --metrics <comma-separated>
  --dimensions <comma-separated>
  --overwrite                      Allow replacing --output

Mutations preview by default. Run the identical command with --apply and the exact
advertiser name only after the user confirms the preview. New create payloads default
to DISABLE. Tokens and authorization codes are never accepted in JSON files or output.
`;

function parseArguments(argv: string[]) {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const equalsIndex = value.indexOf("=");
    if (equalsIndex > 2) {
      flags[value.slice(2, equalsIndex)] = value.slice(equalsIndex + 1);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }
  return { positionals, flags };
}

function stringFlag(flags: Flags, name: string) {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function csvFlag(flags: Flags, name: string) {
  return stringFlag(flags, name)?.split(",").map((item) => item.trim()).filter(Boolean);
}

async function readJsonInput(filePath: string | undefined) {
  if (!filePath) return {};
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TikTok --input must contain a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function readHiddenStdin() {
  if (!process.stdin.isTTY) return (await readFile(0, "utf8")).trim();
  process.stderr.write("Spark Post Authorization Code: ");
  let echoDisabled = false;
  const interface_ = createInterface({ input: process.stdin, output: process.stderr });
  try {
    execFileSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
    echoDisabled = true;
    const value = (await interface_.question("")).trim();
    return value;
  } finally {
    interface_.close();
    if (echoDisabled) {
      execFileSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
      process.stderr.write("\n");
    }
  }
}

function requiredAdvertiserId(flags: Flags) {
  const advertiserId = stringFlag(flags, "advertiser-id");
  if (!advertiserId) throw new Error("--advertiser-id is required");
  return advertiserId;
}

function mapAction(resource: string, action: string, subaction?: string): TikTokAdsActionName {
  const aliases: Record<string, string> = {
    "asset.image.search": "asset.image-search",
    "asset.image.upload": "asset.image-upload",
    "asset.video.search": "asset.video-search",
    "asset.video.upload": "asset.video-upload",
    "asset.image-search": "asset.image-search",
    "asset.image-upload": "asset.image-upload",
    "asset.video-search": "asset.video-search",
    "asset.video-upload": "asset.video-upload",
  };
  const key = [resource, action, subaction].filter(Boolean).join(".");
  const candidate = aliases[key] ?? `${resource}.${action}`;
  if (!isTikTokAdsActionName(candidate)) throw new Error(`Unsupported TikTok action: ${candidate}`);
  return candidate;
}

function providerInput(flags: Flags, input: Record<string, unknown>, advertiserId: string) {
  return {
    ...input,
    advertiser_id: advertiserId,
    start_date: stringFlag(flags, "start-date") ?? input.start_date,
    end_date: stringFlag(flags, "end-date") ?? input.end_date,
    metrics: csvFlag(flags, "metrics") ?? input.metrics,
    dimensions: csvFlag(flags, "dimensions") ?? input.dimensions,
  };
}

async function writeOutput(value: unknown, flags: Flags) {
  const sanitized = redactTikTokSecrets(value);
  const outputPath = stringFlag(flags, "output");
  if (!outputPath) {
    process.stdout.write(`${JSON.stringify(sanitized, null, 2)}\n`);
    return;
  }
  const workspace = path.resolve(process.cwd());
  const destination = path.resolve(outputPath);
  if (destination !== workspace && !destination.startsWith(`${workspace}${path.sep}`)) {
    throw new Error("--output must stay inside the current workspace");
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(sanitized, null, 2)}\n`, {
    mode: 0o600,
    flag: flags.overwrite === true ? "w" : "wx",
  });
  process.stdout.write(`${JSON.stringify({ output: path.relative(workspace, destination) }, null, 2)}\n`);
}

async function materializeUpload(
  action: TikTokAdsActionName,
  payload: Record<string, unknown>,
) {
  if (action !== "asset.image-upload" && action !== "asset.video-upload") {
    return { requestPayload: payload, fileSha256: undefined };
  }
  const filePath = payload.file_path;
  if (typeof filePath !== "string" || !filePath) {
    if (payload.upload_type === "UPLOAD_BY_URL" || payload.upload_type === "UPLOAD_BY_FILE_ID") {
      return { requestPayload: payload, fileSha256: undefined };
    }
    throw new Error("Asset file upload requires file_path in the JSON input");
  }
  const resolved = path.resolve(filePath);
  const metadata = await lstat(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Asset file_path must be a regular non-symlink file");
  }
  const bytes = await readFile(resolved);
  const result = { ...payload };
  delete result.file_path;
  result.file_name ??= path.basename(resolved);
  result.upload_type ??= "UPLOAD_BY_FILE";
  result[action === "asset.image-upload" ? "image_file" : "video_file"] = new Blob([bytes]);
  return {
    requestPayload: result,
    fileSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function currentMutationState(
  client: TikTokAdsClient,
  action: TikTokAdsActionName,
  advertiserId: string,
  input: Record<string, unknown>,
) {
  const candidates: Array<[string, TikTokAdsActionName, string]> = [
    ["ad_id", "ad.get", "ad_ids"],
    ["adgroup_id", "adgroup.get", "adgroup_ids"],
    ["campaign_id", "campaign.get", "campaign_ids"],
  ];
  for (const [idKey, getAction, filterKey] of candidates) {
    const id = input[idKey];
    if (typeof id !== "string") continue;
    try {
      return (await client.request(getAction, {
        advertiser_id: advertiserId,
        filtering: { [filterKey]: [id] },
        page: 1,
        page_size: 1,
      })).data;
    } catch (error) {
      if (TIKTOK_ADS_ACTIONS[action].mutation) {
        return { status: "unavailable", provider_code: error instanceof TikTokAdsApiError ? error.details.providerCode : undefined };
      }
    }
  }
  return null;
}

async function runMutation(params: {
  client: TikTokAdsClient;
  action: TikTokAdsActionName;
  advertiserId: string;
  advertiserName: string;
  input: Record<string, unknown>;
  flags: Flags;
}) {
  const prepared = prepareTikTokMutationPayload(params.action, params.advertiserId, params.input);
  if (params.action === "spark.authorize" && params.flags["auth-code-stdin"] !== true) {
    throw new Error("spark authorize requires --auth-code-stdin");
  }
  const authCode = params.action === "spark.authorize"
    ? await readHiddenStdin()
    : undefined;
  if (params.action === "spark.authorize" && !authCode) {
    throw new Error("Spark Post Authorization Code is empty");
  }
  const upload = await materializeUpload(params.action, prepared.payload);
  const receiptPayload = upload.fileSha256
    ? { ...prepared.payload, upload_file_sha256: upload.fileSha256 }
    : prepared.payload;
  const receiptInput = authCode
    ? {
      ...receiptPayload,
      authorization_code_fingerprint: crypto.createHash("sha256").update(authCode).digest("hex"),
    }
    : receiptPayload;
  const advertiser = params.client.assertAdvertiser(params.advertiserId);
  const apply = params.flags.apply === true;
  if (!apply) {
    const preflight = await preflightTikTokMutation({
      client: params.client,
      advertiserId: params.advertiserId,
      action: params.action,
      payload: prepared.payload,
      helperObjective: prepared.helperObjective,
    });
    const current = await currentMutationState(
      params.client, params.action, params.advertiserId, prepared.payload,
    );
    const preview = await createTikTokMutationPreview({
      action: params.action,
      advertiser,
      input: receiptInput,
    });
    return {
      mode: "preview",
      run_id: preview.receipt.runId,
      receipt: path.relative(process.cwd(), preview.receiptPath),
      advertiser,
      action: params.action,
      current,
      proposed: redactTikTokSecrets(prepared.payload),
      preflight,
      apply_command_requirements: {
        repeat_same_command: true,
        add_flags: ["--apply", `--confirm-advertiser-name=${advertiser.advertiser_name}`],
      },
    };
  }

  const confirmedName = stringFlag(params.flags, "confirm-advertiser-name");
  if (!confirmedName || confirmedName !== params.advertiserName) {
    throw new Error("--confirm-advertiser-name must exactly match the Doppler-authorized advertiser name");
  }
  const preview = await requireTikTokMutationPreview({
    action: params.action,
    advertiser,
    input: receiptInput,
  });
  await preflightTikTokMutation({
    client: params.client,
    advertiserId: params.advertiserId,
    action: params.action,
    payload: prepared.payload,
    helperObjective: prepared.helperObjective,
  });
  const requestPayload = authCode
    ? { ...prepared.payload, auth_code: authCode }
    : upload.requestPayload;
  try {
    const response = await params.client.request(params.action, requestPayload);
    const resultIds = collectTikTokResultIds(response.data);
    const verification = await verifyTikTokMutation({
      client: params.client,
      advertiserId: params.advertiserId,
      action: params.action,
      input: prepared.payload,
      resultIds,
    });
    const finalized = await finalizeTikTokMutationReceipt({
      receipt: preview.receipt,
      mode: "applied",
      providerRequestId: response.requestId,
      resultIds,
      verification,
    });
    return {
      mode: "applied",
      run_id: finalized.receipt.runId,
      receipt: path.relative(process.cwd(), finalized.receiptPath),
      advertiser,
      action: params.action,
      result_ids: resultIds,
      provider_request_id: response.requestId,
      verification,
    };
  } catch (error) {
    const serialized = error instanceof TikTokAdsApiError ? error.toJSON() : { message: "TikTok mutation failed" };
    await finalizeTikTokMutationReceipt({
      receipt: preview.receipt,
      mode: "failed",
      error: serialized,
    });
    throw error;
  }
}

async function main() {
  const { positionals, flags } = parseArguments(process.argv.slice(2));
  if (flags.help === true || positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const [resource, action, subaction] = positionals;
  const authorization = await getTikTokBusinessAuthorizationContext();
  const client = await createTikTokAdsClient({ authorization });

  if (resource === "account" && action === "list") {
    const storedOnly = flags.stored === true;
    const appId = process.env.TIKTOK_BUSINESS_APP_ID?.trim();
    const appSecret = process.env.TIKTOK_BUSINESS_APP_SECRET?.trim();
    const live = !storedOnly && appId && appSecret
      ? await getAuthorizedTikTokAdvertisers({ accessToken: authorization.accessToken, appId, appSecret })
      : authorization.advertisers;
    await writeOutput({
      source: storedOnly || !appId || !appSecret ? "stored" : "tiktok_live",
      advertisers: live.map((advertiser) => ({
        ...advertiser,
        readable: true,
        mutationAllowed: client.isMutationAllowed(advertiser.advertiser_id),
      })),
      granted_scopes: client.getGrantedScopes(),
    }, flags);
    return;
  }

  const advertiserId = requiredAdvertiserId(flags);
  const input = await readJsonInput(stringFlag(flags, "input"));
  const mappedAction = resource === "capability" || resource === "analysis"
    ? null
    : mapAction(resource, action, subaction);
  const advertiser = mappedAction && TIKTOK_ADS_ACTIONS[mappedAction].mutation
    ? client.assertAdvertiser(advertiserId)
    : await client.validateReadableAdvertiser(advertiserId);

  if (resource === "capability" && action === "check") {
    const capabilities = await checkTikTokAdvertiserCapabilities({
      client,
      advertiserId,
      startDate: stringFlag(flags, "start-date"),
      endDate: stringFlag(flags, "end-date"),
    });
    await writeOutput({ advertiser, capabilities }, flags);
    return;
  }

  if (resource === "analysis") {
    if (!Object.hasOwn(TIKTOK_ANALYSIS_PROFILES, action)) {
      throw new Error(`Unsupported TikTok analysis profile: ${action}`);
    }
    const startDate = stringFlag(flags, "start-date") ?? String(input.start_date ?? "");
    const endDate = stringFlag(flags, "end-date") ?? String(input.end_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("analysis requires --start-date and --end-date in YYYY-MM-DD format");
    }
    const reportInput = buildTikTokAnalysisRequest({
      advertiserId,
      profile: action as TikTokAnalysisProfile,
      startDate,
      endDate,
      metrics: csvFlag(flags, "metrics") ?? (Array.isArray(input.metrics) ? input.metrics.map(String) : undefined),
      dimensions: csvFlag(flags, "dimensions") ?? (Array.isArray(input.dimensions) ? input.dimensions.map(String) : undefined),
      filters: input.filtering,
    });
    const [account, report] = await Promise.all([
      client.request("account.get", { advertiser_id: advertiserId, advertiser_ids: [advertiserId] }),
      client.request("report.sync", reportInput),
    ]);
    await writeOutput({
      advertiser,
      profile: action,
      date_range: { start_date: startDate, end_date: endDate },
      account: account.data,
      report: report.data,
      summary: summarizeTikTokReport(report.data),
      provider_request_ids: [account.requestId, report.requestId].filter(Boolean),
    }, flags);
    return;
  }

  const actionName = mappedAction ?? mapAction(resource, action, subaction);
  if (TIKTOK_ADS_ACTIONS[actionName].mutation) {
    const result = await runMutation({
      client,
      action: actionName,
      advertiserId,
      advertiserName: advertiser.advertiser_name,
      input,
      flags,
    });
    await writeOutput(result, flags);
    return;
  }
  const requestInput = providerInput(flags, input, advertiserId);
  if (actionName === "account.get") requestInput.advertiser_ids = [advertiserId];
  const response = await client.request(actionName, requestInput);
  await writeOutput({
    advertiser,
    action: actionName,
    request_id: response.requestId,
    data: response.data,
  }, flags);
}

main().catch((error) => {
  const serialized = error instanceof TikTokAdsApiError
    ? error.toJSON()
    : { name: "TikTokAdsCommandError", message: error instanceof Error ? error.message : "TikTok command failed" };
  process.stderr.write(`${JSON.stringify(redactTikTokSecrets(serialized), null, 2)}\n`);
  process.exitCode = 1;
});
