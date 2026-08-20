import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TikTokAdsActionName } from "../../lib/tiktok/ads-actions";
import type { TikTokAdsApiResult, TikTokAdsRequestInput } from "../../lib/tiktok/ads-client";
import { buildTikTokSetupRevision, type TikTokSetupRevision } from "../../lib/tiktok/setup-plan";
import {
  activateTikTokSetup as activateTikTokSetupRaw,
  compileTikTokSetupRevision,
  createTikTokDisabledSetup as createTikTokDisabledSetupRaw,
  getTikTokSetupLaunchReceiptPath,
  previewTikTokDisabledSetup as previewTikTokDisabledSetupRaw,
  previewTikTokSetupActivation as previewTikTokSetupActivationRaw,
  type TikTokSetupLauncherClient,
} from "../../lib/tiktok/setup-launcher";
import { setupInput } from "./setup-test-fixtures";

const previewNow = () => new Date("2026-08-18T01:00:00.000Z");
const expiredNow = () => new Date("2026-08-18T01:16:00.000Z");
const executionMode = "SINGLE_PERSISTENT_HOST" as const;

type PreviewSetupParams = Omit<
  Parameters<typeof previewTikTokDisabledSetupRaw>[0],
  "executionMode"
>;
type CreateSetupParams = Omit<
  Parameters<typeof createTikTokDisabledSetupRaw>[0],
  "executionMode"
>;
type PreviewActivationParams = Omit<
  Parameters<typeof previewTikTokSetupActivationRaw>[0],
  "executionMode"
>;
type ActivateSetupParams = Omit<
  Parameters<typeof activateTikTokSetupRaw>[0],
  "executionMode"
>;

function previewTikTokDisabledSetup(params: PreviewSetupParams) {
  return previewTikTokDisabledSetupRaw({
    ...params,
    executionMode,
    initializeNewReceipt: params.initializeNewReceipt ?? true,
  });
}

function createTikTokDisabledSetup(params: CreateSetupParams) {
  return createTikTokDisabledSetupRaw({ ...params, executionMode });
}

function previewTikTokSetupActivation(params: PreviewActivationParams) {
  return previewTikTokSetupActivationRaw({ ...params, executionMode });
}

function activateTikTokSetup(params: ActivateSetupParams) {
  return activateTikTokSetupRaw({ ...params, executionMode });
}

type CreateAction = "campaign.create" | "adgroup.create" | "ad.create";
type GetAction = "campaign.get" | "adgroup.get" | "ad.get";
type StatusAction = "campaign.status" | "adgroup.status" | "ad.status";
type AssetKind = "pixel" | "identity" | "video" | "form";

class HardeningTikTokClient implements TikTokSetupLauncherClient {
  readonly calls: Array<{ action: TikTokAdsActionName; input: TikTokAdsRequestInput }> = [];
  readonly status = new Map<string, "DISABLE" | "ENABLE">();
  readonly materialConfig = new Map<string, Record<string, unknown>>();
  readonly unavailableAssets = new Set<AssetKind>();
  readonly ids = { campaign: 0, adgroup: 0, ad: 0 };
  advertiserAssertions = 0;
  liveAdvertiserReads = 0;
  badCreateResponse?: { action: CreateAction; mode: "missing" | "multiple" };
  mismatchedGetIdAction?: GetAction;
  wrongGetStatusAction?: GetAction;
  ambiguousPostAction?: StatusAction;
  mismatchedFormResponse = false;
  forceSearchResultEnabledOnAdGroupGet = false;
  assertDurableCampaignAttemptBeforePost = false;
  sawDurableCampaignAttemptBeforePost = false;
  campaignCreateReceiptPath?: string;
  driftEnabledAdAfterAdGroupVerification = false;
  driftAfterCampaignEnableVerification = false;
  pauseCampaignCreate = false;
  pauseAdStatus = false;
  private campaignCreateEnteredResolve?: () => void;
  private campaignCreateReleaseResolve?: () => void;
  private adStatusEnteredResolve?: () => void;
  private adStatusReleaseResolve?: () => void;
  private readonly campaignCreateEnteredPromise = new Promise<void>((resolve) => {
    this.campaignCreateEnteredResolve = resolve;
  });
  private readonly campaignCreateReleasePromise = new Promise<void>((resolve) => {
    this.campaignCreateReleaseResolve = resolve;
  });
  private readonly adStatusEnteredPromise = new Promise<void>((resolve) => {
    this.adStatusEnteredResolve = resolve;
  });
  private readonly adStatusReleasePromise = new Promise<void>((resolve) => {
    this.adStatusReleaseResolve = resolve;
  });

  assertAdvertiser(advertiserId: string) {
    this.advertiserAssertions += 1;
    if (advertiserId !== "123") throw new Error("TikTok advertiser is not allowlisted");
    return { advertiser_id: "123", advertiser_name: "Primary Ads" };
  }

  async getLiveAdvertiserInfo(advertiserId: string) {
    this.liveAdvertiserReads += 1;
    if (advertiserId !== "123") throw new Error("Live TikTok advertiser mismatch");
    return {
      advertiser_id: "123",
      advertiser_name: "Primary Ads",
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
    };
  }

  waitForCampaignCreate() {
    return this.campaignCreateEnteredPromise;
  }

  releaseCampaignCreate() {
    this.campaignCreateReleaseResolve?.();
  }

  waitForAdStatus() {
    return this.adStatusEnteredPromise;
  }

  releaseAdStatus() {
    this.adStatusReleaseResolve?.();
  }

  driftStatus(resourceId: string, status: "DISABLE" | "ENABLE") {
    assert.ok(this.status.has(resourceId), `Expected fake resource ${resourceId}`);
    this.status.set(resourceId, status);
  }

  driftMaterial(resourceId: string, patch: Record<string, unknown>) {
    const current = this.materialConfig.get(resourceId);
    assert.ok(current, `Expected fake material config for ${resourceId}`);
    this.materialConfig.set(resourceId, { ...current, ...structuredClone(patch) });
  }

  async request<T = unknown>(
    action: TikTokAdsActionName,
    input: TikTokAdsRequestInput,
  ): Promise<TikTokAdsApiResult<T>> {
    this.calls.push({ action, input: structuredClone(input) });

    if (action === "identity.list") {
      return {
        data: {
          list: this.unavailableAssets.has("identity") ? [] : [{ identity_id: "identity_1" }],
        } as T,
        requestId: "asset-identities",
      };
    }
    if (action === "asset.video-search") {
      return {
        data: {
          list: this.unavailableAssets.has("video") ? [] : [{ video_id: "video_1" }],
        } as T,
        requestId: "asset-videos",
      };
    }
    if (action === "pixel.list") {
      return {
        data: {
          list: this.unavailableAssets.has("pixel") ? [] : [{ pixel_id: "9001" }],
        } as T,
        requestId: "asset-pixels",
      };
    }
    if (action === "lead-form.get") {
      if (this.unavailableAssets.has("form")) {
        throw new Error(`Required TikTok lead form is unavailable: ${String(input.page_id)}`);
      }
      return {
        data: { page_id: this.mismatchedFormResponse ? "wrong_form" : String(input.page_id) } as T,
        requestId: "asset-form",
      };
    }

    if (action === "campaign.create") {
      if (this.assertDurableCampaignAttemptBeforePost && this.ids.campaign === 0) {
        assert.ok(this.campaignCreateReceiptPath, "Expected a receipt path for the durability seam");
        const receipt = JSON.parse(await readFile(this.campaignCreateReceiptPath, "utf8")) as {
          steps: Record<string, { status?: string }>;
        };
        assert.equal(receipt.steps.campaign.status, "ATTEMPTING");
        this.sawDurableCampaignAttemptBeforePost = true;
      }
      if (this.pauseCampaignCreate) {
        this.campaignCreateEnteredResolve?.();
        await this.campaignCreateReleasePromise;
      }
      return this.createResponse<T>(action, input, `campaign_${++this.ids.campaign}`);
    }
    if (action === "adgroup.create") {
      return this.createResponse<T>(action, input, `adgroup_${++this.ids.adgroup}`);
    }
    if (action === "ad.create") {
      return this.createResponse<T>(action, input, `ad_${++this.ids.ad}`);
    }

    if (action === "campaign.status" || action === "adgroup.status" || action === "ad.status") {
      assert.equal(input.operation_status, "ENABLE");
      if (action === "ad.status" && this.pauseAdStatus) {
        this.adStatusEnteredResolve?.();
        await this.adStatusReleasePromise;
      }
      if (this.ambiguousPostAction === action) throw new Error(`Uncertain ${action} response`);
      const idField = action === "campaign.status"
        ? "campaign_ids"
        : action === "adgroup.status" ? "adgroup_ids" : "ad_ids";
      const ids = input[idField];
      assert.ok(Array.isArray(ids));
      for (const id of ids) this.status.set(String(id), "ENABLE");
      return { data: {} as T, requestId: `status-${action}` };
    }

    if (action === "campaign.get" || action === "adgroup.get" || action === "ad.get") {
      const resource = action === "campaign.get" ? "campaign" : action === "adgroup.get" ? "adgroup" : "ad";
      const idKey = `${resource}_id`;
      const filtering = input.filtering as Record<string, string[]>;
      const resourceId = filtering[`${resource}_ids`][0];
      const responseId = this.mismatchedGetIdAction === action ? `wrong_${resourceId}` : resourceId;
      const operationStatus = this.wrongGetStatusAction === action
        ? this.status.get(resourceId) === "ENABLE" ? "DISABLE" : "ENABLE"
        : this.status.get(resourceId);
      const entity = {
        [idKey]: responseId,
        operation_status: operationStatus,
        ...structuredClone(this.materialConfig.get(resourceId) ?? {}),
      };
      if (action === "adgroup.get" && this.forceSearchResultEnabledOnAdGroupGet) {
        entity.search_result_enabled = true;
      }
      if (
        action === "adgroup.get"
        && operationStatus === "ENABLE"
        && this.driftEnabledAdAfterAdGroupVerification
      ) {
        this.driftEnabledAdAfterAdGroupVerification = false;
        this.driftMaterial("ad_1", { ad_text: "Drifted after ad-group verification" });
      }
      if (
        action === "campaign.get"
        && operationStatus === "ENABLE"
        && this.driftAfterCampaignEnableVerification
      ) {
        this.driftAfterCampaignEnableVerification = false;
        this.driftMaterial(resourceId, { campaign_name: "Drifted after step verification" });
      }
      return {
        data: {
          list: [entity],
        } as T,
        requestId: `get-${resourceId}`,
      };
    }

    throw new Error(`Unexpected fake TikTok action: ${action}`);
  }

  private createResponse<T>(action: CreateAction, input: TikTokAdsRequestInput, resourceId: string) {
    this.status.set(resourceId, "DISABLE");
    this.materialConfig.set(resourceId, this.materialFromCreateInput(action, input));
    const behavior = this.badCreateResponse?.action === action ? this.badCreateResponse.mode : undefined;
    if (behavior === "missing") {
      return { data: {} as T, requestId: `create-${resourceId}` };
    }
    if (behavior === "multiple") {
      const pluralKey = action === "campaign.create"
        ? "campaign_ids"
        : action === "adgroup.create" ? "adgroup_ids" : "ad_ids";
      return {
        data: { [pluralKey]: [resourceId, `${resourceId}_duplicate`] } as T,
        requestId: `create-${resourceId}`,
      };
    }
    if (action === "campaign.create") {
      return { data: { campaign_id: resourceId } as T, requestId: `create-${resourceId}` };
    }
    if (action === "adgroup.create") {
      return { data: { adgroup_id: resourceId } as T, requestId: `create-${resourceId}` };
    }
    return { data: { ad_ids: [resourceId] } as T, requestId: `create-${resourceId}` };
  }

  private materialFromCreateInput(action: CreateAction, input: TikTokAdsRequestInput) {
    const {
      advertiser_id: _advertiserId,
      request_id: _requestId,
      operation_status: _operationStatus,
      ...material
    } = structuredClone(input);
    void _advertiserId;
    void _requestId;
    void _operationStatus;
    if (action !== "ad.create") return material;
    const creatives = material.creatives;
    assert.ok(Array.isArray(creatives));
    assert.equal(creatives.length, 1);
    const { creatives: _creatives, ...root } = material;
    void _creatives;
    return { ...root, ...(creatives[0] as Record<string, unknown>) };
  }
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tiktok-hardening-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function callsFor(client: HardeningTikTokClient, actions: TikTokAdsActionName[]) {
  return client.calls.filter((call) => actions.includes(call.action));
}

function statusPosts(client: HardeningTikTokClient) {
  return callsFor(client, ["ad.status", "adgroup.status", "campaign.status"]);
}

function createPosts(client: HardeningTikTokClient) {
  return callsFor(client, ["campaign.create", "adgroup.create", "ad.create"]);
}

function operationInput(revision: TikTokSetupRevision, resourceType: "ADGROUP" | "AD") {
  const operation = compileTikTokSetupRevision(revision).operations.find(
    (candidate) => candidate.resourceType === resourceType,
  );
  assert.ok(operation, `Expected compiled ${resourceType} operation`);
  return operation.input;
}

function creative(input: Record<string, unknown>) {
  const creatives = input.creatives;
  assert.ok(Array.isArray(creatives));
  assert.equal(creatives.length, 1);
  return creatives[0] as Record<string, unknown>;
}

function assertCompiledAdGroupsDisableSearch(revision: TikTokSetupRevision) {
  const adGroups = compileTikTokSetupRevision(revision).operations.filter(
    (operation) => operation.resourceType === "ADGROUP",
  );
  assert.ok(adGroups.length > 0, "Expected at least one compiled ad-group operation");
  for (const adGroup of adGroups) {
    assert.equal(
      adGroup.input.search_result_enabled,
      false,
      `Expected ${adGroup.operationKey} to disable TikTok search-result placement`,
    );
  }
}

async function createDisabled(
  root: string,
  client: HardeningTikTokClient,
  revision = buildTikTokSetupRevision(setupInput()),
) {
  await previewTikTokDisabledSetup({ client, revision, root, now: previewNow });
  await createTikTokDisabledSetup({
    client,
    revision,
    root,
    now: previewNow,
    confirmAdvertiserName: "Primary Ads",
  });
  return revision;
}

async function createActivationPreview(
  root: string,
  client: HardeningTikTokClient,
  revision = buildTikTokSetupRevision(setupInput()),
) {
  await createDisabled(root, client, revision);
  await previewTikTokSetupActivation({ client, revision, root, now: previewNow });
  return revision;
}

test("compiles each supported objective/destination adapter to the required TikTok fields", () => {
  const clickInput = structuredClone(setupInput("TRAFFIC"));
  Object.assign(clickInput.adGroups[0], {
    objectiveSettings: {
      objective: "TRAFFIC",
      destination: "WEBSITE",
      destinationUrl: "https://example.com/click?utm_source=tiktok",
      optimizationGoal: "CLICK",
      billingEvent: "CPC",
    },
  });
  const clickRevision = buildTikTokSetupRevision(clickInput);
  assert.deepEqual(
    {
      promotion_type: operationInput(clickRevision, "ADGROUP").promotion_type,
      optimization_goal: operationInput(clickRevision, "ADGROUP").optimization_goal,
      billing_event: operationInput(clickRevision, "ADGROUP").billing_event,
      landing_page_url: creative(operationInput(clickRevision, "AD")).landing_page_url,
    },
    {
      promotion_type: "WEBSITE",
      optimization_goal: "CLICK",
      billing_event: "CPC",
      landing_page_url: "https://example.com/click?utm_source=tiktok",
    },
  );

  const landingPageRevision = buildTikTokSetupRevision(setupInput("TRAFFIC"));
  assert.deepEqual(
    {
      promotion_type: operationInput(landingPageRevision, "ADGROUP").promotion_type,
      optimization_goal: operationInput(landingPageRevision, "ADGROUP").optimization_goal,
      billing_event: operationInput(landingPageRevision, "ADGROUP").billing_event,
      landing_page_url: creative(operationInput(landingPageRevision, "AD")).landing_page_url,
    },
    {
      promotion_type: "WEBSITE",
      optimization_goal: "TRAFFIC_LANDING_PAGE_VIEW",
      billing_event: "OCPM",
      landing_page_url: "https://example.com/traffic?utm_source=tiktok",
    },
  );

  const webConversionRevision = buildTikTokSetupRevision(setupInput("WEB_CONVERSIONS"));
  assert.deepEqual(
    {
      promotion_type: operationInput(webConversionRevision, "ADGROUP").promotion_type,
      optimization_goal: operationInput(webConversionRevision, "ADGROUP").optimization_goal,
      billing_event: operationInput(webConversionRevision, "ADGROUP").billing_event,
      pixel_id: operationInput(webConversionRevision, "ADGROUP").pixel_id,
      optimization_event: operationInput(webConversionRevision, "ADGROUP").optimization_event,
      landing_page_url: creative(operationInput(webConversionRevision, "AD")).landing_page_url,
    },
    {
      promotion_type: "WEBSITE",
      optimization_goal: "CONVERT",
      billing_event: "OCPM",
      pixel_id: "9001",
      optimization_event: "COMPLETE_PAYMENT",
      landing_page_url: "https://example.com/convert?utm_source=tiktok",
    },
  );

  const instantLeadRevision = buildTikTokSetupRevision(setupInput("LEAD_GENERATION"));
  assert.deepEqual(
    {
      promotion_type: operationInput(instantLeadRevision, "ADGROUP").promotion_type,
      promotion_target_type: operationInput(instantLeadRevision, "ADGROUP").promotion_target_type,
      optimization_goal: operationInput(instantLeadRevision, "ADGROUP").optimization_goal,
      billing_event: operationInput(instantLeadRevision, "ADGROUP").billing_event,
      page_id: creative(operationInput(instantLeadRevision, "AD")).page_id,
    },
    {
      promotion_type: "LEAD_GENERATION",
      promotion_target_type: "INSTANT_PAGE",
      optimization_goal: "LEAD_GENERATION",
      billing_event: "OCPM",
      page_id: "8001",
    },
  );

  const websiteLeadInput = structuredClone(setupInput("LEAD_GENERATION"));
  Object.assign(websiteLeadInput.adGroups[0], {
    objectiveSettings: {
      objective: "LEAD_GENERATION",
      destination: "WEBSITE",
      destinationUrl: "https://example.com/lead?utm_source=tiktok",
      promotionTargetType: "EXTERNAL_WEBSITE",
      optimizationGoal: "LEAD_GENERATION",
      billingEvent: "OCPM",
      pixelId: "9001",
      optimizationEvent: "SUBMIT_FORM",
    },
  });
  const websiteLeadRevision = buildTikTokSetupRevision(websiteLeadInput);
  assert.deepEqual(
    {
      promotion_type: operationInput(websiteLeadRevision, "ADGROUP").promotion_type,
      promotion_target_type: operationInput(websiteLeadRevision, "ADGROUP").promotion_target_type,
      optimization_goal: operationInput(websiteLeadRevision, "ADGROUP").optimization_goal,
      billing_event: operationInput(websiteLeadRevision, "ADGROUP").billing_event,
      pixel_id: operationInput(websiteLeadRevision, "ADGROUP").pixel_id,
      optimization_event: operationInput(websiteLeadRevision, "ADGROUP").optimization_event,
      landing_page_url: creative(operationInput(websiteLeadRevision, "AD")).landing_page_url,
    },
    {
      promotion_type: "LEAD_GENERATION",
      promotion_target_type: "EXTERNAL_WEBSITE",
      optimization_goal: "LEAD_GENERATION",
      billing_event: "OCPM",
      pixel_id: "9001",
      optimization_event: "SUBMIT_FORM",
      landing_page_url: "https://example.com/lead?utm_source=tiktok",
    },
  );

  for (const revision of [
    clickRevision,
    landingPageRevision,
    webConversionRevision,
    instantLeadRevision,
    websiteLeadRevision,
  ]) {
    assertCompiledAdGroupsDisableSearch(revision);
  }
});

test("salts deterministic provider request IDs by revision operation key", () => {
  const input = structuredClone(setupInput());
  input.adGroups[0].ads.push({
    ...structuredClone(input.adGroups[0].ads[0]),
    key: "video-02",
  });
  const revision = buildTikTokSetupRevision(input);
  const first = compileTikTokSetupRevision(revision);
  const second = compileTikTokSetupRevision(structuredClone(revision));
  const firstAdIds = first.operations
    .filter((operation) => operation.resourceType === "AD")
    .map((operation) => operation.input.request_id);
  const secondAdIds = second.operations
    .filter((operation) => operation.resourceType === "AD")
    .map((operation) => operation.input.request_id);
  assert.equal(firstAdIds.length, 2);
  assert.notEqual(firstAdIds[0], firstAdIds[1]);
  assert.deepEqual(firstAdIds, secondAdIds);
});

test("all production launcher gates reject unsafe execution modes before client access", async (t) => {
  type RawLauncher = (params: Record<string, unknown>) => Promise<unknown>;
  const gates: Array<{
    name: string;
    launcher: RawLauncher;
    requiresConfirmation: boolean;
  }> = [
    {
      name: "setup preview",
      launcher: previewTikTokDisabledSetupRaw as unknown as RawLauncher,
      requiresConfirmation: false,
    },
    {
      name: "setup create",
      launcher: createTikTokDisabledSetupRaw as unknown as RawLauncher,
      requiresConfirmation: true,
    },
    {
      name: "activation preview",
      launcher: previewTikTokSetupActivationRaw as unknown as RawLauncher,
      requiresConfirmation: false,
    },
    {
      name: "activation",
      launcher: activateTikTokSetupRaw as unknown as RawLauncher,
      requiresConfirmation: true,
    },
  ];
  const unsafeModes: Array<{
    name: string;
    executionMode?: "MULTI_HOST_OR_EPHEMERAL";
  }> = [
    { name: "missing execution mode" },
    { name: "multi-host or ephemeral execution", executionMode: "MULTI_HOST_OR_EPHEMERAL" },
  ];

  for (const gate of gates) {
    for (const unsafeMode of unsafeModes) {
      await t.test(`${gate.name}: ${unsafeMode.name}`, async () => {
        await withRoot(async (root) => {
          const client = new HardeningTikTokClient();
          const revision = buildTikTokSetupRevision(setupInput());
          const params: Record<string, unknown> = {
            client,
            revision,
            root,
            now: previewNow,
          };
          if (gate.requiresConfirmation) params.confirmAdvertiserName = "Primary Ads";
          if (unsafeMode.executionMode) params.executionMode = unsafeMode.executionMode;

          await assert.rejects(
            gate.launcher(params),
            /requires explicit SINGLE_PERSISTENT_HOST execution/,
          );
          assert.equal(client.advertiserAssertions, 0);
          assert.equal(client.liveAdvertiserReads, 0);
          assert.equal(client.calls.length, 0);
        });
      });
    }
  }
});

test("fresh receipt initialization is explicit and happens only through the confirmed local preview", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());

    await assert.rejects(
      previewTikTokDisabledSetupRaw({
        client,
        revision,
        root,
        now: previewNow,
        executionMode,
      }),
      /No durable TikTok setup receipt exists.*initializeNewReceipt=true/,
    );
    assert.equal(client.advertiserAssertions, 1);
    assert.equal(client.liveAdvertiserReads, 1);
    assert.equal(client.calls.length, 0, "Missing initialization must fail before asset GETs");
    assert.equal(createPosts(client).length, 0);

    const initialized = await previewTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
    });
    assert.equal(initialized.receipt.status, "PREVIEWED");
    assert.equal(
      initialized.receiptPath,
      getTikTokSetupLaunchReceiptPath(revision.revisionId, root),
    );
    assert.equal(
      initialized.receiptPath.includes(path.join("outputs", "state", "tiktok_ads", "setup_launcher")),
      true,
    );
  });
});

test("deleted durable receipt is never silently recreated by create or ordinary preview", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    const initialized = await previewTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
    });
    await rm(initialized.receiptPath);
    const assetCallsBefore = client.calls.length;

    await assert.rejects(
      createTikTokDisabledSetupRaw({
        client,
        revision,
        root,
        now: previewNow,
        executionMode,
        confirmAdvertiserName: "Primary Ads",
      }),
      /Run the TikTok setup launcher in preview mode before apply/,
    );
    assert.equal(createPosts(client).length, 0);

    await assert.rejects(
      previewTikTokDisabledSetupRaw({
        client,
        revision,
        root,
        now: previewNow,
        executionMode,
      }),
      /durable TikTok setup receipt is missing for an initialized revision/,
    );
    assert.equal(client.calls.length, assetCallsBefore, "Receipt loss must fail before asset GETs");
    assert.equal(createPosts(client).length, 0);
    await assert.rejects(readFile(initialized.receiptPath, "utf8"), { code: "ENOENT" });
  });
});

test("campaign create observes its ATTEMPTING receipt durably persisted before POST", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    const preview = await previewTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
    });
    client.campaignCreateReceiptPath = preview.receiptPath;
    client.assertDurableCampaignAttemptBeforePost = true;

    const created = await createTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
      confirmAdvertiserName: "Primary Ads",
    });
    assert.equal(created.receipt.status, "CREATED_DISABLED");
    assert.equal(client.sawDurableCampaignAttemptBeforePost, true);
  });
});

test("activation requires its separate preview and exact advertiser confirmation", async (t) => {
  await t.test("activation without preview", async () => {
    await withRoot(async (root) => {
      const client = new HardeningTikTokClient();
      const revision = await createDisabled(root, client);
      await assert.rejects(
        activateTikTokSetup({
          client,
          revision,
          root,
          now: previewNow,
          confirmAdvertiserName: "Primary Ads",
        }),
        /separate TikTok activation preview/,
      );
      assert.equal(statusPosts(client).length, 0);
    });
  });

  await t.test("wrong confirmation", async () => {
    await withRoot(async (root) => {
      const client = new HardeningTikTokClient();
      const revision = await createActivationPreview(root, client);
      await assert.rejects(
        activateTikTokSetup({
          client,
          revision,
          root,
          now: previewNow,
          confirmAdvertiserName: "primary ads",
        }),
        /Exact TikTok advertiser-name confirmation/,
      );
      assert.equal(statusPosts(client).length, 0);
    });
  });
});

test("an expired activation preview cannot submit a status mutation", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    await assert.rejects(
      activateTikTokSetup({
        client,
        revision,
        root,
        now: expiredNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /activation preview expired/,
    );
    assert.equal(statusPosts(client).length, 0);
  });
});

test("external status or material drift before activation causes zero status POSTs", async (t) => {
  const cases: Array<{
    name: string;
    drift: (client: HardeningTikTokClient) => void;
    error: RegExp;
  }> = [
    {
      name: "disabled status changed",
      drift: (client) => client.driftStatus("ad_1", "ENABLE"),
      error: /expected DISABLE/,
    },
    {
      name: "approved ad copy changed",
      drift: (client) => client.driftMaterial("ad_1", { ad_text: "Externally edited copy" }),
      error: /material configuration drift at ad_text/,
    },
    {
      name: "approved ad-group budget changed",
      drift: (client) => client.driftMaterial("adgroup_1", { budget: 999 }),
      error: /material configuration drift at budget/,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await withRoot(async (root) => {
        const client = new HardeningTikTokClient();
        const revision = await createActivationPreview(root, client);
        scenario.drift(client);
        await assert.rejects(
          activateTikTokSetup({
            client,
            revision,
            root,
            now: previewNow,
            confirmAdvertiserName: "Primary Ads",
          }),
          scenario.error,
        );
        assert.equal(statusPosts(client).length, 0);
      });
    });
  }
});

test("refreshing a cached activation preview performs fresh GETs and detects drift", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    const getActions: TikTokAdsActionName[] = ["campaign.get", "adgroup.get", "ad.get"];
    const getsBeforeRefresh = callsFor(client, getActions).length;
    client.driftMaterial("ad_1", { ad_text: "Changed after activation preview" });

    await assert.rejects(
      previewTikTokSetupActivation({ client, revision, root, now: previewNow }),
      /material configuration drift at ad_text/,
    );
    assert.ok(callsFor(client, getActions).length > getsBeforeRefresh);
    assert.equal(statusPosts(client).length, 0);
  });
});

test("an ambiguous activation status POST is recorded once and never retried", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    client.ambiguousPostAction = "ad.status";

    await assert.rejects(
      activateTikTokSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /will not retry POST/,
    );
    await assert.rejects(
      activateTikTokSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /will not retry POST/,
    );
    assert.equal(callsFor(client, ["ad.status"]).length, 1);
    assert.equal(callsFor(client, ["adgroup.status", "campaign.status"]).length, 0);
  });
});

test("the final full readback prevents ACTIVE when configuration drifts after step verification", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    client.driftAfterCampaignEnableVerification = true;
    await assert.rejects(
      activateTikTokSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /material configuration drift at campaign_name/,
    );
    assert.deepEqual(statusPosts(client).map((call) => call.action), [
      "ad.status",
      "adgroup.status",
      "campaign.status",
    ]);
  });
});

test("whole-graph verification catches enabled-child drift before campaign enable", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    client.driftEnabledAdAfterAdGroupVerification = true;

    await assert.rejects(
      activateTikTokSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /material configuration drift at ad_text/,
    );
    assert.deepEqual(statusPosts(client).map((call) => call.action), [
      "ad.status",
      "adgroup.status",
    ]);
    assert.equal(callsFor(client, ["campaign.status"]).length, 0);
  });
});

test("preview fails closed when a referenced provider asset is unavailable", async (t) => {
  const cases: Array<{
    name: string;
    asset: AssetKind;
    input: ReturnType<typeof setupInput>;
    error: RegExp;
  }> = [
    {
      name: "pixel",
      asset: "pixel",
      input: setupInput("WEB_CONVERSIONS"),
      error: /pixel is unavailable/,
    },
    {
      name: "identity",
      asset: "identity",
      input: setupInput("TRAFFIC"),
      error: /identity is unavailable/,
    },
    {
      name: "video",
      asset: "video",
      input: setupInput("TRAFFIC"),
      error: /video is unavailable/,
    },
    {
      name: "instant form",
      asset: "form",
      input: setupInput("LEAD_GENERATION"),
      error: /lead form is unavailable/,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await withRoot(async (root) => {
        const client = new HardeningTikTokClient();
        client.unavailableAssets.add(scenario.asset);
        const revision = buildTikTokSetupRevision(scenario.input);
        await assert.rejects(
          previewTikTokDisabledSetup({ client, revision, root, now: previewNow }),
          scenario.error,
        );
        assert.equal(createPosts(client).length, 0);
      });
    });
  }
});

test("preview requires the exact Instant Form ID in a successful provider response", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    client.mismatchedFormResponse = true;
    const revision = buildTikTokSetupRevision(setupInput("LEAD_GENERATION"));
    await assert.rejects(
      previewTikTokDisabledSetup({ client, revision, root, now: previewNow }),
      /Instant Form is unavailable: 8001/,
    );
    assert.equal(createPosts(client).length, 0);
  });
});

test("missing, conflicting, or unverifiable provider create IDs block without retry", async (t) => {
  const cases: Array<{
    name: string;
    configure: (client: HardeningTikTokClient) => void;
    error: RegExp;
  }> = [
    {
      name: "missing create ID",
      configure: (client) => {
        client.badCreateResponse = { action: "campaign.create", mode: "missing" };
      },
      error: /will not retry POST/,
    },
    {
      name: "conflicting create IDs",
      configure: (client) => {
        client.badCreateResponse = { action: "campaign.create", mode: "multiple" };
      },
      error: /will not retry POST/,
    },
    {
      name: "GET returns a different ID",
      configure: (client) => {
        client.mismatchedGetIdAction = "campaign.get";
      },
      error: /GET verification/,
    },
    {
      name: "GET returns the wrong disabled status",
      configure: (client) => {
        client.wrongGetStatusAction = "campaign.get";
      },
      error: /GET verification/,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await withRoot(async (root) => {
        const client = new HardeningTikTokClient();
        const revision = buildTikTokSetupRevision(setupInput());
        await previewTikTokDisabledSetup({ client, revision, root, now: previewNow });
        scenario.configure(client);

        await assert.rejects(
          createTikTokDisabledSetup({
            client,
            revision,
            root,
            now: previewNow,
            confirmAdvertiserName: "Primary Ads",
          }),
          scenario.error,
        );
        await assert.rejects(
          createTikTokDisabledSetup({
            client,
            revision,
            root,
            now: previewNow,
            confirmAdvertiserName: "Primary Ads",
          }),
          /will not retry POST|no create POST was retried/,
        );
        assert.equal(callsFor(client, ["campaign.create"]).length, 1);
        assert.equal(callsFor(client, ["adgroup.create", "ad.create"]).length, 0);
      });
    });
  }
});

test("provider search-placement drift blocks ad-group verification without creating ads or retrying POST", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    assertCompiledAdGroupsDisableSearch(revision);
    await previewTikTokDisabledSetup({ client, revision, root, now: previewNow });
    client.forceSearchResultEnabledOnAdGroupGet = true;

    await assert.rejects(
      createTikTokDisabledSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /GET verification is unavailable for adgroup:prospecting/,
    );
    assert.deepEqual(
      createPosts(client).map((call) => call.action),
      ["campaign.create", "adgroup.create"],
    );
    assert.equal(callsFor(client, ["ad.create"]).length, 0);

    const receiptPath = getTikTokSetupLaunchReceiptPath(revision.revisionId, root);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      steps: Record<string, { error?: { message?: string } }>;
    };
    assert.match(
      receipt.steps["adgroup:prospecting"].error?.message ?? "",
      /material configuration drift at search_result_enabled/,
    );

    await assert.rejects(
      createTikTokDisabledSetup({
        client,
        revision,
        root,
        now: previewNow,
        confirmAdvertiserName: "Primary Ads",
      }),
      /no create POST was retried/,
    );
    assert.deepEqual(
      createPosts(client).map((call) => call.action),
      ["campaign.create", "adgroup.create"],
    );
    assert.equal(callsFor(client, ["ad.create"]).length, 0);
  });
});

test("concurrent create callers for one revision have exactly one writer", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: previewNow });
    client.pauseCampaignCreate = true;

    const firstCreate = createTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
      confirmAdvertiserName: "Primary Ads",
      lockTimeoutMs: 5,
    });
    await client.waitForCampaignCreate();
    try {
      await assert.rejects(
        createTikTokDisabledSetup({
          client,
          revision,
          root,
          now: previewNow,
          confirmAdvertiserName: "Primary Ads",
          lockTimeoutMs: 5,
        }),
        /locked by another writer/,
      );
    } finally {
      client.releaseCampaignCreate();
    }
    const completed = await firstCreate;
    assert.equal(completed.receipt.status, "CREATED_DISABLED");
    assert.deepEqual(
      createPosts(client).map((call) => call.action),
      ["campaign.create", "adgroup.create", "ad.create"],
    );
  });
});

test("concurrent activation callers for one revision submit one status sequence", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = await createActivationPreview(root, client);
    client.pauseAdStatus = true;

    const firstActivation = activateTikTokSetup({
      client,
      revision,
      root,
      now: previewNow,
      confirmAdvertiserName: "Primary Ads",
      lockTimeoutMs: 5,
    });
    await client.waitForAdStatus();
    try {
      await assert.rejects(
        activateTikTokSetup({
          client,
          revision,
          root,
          now: previewNow,
          confirmAdvertiserName: "Primary Ads",
          lockTimeoutMs: 5,
        }),
        /locked by another writer/,
      );
    } finally {
      client.releaseAdStatus();
    }
    const completed = await firstActivation;
    assert.equal(completed.receipt.status, "ACTIVE");
    assert.deepEqual(statusPosts(client).map((call) => call.action), [
      "ad.status",
      "adgroup.status",
      "campaign.status",
    ]);
  });
});

test("receipt resource-ID tampering is rejected by the integrity hash before provider reads", async () => {
  await withRoot(async (root) => {
    const client = new HardeningTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: previewNow });
    const created = await createTikTokDisabledSetup({
      client,
      revision,
      root,
      now: previewNow,
      confirmAdvertiserName: "Primary Ads",
    });
    const receipt = JSON.parse(await readFile(created.receiptPath, "utf8")) as {
      steps: Record<string, { resourceId?: string }>;
    };
    receipt.steps.campaign.resourceId = "campaign_tampered";
    await writeFile(created.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    const providerReadsBefore = callsFor(client, ["campaign.get", "adgroup.get", "ad.get"]).length;

    await assert.rejects(
      previewTikTokSetupActivation({ client, revision, root, now: previewNow }),
      /receipt integrity check failed/,
    );
    assert.equal(
      callsFor(client, ["campaign.get", "adgroup.get", "ad.get"]).length,
      providerReadsBefore,
    );
    assert.equal(statusPosts(client).length, 0);
  });
});
