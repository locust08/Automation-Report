import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TikTokAdsActionName } from "../../lib/tiktok/ads-actions";
import type { TikTokAdsApiResult, TikTokAdsRequestInput } from "../../lib/tiktok/ads-client";
import { buildTikTokSetupRevision } from "../../lib/tiktok/setup-plan";
import {
  activateTikTokSetup as activateTikTokSetupOnSingleHost,
  compileTikTokSetupRevision,
  convertTikTokLocalScheduleToUtc,
  createTikTokDisabledSetup as createTikTokDisabledSetupOnSingleHost,
  previewTikTokDisabledSetup as previewTikTokDisabledSetupOnSingleHost,
  previewTikTokSetupActivation as previewTikTokSetupActivationOnSingleHost,
  localIanaDateTimeToTikTokUtc,
  type TikTokSetupLauncherClient,
} from "../../lib/tiktok/setup-launcher";
import { setupInput } from "./setup-test-fixtures";

const fixedNow = () => new Date("2026-08-18T01:00:00.000Z");
const singleHostExecution = { executionMode: "SINGLE_PERSISTENT_HOST" as const };

function previewTikTokDisabledSetup(
  params: Omit<Parameters<typeof previewTikTokDisabledSetupOnSingleHost>[0], "executionMode">,
) {
  return previewTikTokDisabledSetupOnSingleHost({
    ...params,
    ...singleHostExecution,
    initializeNewReceipt: true,
  });
}

function createTikTokDisabledSetup(
  params: Omit<Parameters<typeof createTikTokDisabledSetupOnSingleHost>[0], "executionMode">,
) {
  return createTikTokDisabledSetupOnSingleHost({ ...params, ...singleHostExecution });
}

function previewTikTokSetupActivation(
  params: Omit<Parameters<typeof previewTikTokSetupActivationOnSingleHost>[0], "executionMode">,
) {
  return previewTikTokSetupActivationOnSingleHost({ ...params, ...singleHostExecution });
}

function activateTikTokSetup(
  params: Omit<Parameters<typeof activateTikTokSetupOnSingleHost>[0], "executionMode">,
) {
  return activateTikTokSetupOnSingleHost({ ...params, ...singleHostExecution });
}

class FakeTikTokClient implements TikTokSetupLauncherClient {
  readonly calls: Array<{ action: TikTokAdsActionName; input: TikTokAdsRequestInput }> = [];
  readonly status = new Map<string, "DISABLE" | "ENABLE">();
  readonly materialConfig = new Map<string, Record<string, unknown>>();
  readonly ids = { campaign: 0, adgroup: 0, ad: 0 };
  failNextGet?: TikTokAdsActionName;
  failNextGetAfterStatus?: TikTokAdsActionName;
  failNextPost?: TikTokAdsActionName;
  liveAdvertiserReads = 0;
  storedAdvertiserName = "Primary Ads";
  liveAdvertiser = {
    advertiser_id: "123",
    advertiser_name: "Primary Ads",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  };

  assertAdvertiser(advertiserId: string) {
    if (advertiserId !== "123") throw new Error("not allowlisted");
    return { advertiser_id: "123", advertiser_name: this.storedAdvertiserName };
  }

  async getLiveAdvertiserInfo(advertiserId: string) {
    if (advertiserId !== "123") throw new Error("live advertiser mismatch");
    this.liveAdvertiserReads += 1;
    return { ...this.liveAdvertiser };
  }

  async request<T = unknown>(
    action: TikTokAdsActionName,
    input: TikTokAdsRequestInput,
  ): Promise<TikTokAdsApiResult<T>> {
    this.calls.push({ action, input: structuredClone(input) });
    if (
      this.failNextGetAfterStatus === action
      && this.calls.some((call) => call.action === action.replace(".get", ".status"))
    ) {
      this.failNextGetAfterStatus = undefined;
      throw new Error(`temporary ${action}`);
    }
    if (this.failNextPost === action) {
      this.failNextPost = undefined;
      throw new Error(`uncertain ${action}`);
    }
    if (this.failNextGet === action) {
      this.failNextGet = undefined;
      throw new Error(`temporary ${action}`);
    }

    if (action === "identity.list") {
      return { data: { list: [{ identity_id: "identity_1" }] } as T, requestId: "req-identities" };
    }
    if (action === "asset.video-search") {
      return { data: { list: [{ video_id: "video_1" }] } as T, requestId: "req-videos" };
    }
    if (action === "pixel.list") {
      return { data: { list: [{ pixel_id: "9001" }] } as T, requestId: "req-pixels" };
    }
    if (action === "lead-form.get") {
      return { data: { page_id: String(input.page_id) } as T, requestId: "req-form" };
    }
    if (action === "campaign.create") {
      const id = `campaign_${++this.ids.campaign}`;
      this.status.set(id, "DISABLE");
      this.materialConfig.set(id, this.materialFromCreateInput(action, input));
      return { data: { campaign_id: id } as T, requestId: `req-${id}` };
    }
    if (action === "adgroup.create") {
      const id = `adgroup_${++this.ids.adgroup}`;
      this.status.set(id, "DISABLE");
      this.materialConfig.set(id, this.materialFromCreateInput(action, input));
      return { data: { adgroup_id: id } as T, requestId: `req-${id}` };
    }
    if (action === "ad.create") {
      const id = `ad_${++this.ids.ad}`;
      this.status.set(id, "DISABLE");
      this.materialConfig.set(id, this.materialFromCreateInput(action, input));
      return { data: { ad_ids: [id] } as T, requestId: `req-${id}` };
    }
    if (action === "campaign.status" || action === "adgroup.status" || action === "ad.status") {
      assert.equal(input.operation_status, "ENABLE");
      const field = action === "campaign.status" ? "campaign_ids" : action === "adgroup.status" ? "adgroup_ids" : "ad_ids";
      for (const id of input[field] as string[]) this.status.set(id, "ENABLE");
      return { data: {} as T, requestId: `req-${action}` };
    }
    if (action === "campaign.get" || action === "adgroup.get" || action === "ad.get") {
      const resource = action === "campaign.get" ? "campaign" : action === "adgroup.get" ? "adgroup" : "ad";
      const field = `${resource}_ids`;
      const idKey = `${resource}_id`;
      const filtering = input.filtering as Record<string, string[]>;
      const id = filtering[field][0];
      return {
        data: { list: [{
          [idKey]: id,
          operation_status: this.status.get(id),
          ...structuredClone(this.materialConfig.get(id) ?? {}),
        }] } as T,
        requestId: `verify-${id}`,
      };
    }
    throw new Error(`Unexpected fake action: ${action}`);
  }

  private materialFromCreateInput(
    action: "campaign.create" | "adgroup.create" | "ad.create",
    input: TikTokAdsRequestInput,
  ) {
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
  const root = await mkdtemp(path.join(os.tmpdir(), "tiktok-launcher-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function actions(client: FakeTikTokClient, included: TikTokAdsActionName[]) {
  return client.calls.filter((call) => included.includes(call.action)).map((call) => call.action);
}

test("compiles a deterministic disabled campaign -> ad-group -> ad plan", () => {
  const revision = buildTikTokSetupRevision(setupInput("WEB_CONVERSIONS"));
  const first = compileTikTokSetupRevision(revision);
  const second = compileTikTokSetupRevision(structuredClone(revision));
  assert.deepEqual(first, second);
  assert.deepEqual(first.operations.map((operation) => operation.action), [
    "campaign.create", "adgroup.create", "ad.create",
  ]);
  assert.ok(first.operations.every((operation) => operation.input.operation_status === "DISABLE"));
  assert.equal(first.operations[1].input.budget_mode, "BUDGET_MODE_DYNAMIC_DAILY_BUDGET");
  assert.equal(first.operations[1].input.search_result_enabled, false);
  assert.equal(first.operations[1].input.pixel_id, "9001");
  assert.equal(first.operations[1].input.schedule_start_time, "2026-08-31 16:00:00");
  assert.equal(first.operations[1].input.schedule_end_time, "2026-09-03 15:59:59");
  assert.equal((first.operations[2].input.creatives as Array<Record<string, unknown>>)[0].landing_page_url,
    "https://example.com/convert?utm_source=tiktok");
});

test("converts advertiser-local schedule boundaries to UTC across DST changes", () => {
  assert.equal(convertTikTokLocalScheduleToUtc({
    date: "2026-03-08",
    time: "00:00:00",
    timeZone: "America/New_York",
  }), "2026-03-08 05:00:00");
  assert.equal(convertTikTokLocalScheduleToUtc({
    date: "2026-03-08",
    time: "23:59:59",
    timeZone: "America/New_York",
  }), "2026-03-09 03:59:59");
  assert.equal(convertTikTokLocalScheduleToUtc({
    date: "2026-11-01",
    time: "00:00:00",
    timeZone: "America/New_York",
  }), "2026-11-01 04:00:00");
  assert.equal(convertTikTokLocalScheduleToUtc({
    date: "2026-11-01",
    time: "23:59:59",
    timeZone: "America/New_York",
  }), "2026-11-02 04:59:59");
  assert.throws(() => localIanaDateTimeToTikTokUtc({
    date: "2026-03-08",
    time: "02:30:00",
    timeZone: "America/New_York",
  }), /does not exist/);
  assert.throws(() => localIanaDateTimeToTikTokUtc({
    date: "2026-11-01",
    time: "01:30:00",
    timeZone: "America/New_York",
  }), /ambiguous/);
  assert.equal(localIanaDateTimeToTikTokUtc({
    date: "2026-11-01",
    time: "01:30:00",
    timeZone: "America/New_York",
    disambiguation: "earlier",
  }), "2026-11-01 05:30:00");
  assert.equal(localIanaDateTimeToTikTokUtc({
    date: "2026-11-01",
    time: "01:30:00",
    timeZone: "America/New_York",
    disambiguation: "later",
  }), "2026-11-01 06:30:00");
});

test("preview performs read-only asset checks and writes a revision-bound receipt", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput("WEB_CONVERSIONS"));
    const result = await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    assert.equal(result.receipt.status, "PREVIEWED");
    assert.equal(client.liveAdvertiserReads, 1);
    assert.equal(result.receipt.advertiser.currency, "MYR");
    assert.equal(result.receipt.advertiser.timezone, "Asia/Kuala_Lumpur");
    assert.deepEqual(actions(client, ["campaign.create", "adgroup.create", "ad.create"]), []);
    assert.deepEqual(actions(client, ["pixel.list", "identity.list", "asset.video-search"]), [
      "pixel.list", "identity.list", "asset.video-search",
    ]);
    const stored = JSON.parse(await readFile(result.receiptPath, "utf8"));
    assert.equal(stored.revisionHash, revision.revisionHash);
    assert.equal(stored.steps.campaign.status, "NOT_STARTED");
  });
});

test("fails closed when live advertiser currency or timezone differs from the approved revision", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    client.liveAdvertiser.advertiser_id = "999";
    await assert.rejects(
      previewTikTokDisabledSetup({ client, revision, root, now: fixedNow }),
      /advertiser ID mismatch/,
    );
    client.liveAdvertiser.advertiser_id = "123";
    client.liveAdvertiser.advertiser_name = "Renamed account";
    await assert.rejects(
      previewTikTokDisabledSetup({ client, revision, root, now: fixedNow }),
      /advertiser name mismatch/,
    );
    client.liveAdvertiser.advertiser_name = "Primary Ads";
    client.liveAdvertiser.currency = "USD";
    await assert.rejects(
      previewTikTokDisabledSetup({ client, revision, root, now: fixedNow }),
      /advertiser currency mismatch/,
    );
    client.liveAdvertiser.currency = "MYR";
    client.liveAdvertiser.timezone = "Asia/Singapore";
    await assert.rejects(
      previewTikTokDisabledSetup({ client, revision, root, now: fixedNow }),
      /advertiser timezone mismatch/,
    );
    assert.deepEqual(actions(client, ["campaign.create", "adgroup.create", "ad.create"]), []);
  });
});

test("uses the exact live advertiser profile while treating stored allowlist name as diagnostic", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    client.storedAdvertiserName = "Stale stored label";
    const revision = buildTikTokSetupRevision(setupInput());
    const result = await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    assert.equal(result.receipt.advertiser.advertiser_name, "Primary Ads");
  });
});

test("rebinds the live advertiser at create and activation gates", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    client.liveAdvertiser.currency = "USD";
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /advertiser currency mismatch/,
    );
    assert.equal(actions(client, ["campaign.create", "adgroup.create", "ad.create"]).length, 0);
  });

  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    await createTikTokDisabledSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    await previewTikTokSetupActivation({ client, revision, root, now: fixedNow });
    client.liveAdvertiser.timezone = "Asia/Singapore";
    await assert.rejects(
      activateTikTokSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /advertiser timezone mismatch/,
    );
    assert.equal(actions(client, ["ad.status", "adgroup.status", "campaign.status"]).length, 0);
  });
});

test("creates every object disabled, persists IDs, and GET-verifies in dependency order", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    const result = await createTikTokDisabledSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    assert.equal(result.receipt.status, "CREATED_DISABLED");
    assert.deepEqual(actions(client, [
      "campaign.create", "campaign.get",
      "adgroup.create", "adgroup.get",
      "ad.create", "ad.get",
    ]), [
      "campaign.create", "campaign.get",
      "adgroup.create", "adgroup.get",
      "ad.create", "ad.get",
    ]);
    for (const create of client.calls.filter((call) => call.action.endsWith(".create"))) {
      assert.equal(create.input.operation_status, "DISABLE");
      assert.equal(typeof create.input.request_id, "string");
    }
    assert.deepEqual(
      Object.values(result.receipt.steps).map((step) => [step.status, step.resourceId]),
      [["VERIFIED", "campaign_1"], ["VERIFIED", "adgroup_1"], ["VERIFIED", "ad_1"]],
    );
  });
});

test("resumes created-unverified objects with GET and never repeats create POST", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    client.failNextGet = "adgroup.get";
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /created but GET verification is unavailable/,
    );
    assert.equal(actions(client, ["adgroup.create"]).length, 1);

    const resumed = await createTikTokDisabledSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    assert.equal(resumed.receipt.status, "CREATED_DISABLED");
    assert.equal(actions(client, ["adgroup.create"]).length, 1);
    assert.equal(actions(client, ["ad.create"]).length, 1);
  });
});

test("blocks an ambiguous create and never retries its POST", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    client.failNextPost = "adgroup.create";
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /will not retry POST/,
    );
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /will not retry POST/,
    );
    assert.equal(actions(client, ["adgroup.create"]).length, 1);
  });
});

test("uses a separate activation preview and enables ads -> ad groups -> campaign last", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    await createTikTokDisabledSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    const activationPreview = await previewTikTokSetupActivation({ client, revision, root, now: fixedNow });
    assert.equal(activationPreview.receipt.status, "ACTIVATION_PREVIEWED");
    assert.deepEqual(activationPreview.receipt.activation?.steps.map((step) => step.action), [
      "ad.status", "adgroup.status", "campaign.status",
    ]);

    const activated = await activateTikTokSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    assert.equal(activated.receipt.status, "ACTIVE");
    assert.deepEqual(actions(client, ["ad.status", "adgroup.status", "campaign.status"]), [
      "ad.status", "adgroup.status", "campaign.status",
    ]);
    assert.deepEqual(actions(client, ["ad.get", "adgroup.get", "campaign.get"]).slice(-3), [
      "ad.get", "adgroup.get", "campaign.get",
    ]);
    assert.ok(activated.receipt.activation?.steps.every((step) => step.status === "VERIFIED"));
  });
});

test("resumes an applied-unverified activation with GET and never repeats status POST", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    await createTikTokDisabledSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    await previewTikTokSetupActivation({ client, revision, root, now: fixedNow });
    client.failNextGetAfterStatus = "ad.get";
    await assert.rejects(
      activateTikTokSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /status was submitted but GET verification is unavailable/,
    );
    assert.equal(actions(client, ["ad.status"]).length, 1);

    const resumed = await activateTikTokSetup({
      client, revision, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
    });
    assert.equal(resumed.receipt.status, "ACTIVE");
    assert.equal(actions(client, ["ad.status"]).length, 1);
    assert.deepEqual(actions(client, ["adgroup.status", "campaign.status"]), [
      "adgroup.status", "campaign.status",
    ]);
  });
});

test("requires exact advertiser confirmation and the immutable revision", async () => {
  await withRoot(async (root) => {
    const client = new FakeTikTokClient();
    const revision = buildTikTokSetupRevision(setupInput());
    await previewTikTokDisabledSetup({ client, revision, root, now: fixedNow });
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision, root, now: fixedNow, confirmAdvertiserName: "primary ads",
      }),
      /Exact TikTok advertiser-name confirmation/,
    );
    const edited = structuredClone(revision);
    edited.plan.campaign.name = "Edited after approval";
    await assert.rejects(
      createTikTokDisabledSetup({
        client, revision: edited, root, now: fixedNow, confirmAdvertiserName: "Primary Ads",
      }),
      /integrity check failed/,
    );
  });
});

