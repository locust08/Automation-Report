import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import * as mediaPlanCampaignModule from "../lib/google-ads/createSearchCampaignFromMediaPlan";

const moduleExports = mediaPlanCampaignModule as unknown as {
  __mediaPlanAssetSyncTestUtils?: unknown;
  default?: { __mediaPlanAssetSyncTestUtils?: unknown };
};
const __mediaPlanAssetSyncTestUtils =
  moduleExports.__mediaPlanAssetSyncTestUtils ?? moduleExports.default?.__mediaPlanAssetSyncTestUtils;

const utils = __mediaPlanAssetSyncTestUtils as {
  pageToMediaPlanRow: (page: Record<string, unknown>) => Record<string, unknown>;
  validateAndGroupRows: (rows: Array<Record<string, unknown>>, input: Record<string, unknown>) => Record<string, unknown>;
  buildPlannedPayload: (group: Record<string, unknown>) => Record<string, unknown>;
  buildGoogleAdsMutateOperations: (
    customerId: string,
    group: Record<string, unknown>,
    targeting: Record<string, unknown>,
    assets?: Record<string, unknown>
  ) => Array<Record<string, unknown>>;
  downloadMediaPlanAssetFiles: (group: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const batchId = "MP-20260619-120000";

test("media plan Notion rows parse business name, files, and sitelinks", () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());

  assert.equal(row.businessName, "Acme Shoes");
  assert.deepEqual(row.logoFiles, [
    { name: "acme-logo.png", url: "https://notion.local/logo.png", type: "file" },
  ]);
  assert.deepEqual(row.productServiceImageFiles, [
    { name: "shoe.jpg", url: "https://notion.local/shoe.jpg", type: "file" },
    { name: "shoe-2.jpg", url: "https://notion.local/shoe-2.jpg", type: "file" },
  ]);
  assert.deepEqual(row.sitelinks, [{ title: "Shop Shoes", url: "https://example.com/shop" }]);
});

test("planned media plan payload includes optional Google Ads assets", () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());
  const group = utils.validateAndGroupRows([row], normalizedInput());
  const planned = utils.buildPlannedPayload(group);

  assert.deepEqual(planned.assets, {
    businessName: "Acme Shoes",
    logo: [{ name: "acme-logo.png" }],
    productServiceImages: [{ name: "shoe.jpg" }, { name: "shoe-2.jpg" }],
  });
  assert.deepEqual((planned.adGroups as Array<Record<string, unknown>>)[0]?.sitelinks, [
    { title: "Shop Shoes", url: "https://example.com/shop" },
  ]);
});

test("Google Ads operations link business name, images, and ad-group sitelinks", () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());
  const group = utils.validateAndGroupRows([row], normalizedInput());
  const operations = utils.buildGoogleAdsMutateOperations(
    "1234567890",
    group,
    {
      geoTargets: [{ resourceName: "geoTargetConstants/2458" }],
      languages: [{ resourceName: "languageConstants/1000" }],
    },
    {
      logo: [
        {
          name: "acme-logo.png",
          url: "https://notion.local/logo.png",
          type: "file",
          base64: "bG9nbw==",
          dimensions: { width: 1200, height: 1200, format: "png" },
        },
      ],
      productServiceImages: [
        {
          name: "shoe-1.jpg",
          url: "https://notion.local/shoe.jpg",
          type: "file",
          base64: "c2hvZQ==",
          dimensions: { width: 1200, height: 628, format: "jpeg" },
        },
        {
          name: "shoe-2.jpg",
          url: "https://notion.local/shoe-2.jpg",
          type: "file",
          base64: "c2hvZTI=",
          dimensions: { width: 1200, height: 1200, format: "jpeg" },
        },
      ],
    }
  );

  assert.ok(findCampaignAsset(operations, "BUSINESS_NAME"));
  assert.ok(findCampaignAsset(operations, "BUSINESS_LOGO"));
  assert.ok(findCampaignAsset(operations, "AD_IMAGE"));
  assert.ok(findCampaignAsset(operations, "SITELINK"));
  assert.equal(countCampaignAssets(operations, "AD_IMAGE"), 2);

  const sitelinkAsset = operations.find((operation) => {
    const create = (operation.assetOperation as { create?: Record<string, unknown> } | undefined)?.create;
    return Boolean(create?.sitelinkAsset);
  })?.assetOperation as { create?: { finalUrls?: string[]; sitelinkAsset?: { linkText?: string } } };
  assert.equal(sitelinkAsset.create?.sitelinkAsset?.linkText, "Shop Shoes");
  assert.deepEqual(sitelinkAsset.create?.finalUrls, ["https://example.com/shop"]);

  const adGroupSitelink = operations.find(
    (operation) =>
      (operation.adGroupAssetOperation as { create?: { fieldType?: string } } | undefined)?.create?.fieldType ===
      "SITELINK"
  )?.adGroupAssetOperation as { create?: { adGroup?: string } };
  assert.equal(adGroupSitelink.create?.adGroup, "customers/1234567890/adGroups/-10");
});

test("downloaded product images are normalized without cropping and all Notion images are kept", async () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());
  const group = utils.validateAndGroupRows([row], normalizedInput());
  const originalFetch = globalThis.fetch;
  const logo = await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 3,
      background: "#ffffff",
    },
  }).png().toBuffer();
  const portrait = await sharp({
    create: {
      width: 500,
      height: 900,
      channels: 3,
      background: "#d9e8ff",
    },
  }).jpeg().toBuffer();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    return new Response(new Uint8Array(url.includes("logo") ? logo : portrait), { status: 200 });
  }) as typeof fetch;

  try {
    const assets = await utils.downloadMediaPlanAssetFiles(group) as {
      productServiceImages: Array<{ name: string; dimensions: { width: number; height: number }; normalizedFrom?: unknown }>;
    };
    assert.equal(assets.productServiceImages.length, 2);
    assert.equal(assets.productServiceImages[0]?.dimensions.width, 1200);
    assert.equal(assets.productServiceImages[0]?.dimensions.height, 1200);
    assert.ok(assets.productServiceImages[0]?.normalizedFrom);
    assert.equal(assets.productServiceImages[1]?.dimensions.width, 1200);
    assert.equal(assets.productServiceImages[1]?.dimensions.height, 1200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Ads operations skip product images with invalid Search image dimensions", () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());
  const group = utils.validateAndGroupRows([row], normalizedInput());
  const operations = utils.buildGoogleAdsMutateOperations(
    "1234567890",
    group,
    {
      geoTargets: [{ resourceName: "geoTargetConstants/2458" }],
      languages: [{ resourceName: "languageConstants/1000" }],
    },
    {
      logo: [
        {
          name: "acme-logo.png",
          url: "https://notion.local/logo.png",
          type: "file",
          base64: "bG9nbw==",
          dimensions: { width: 1200, height: 1200, format: "png" },
        },
      ],
      productServiceImages: [
        {
          name: "portrait.jpg",
          url: "https://notion.local/portrait.jpg",
          type: "file",
          base64: "cG9ydHJhaXQ=",
          dimensions: { width: 500, height: 900, format: "jpeg" },
        },
        {
          name: "too-small-square.jpg",
          url: "https://notion.local/small.jpg",
          type: "file",
          base64: "c21hbGw=",
          dimensions: { width: 250, height: 250, format: "jpeg" },
        },
      ],
    }
  );

  assert.equal(findCampaignAsset(operations, "AD_IMAGE"), false);
  assert.ok(findCampaignAsset(operations, "BUSINESS_LOGO"));
});

test("present but undownloadable Notion files fail instead of being skipped", async () => {
  const row = utils.pageToMediaPlanRow(makeNotionPage());
  const group = utils.validateAndGroupRows([row], normalizedInput());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("missing", { status: 403 })) as typeof fetch;

  try {
    await assert.rejects(
      () => utils.downloadMediaPlanAssetFiles(group),
      /Could not download Notion asset acme-logo\.png: HTTP 403/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function findCampaignAsset(operations: Array<Record<string, unknown>>, fieldType: string): boolean {
  return operations.some(
    (operation) =>
      (operation.campaignAssetOperation as { create?: { fieldType?: string } } | undefined)?.create?.fieldType ===
      fieldType
  );
}

function countCampaignAssets(operations: Array<Record<string, unknown>>, fieldType: string): number {
  return operations.filter(
    (operation) =>
      (operation.campaignAssetOperation as { create?: { fieldType?: string } } | undefined)?.create?.fieldType ===
      fieldType
  ).length;
}

function normalizedInput(): Record<string, unknown> {
  return {
    batchId,
    googleCid: "1234567890",
    source: "media-plan",
    dryRun: false,
    validateOnly: false,
  };
}

function makeNotionPage(): Record<string, unknown> {
  return {
    id: "page-1",
    url: "https://notion.local/page-1",
    properties: {
      "01 Ad Group Name": title("Shoes"),
      "02 Client / Ad Account": relation("account-page-1"),
      "05 Campaign Name": richText("Acme Search"),
      "06 Campaign Objective": select("Leads"),
      "07 Campaign Type": select("Search"),
      "08 Bidding Strategy": select("Conversions"),
      "09 Website URL": url("https://example.com"),
      "10 Final URL": url("https://example.com/landing"),
      "11 Start Date": date("2026-07-01"),
      "12 Average Daily Budget": number(100),
      "14 Network": multiSelect(["Google Search Only"]),
      "16 Target Location": multiSelect(["Malaysia Nationwide"]),
      "17 Language": multiSelect(["English"]),
      "18 Keyword 1": richText("[running shoes]"),
      "28 Display Path 1": richText("shop"),
      "29 Display Path 2": richText("shoes"),
      "30 Headline 1": richText("Buy Running Shoes"),
      "31 Headline 2": richText("Comfortable Shoes"),
      "32 Headline 3": richText("Shop Acme Shoes"),
      "45 Description 1": richText("Browse comfortable shoes for daily runs."),
      "46 Description 2": richText("Order online today from Acme Shoes."),
      "49 Business Name": richText("Acme Shoes"),
      "50 Logo": files([{ name: "acme-logo.png", url: "https://notion.local/logo.png" }]),
      "51 Product / Service Image": files([
        { name: "shoe.jpg", url: "https://notion.local/shoe.jpg" },
        { name: "shoe-2.jpg", url: "https://notion.local/shoe-2.jpg" },
      ]),
      "53 Sitelink 1 Title": richText("Shop Shoes"),
      "54 Sitelink 1 URL": url("https://example.com/shop"),
      "65 Status": select("Ready for Setup"),
      "67 Missing Info": checkbox(false),
      "69 Setup Notes": richText(`MediaPlanBatch: ${batchId}`),
      "70 Review Notes": richText(`MediaPlanBatch: ${batchId}`),
    },
  };
}

function richText(value: string): Record<string, unknown> {
  return { rich_text: [{ plain_text: value, text: { content: value } }] };
}

function title(value: string): Record<string, unknown> {
  return { title: [{ plain_text: value, text: { content: value } }] };
}

function select(value: string): Record<string, unknown> {
  return { select: { name: value } };
}

function multiSelect(values: string[]): Record<string, unknown> {
  return { multi_select: values.map((name) => ({ name })) };
}

function relation(id: string): Record<string, unknown> {
  return { relation: [{ id }] };
}

function url(value: string): Record<string, unknown> {
  return { url: value };
}

function date(value: string): Record<string, unknown> {
  return { date: { start: value } };
}

function number(value: number): Record<string, unknown> {
  return { number: value };
}

function checkbox(value: boolean): Record<string, unknown> {
  return { checkbox: value };
}

function files(input: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    files: input.map((file) => ({
      name: file.name,
      type: "file",
      file: { url: file.url },
    })),
  };
}
