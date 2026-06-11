import type { AdsChangeSet } from "@/lib/ads-edit/types";

export interface AdsSyncAdapterResult {
  syncedChanges: number;
  warnings: string[];
}

export interface AdsSyncAdapter {
  sync(changeSet: AdsChangeSet): Promise<AdsSyncAdapterResult>;
}

export class GoogleAdsSyncAdapter implements AdsSyncAdapter {
  async sync(changeSet: AdsChangeSet): Promise<AdsSyncAdapterResult> {
    if (process.env.GOOGLE_ADS_SYNC_ENABLED !== "true") {
      return {
        syncedChanges: changeSet.changes.length,
        warnings: [
          "Google Ads sync adapter accepted the change set in safe dry-run mode. Set GOOGLE_ADS_SYNC_ENABLED=true after wiring approved mutate operations.",
        ],
      };
    }

    throw new Error(
      "Google Ads live mutation is not configured yet. Add approved Google Ads mutate operations to GoogleAdsSyncAdapter before enabling production sync."
    );
  }
}

export class MetaAdsSyncAdapter implements AdsSyncAdapter {
  async sync(changeSet: AdsChangeSet): Promise<AdsSyncAdapterResult> {
    if (process.env.META_ADS_SYNC_ENABLED !== "true") {
      return {
        syncedChanges: changeSet.changes.length,
        warnings: [
          "Meta Ads sync adapter accepted the change set in safe dry-run mode. Set META_ADS_SYNC_ENABLED=true to send approved mutations to Meta Ads.",
        ],
      };
    }

    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      throw new Error("META_ACCESS_TOKEN is required before Meta Ads live sync can run.");
    }

    const warnings: string[] = [];
    let syncedChanges = 0;

    syncedChanges += await syncMetaEntityChanges(changeSet, accessToken, warnings);

    if (changeSet.changes.some((change) => change.path.startsWith("metaCreative."))) {
      const creativeResult = await syncMetaCreativeReplacement(changeSet, accessToken, warnings);
      syncedChanges += creativeResult.syncedChanges;
    }

    return {
      syncedChanges,
      warnings,
    };
  }
}

export function getAdsSyncAdapter(platform: AdsChangeSet["platform"]): AdsSyncAdapter {
  if (platform === "google") {
    return new GoogleAdsSyncAdapter();
  }
  return new MetaAdsSyncAdapter();
}

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

interface MetaAdCreativePayload {
  id?: string;
  name?: string;
  object_type?: string;
  object_story_spec?: MetaObjectStorySpec;
}

interface MetaAdPayload {
  creative?: MetaAdCreativePayload;
}

interface MetaObjectStorySpec {
  page_id?: string;
  instagram_actor_id?: string;
  link_data?: {
    link?: string;
    message?: string;
    name?: string;
    description?: string;
    image_hash?: string;
    call_to_action?: {
      type?: string;
      value?: {
        link?: string;
      };
    };
  };
  video_data?: {
    video_id?: string;
    message?: string;
    title?: string;
    image_url?: string;
    call_to_action?: {
      type?: string;
      value?: {
        link?: string;
      };
    };
  };
}

interface MetaMutationResponse {
  success?: boolean;
  id?: string;
  images?: Record<string, { hash?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

async function syncMetaEntityChanges(
  changeSet: AdsChangeSet,
  accessToken: string,
  warnings: string[]
): Promise<number> {
  let syncedChanges = 0;
  const campaignPayload: Record<string, string> = {};
  const adSetPayload: Record<string, string> = {};
  const adPayload: Record<string, string> = {};

  for (const change of changeSet.changes) {
    const nextValue = typeof change.after === "string" ? change.after.trim() : "";
    if (!nextValue) {
      continue;
    }

    if (change.path === "campaignSettings.campaignName") {
      campaignPayload.name = nextValue;
    } else if (change.path === "campaignSettings.adGroupName") {
      adSetPayload.name = nextValue;
    } else if (change.path === "campaignSettings.adName") {
      adPayload.name = nextValue;
    } else if (change.path === "campaignSettings.campaignStatus") {
      const status = normalizeMetaMutableStatus(nextValue);
      if (status) {
        campaignPayload.status = status;
      } else {
        warnings.push(`Campaign status "${nextValue}" was not synced. Meta live sync currently supports Active and Paused.`);
      }
    } else if (change.path === "campaignSettings.adGroupStatus") {
      const status = normalizeMetaMutableStatus(nextValue);
      if (status) {
        adSetPayload.status = status;
      } else {
        warnings.push(`Ad set status "${nextValue}" was not synced. Meta live sync currently supports Active and Paused.`);
      }
    } else if (change.path === "campaignSettings.adStatus") {
      const status = normalizeMetaMutableStatus(nextValue);
      if (status) {
        adPayload.status = status;
      } else {
        warnings.push(`Ad status "${nextValue}" was not synced. Meta live sync currently supports Active and Paused.`);
      }
    } else if (change.path.startsWith("campaignSettings.")) {
      warnings.push(`${change.label} was kept in the audit log but not synced. Meta v1 sync only mutates names, statuses, and replacement creatives.`);
    }
  }

  if (Object.keys(campaignPayload).length > 0) {
    await postMetaGraph(changeSet.campaignId, accessToken, campaignPayload);
    syncedChanges += countPayloadFields(campaignPayload);
  }
  if (Object.keys(adSetPayload).length > 0) {
    await postMetaGraph(changeSet.adGroupId, accessToken, adSetPayload);
    syncedChanges += countPayloadFields(adSetPayload);
  }
  if (Object.keys(adPayload).length > 0) {
    await postMetaGraph(changeSet.adId, accessToken, adPayload);
    syncedChanges += countPayloadFields(adPayload);
  }

  return syncedChanges;
}

async function syncMetaCreativeReplacement(
  changeSet: AdsChangeSet,
  accessToken: string,
  warnings: string[]
): Promise<AdsSyncAdapterResult> {
  const ad = await getMetaGraph<MetaAdPayload>(
    changeSet.adId,
    accessToken,
    "creative{id,name,object_type,object_story_spec}"
  );
  const currentCreative = ad.creative;
  const storySpec = cloneStorySpec(currentCreative?.object_story_spec);

  if (!currentCreative?.id || !storySpec) {
    throw new Error("Meta creative replacement cannot run because the selected ad did not return an editable object_story_spec.");
  }

  const creativeChanges = changeSet.changes.filter((change) => change.path.startsWith("metaCreative."));
  for (const change of creativeChanges) {
    const nextValue = typeof change.after === "string" ? change.after.trim() : "";
    if (change.path === "metaCreative.primaryText") {
      setMetaStoryText(storySpec, "message", nextValue);
    } else if (change.path === "metaCreative.headline") {
      setMetaStoryText(storySpec, "headline", nextValue);
    } else if (change.path === "metaCreative.description") {
      if (storySpec.link_data) {
        storySpec.link_data.description = nextValue;
      } else {
        warnings.push("Description was not synced because the current Meta creative is not link_data based.");
      }
    } else if (change.path === "metaCreative.callToAction") {
      setMetaCallToAction(storySpec, nextValue);
    } else if (change.path === "metaCreative.finalUrl") {
      setMetaDestinationUrl(storySpec, nextValue);
    } else if (change.path === "metaCreative.imageUrl") {
      if (storySpec.link_data) {
        const hash = await uploadMetaImage(changeSet.accountId, nextValue, accessToken);
        storySpec.link_data.image_hash = hash;
      } else if (storySpec.video_data) {
        storySpec.video_data.image_url = nextValue;
        warnings.push("Video creative image URL was applied as image_url. Meta may ignore this unless the source creative supports it.");
      }
    }
  }

  const creativeName = `${currentCreative.name || "Replacement creative"} - edited ${new Date().toISOString()}`;
  const createdCreative = await postMetaGraph<MetaMutationResponse>(
    normalizeMetaAdAccountId(changeSet.accountId, "adcreatives"),
    accessToken,
    {
      name: creativeName,
      object_story_spec: JSON.stringify(storySpec),
    }
  );

  if (!createdCreative.id) {
    throw new Error("Meta did not return an ID for the replacement creative.");
  }

  await postMetaGraph(changeSet.adId, accessToken, {
    creative: JSON.stringify({ creative_id: createdCreative.id }),
  });

  return {
    syncedChanges: creativeChanges.length,
    warnings,
  };
}

function countPayloadFields(payload: Record<string, string>): number {
  return Object.keys(payload).length;
}

function normalizeMetaMutableStatus(value: string): "ACTIVE" | "PAUSED" | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "ACTIVE" || normalized === "ENABLED") {
    return "ACTIVE";
  }
  if (normalized === "PAUSED") {
    return "PAUSED";
  }
  return null;
}

function normalizeMetaEnum(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeMetaAdAccountId(accountId: string, edge: string): string {
  const normalized = accountId.trim().replace(/^act_/i, "");
  return `act_${normalized}/${edge}`;
}

function cloneStorySpec(storySpec: MetaObjectStorySpec | undefined): MetaObjectStorySpec | null {
  if (!storySpec) {
    return null;
  }
  return JSON.parse(JSON.stringify(storySpec)) as MetaObjectStorySpec;
}

function setMetaStoryText(storySpec: MetaObjectStorySpec, field: "message" | "headline", value: string): void {
  if (storySpec.link_data) {
    if (field === "message") {
      storySpec.link_data.message = value;
    } else {
      storySpec.link_data.name = value;
    }
  }
  if (storySpec.video_data) {
    if (field === "message") {
      storySpec.video_data.message = value;
    } else {
      storySpec.video_data.title = value;
    }
  }
}

function setMetaCallToAction(storySpec: MetaObjectStorySpec, value: string): void {
  const type = normalizeMetaEnum(value);
  if (storySpec.link_data) {
    storySpec.link_data.call_to_action = {
      ...storySpec.link_data.call_to_action,
      type,
      value: storySpec.link_data.call_to_action?.value,
    };
  }
  if (storySpec.video_data) {
    storySpec.video_data.call_to_action = {
      ...storySpec.video_data.call_to_action,
      type,
      value: storySpec.video_data.call_to_action?.value,
    };
  }
}

function setMetaDestinationUrl(storySpec: MetaObjectStorySpec, value: string): void {
  if (storySpec.link_data) {
    storySpec.link_data.link = value;
    storySpec.link_data.call_to_action = {
      ...storySpec.link_data.call_to_action,
      value: {
        ...storySpec.link_data.call_to_action?.value,
        link: value,
      },
    };
  }
  if (storySpec.video_data) {
    storySpec.video_data.call_to_action = {
      ...storySpec.video_data.call_to_action,
      value: {
        ...storySpec.video_data.call_to_action?.value,
        link: value,
      },
    };
  }
}

async function uploadMetaImage(accountId: string, imageUrl: string, accessToken: string): Promise<string> {
  const response = await postMetaGraph<MetaMutationResponse>(
    normalizeMetaAdAccountId(accountId, "adimages"),
    accessToken,
    {
      url: imageUrl,
    }
  );
  const hash = Object.values(response.images ?? {})[0]?.hash;
  if (!hash) {
    throw new Error("Meta image upload did not return an image hash.");
  }
  return hash;
}

async function getMetaGraph<T>(path: string, accessToken: string, fields: string): Promise<T> {
  const url = new URL(`${META_GRAPH_API_BASE_URL}/${path}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", fields);
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T & MetaMutationResponse;
  if (!response.ok || payload.error) {
    throw new Error(formatMetaApiError(payload.error) || `Meta Graph API request failed for ${path}.`);
  }
  return payload as T;
}

async function postMetaGraph<T = MetaMutationResponse>(
  path: string,
  accessToken: string,
  payload: Record<string, string>
): Promise<T> {
  const body = new URLSearchParams();
  body.set("access_token", accessToken);
  Object.entries(payload).forEach(([key, value]) => body.set(key, value));

  const response = await fetch(`${META_GRAPH_API_BASE_URL}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json()) as T & MetaMutationResponse;
  if (!response.ok || json.error) {
    throw new Error(formatMetaApiError(json.error) || `Meta Graph API mutation failed for ${path}.`);
  }
  return json as T;
}

function formatMetaApiError(error: MetaMutationResponse["error"]): string | null {
  if (!error) {
    return null;
  }
  const codes = [error.type, error.code ? `code ${error.code}` : "", error.error_subcode ? `subcode ${error.error_subcode}` : ""]
    .filter(Boolean)
    .join(", ");
  return `Meta Graph API error${codes ? ` (${codes})` : ""}: ${error.message ?? "Unknown error"}`;
}
