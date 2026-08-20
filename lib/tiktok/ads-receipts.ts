import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TikTokAdvertiser } from "@/lib/tiktok/oauth";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import { TIKTOK_ADS_API_VERSION } from "@/lib/tiktok/ads-actions";
import { redactTikTokSecrets } from "@/lib/tiktok/ads-schemas";

export type TikTokMutationReceipt = {
  schemaVersion: 1;
  runId: string;
  inputHash: string;
  mode: "preview" | "applied" | "failed";
  action: TikTokAdsActionName;
  apiVersion: typeof TIKTOK_ADS_API_VERSION;
  advertiser: TikTokAdvertiser;
  createdAt: string;
  updatedAt: string;
  sanitizedInput: unknown;
  providerRequestId?: string;
  resultIds?: Record<string, string>;
  verification?: unknown;
  error?: unknown;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Blob) return { blob_size: value.size, blob_type: value.type };
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

export function hashTikTokActionInput(params: {
  action: TikTokAdsActionName;
  advertiserId: string;
  input: unknown;
}) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(params))).digest("hex");
}

export function getTikTokReceiptPath(runId: string, root = process.cwd()) {
  if (!/^[a-f0-9]{16}$/.test(runId)) throw new Error("Invalid TikTok receipt run ID");
  return path.join(root, "tmp", "tiktok_ads", `receipt_${runId}.json`);
}

async function writeReceipt(receipt: TikTokMutationReceipt, root?: string) {
  const destination = getTikTokReceiptPath(receipt.runId, root);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

export async function createTikTokMutationPreview(params: {
  action: TikTokAdsActionName;
  advertiser: TikTokAdvertiser;
  input: unknown;
  now?: Date;
  root?: string;
}) {
  const inputHash = hashTikTokActionInput({
    action: params.action,
    advertiserId: params.advertiser.advertiser_id,
    input: params.input,
  });
  const runId = inputHash.slice(0, 16);
  const now = (params.now ?? new Date()).toISOString();
  const receipt: TikTokMutationReceipt = {
    schemaVersion: 1,
    runId,
    inputHash,
    mode: "preview",
    action: params.action,
    apiVersion: TIKTOK_ADS_API_VERSION,
    advertiser: { ...params.advertiser },
    createdAt: now,
    updatedAt: now,
    sanitizedInput: redactTikTokSecrets(params.input),
  };
  const receiptPath = await writeReceipt(receipt, params.root);
  return { receipt, receiptPath };
}

export async function requireTikTokMutationPreview(params: {
  action: TikTokAdsActionName;
  advertiser: TikTokAdvertiser;
  input: unknown;
  root?: string;
}) {
  const inputHash = hashTikTokActionInput({
    action: params.action,
    advertiserId: params.advertiser.advertiser_id,
    input: params.input,
  });
  const runId = inputHash.slice(0, 16);
  const receiptPath = getTikTokReceiptPath(runId, params.root);
  let receipt: TikTokMutationReceipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8")) as TikTokMutationReceipt;
  } catch {
    throw new Error(`Run the mutation without --apply first to create preview ${runId}`);
  }
  if (
    receipt.schemaVersion !== 1 ||
    receipt.mode !== "preview" ||
    receipt.action !== params.action ||
    receipt.inputHash !== inputHash ||
    receipt.advertiser.advertiser_id !== params.advertiser.advertiser_id
  ) {
    throw new Error("TikTok mutation preview does not match the requested action");
  }
  return { receipt, receiptPath };
}

export async function finalizeTikTokMutationReceipt(params: {
  receipt: TikTokMutationReceipt;
  mode: "applied" | "failed";
  providerRequestId?: string;
  resultIds?: Record<string, string>;
  verification?: unknown;
  error?: unknown;
  now?: Date;
  root?: string;
}) {
  const finalized: TikTokMutationReceipt = {
    ...params.receipt,
    mode: params.mode,
    updatedAt: (params.now ?? new Date()).toISOString(),
    providerRequestId: params.providerRequestId,
    resultIds: params.resultIds,
    verification: redactTikTokSecrets(params.verification),
    error: redactTikTokSecrets(params.error),
  };
  const receiptPath = await writeReceipt(finalized, params.root);
  return { receipt: finalized, receiptPath };
}

export function collectTikTokResultIds(value: unknown) {
  const ids: Record<string, string> = {};
  const allowedKeys = new Set([
    "campaign_id", "adgroup_id", "ad_id", "identity_id", "item_id", "task_id",
    "image_id", "video_id", "page_id", "catalog_id", "store_id", "app_id", "pixel_id",
  ]);
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (allowedKeys.has(key) && (typeof child === "string" || typeof child === "number")) {
        ids[key] = String(child);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return ids;
}

