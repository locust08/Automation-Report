import {
  TIKTOK_ADS_ACTIONS,
  TIKTOK_ADS_API_BASE,
  type TikTokAdsActionName,
  type TikTokAdsActionDefinition,
} from "@/lib/tiktok/ads-actions";
import {
  assertNoTikTokSecrets,
  TikTokApiEnvelopeSchema,
} from "@/lib/tiktok/ads-schemas";
import {
  getSharedTikTokAdsRateLimiter,
  inferTikTokProviderRateLimitScope,
  TikTokLocalRateLimitError,
  type TikTokRateLimiter,
  type TikTokRateLimitScope,
} from "@/lib/tiktok/ads-rate-limit";
import {
  getTikTokBusinessAuthorizationContext,
  type TikTokBusinessAuthorizationContext,
} from "@/lib/tiktok/token-manager";
import type { TikTokAdvertiser } from "@/lib/tiktok/oauth";

export type TikTokAdsRequestInput = Record<string, unknown>;

export type TikTokAdsApiResult<T = unknown> = {
  data: T;
  requestId?: string;
};

export type TikTokLiveAdvertiserInfo = TikTokAdvertiser & {
  currency: string;
  timezone: string;
};

export type TikTokAdsClientDependencies = {
  fetch: typeof globalThis.fetch;
  sleep: (milliseconds: number) => Promise<void>;
  rateLimiter?: TikTokRateLimiter;
  dynamicReadAuthorization?: boolean;
};

export class TikTokAdsApiError extends Error {
  constructor(
    message: string,
    public readonly details: {
      action: TikTokAdsActionName;
      kind: "api_error" | "network_error" | "rate_limited";
      httpStatus?: number;
      providerCode?: number;
      requestId?: string;
      retryable: boolean;
      rateLimitSource?: "local" | "provider";
      rateLimitScope?: TikTokRateLimitScope;
      retryAfterMs?: number;
      retryAfterAt?: string;
      networkMessage?: string;
    },
  ) {
    super(message);
    this.name = "TikTokAdsApiError";
  }

  toJSON() {
    return { name: this.name, message: this.message, ...this.details };
  }
}

function defaultDependencies(): TikTokAdsClientDependencies {
  return {
    fetch: globalThis.fetch,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    dynamicReadAuthorization: true,
  };
}

function queryValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildUrl(path: string, params: TikTokAdsRequestInput) {
  const url = new URL(`${TIKTOK_ADS_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, queryValue(value));
  }
  return url;
}

function toFormData(params: TikTokAdsRequestInput) {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) {
      form.append(key, value);
    } else if (typeof value === "string") {
      form.append(key, value);
    } else {
      form.append(key, queryValue(value));
    }
  }
  return form;
}

function shouldRetry(status: number | undefined) {
  return status === 429 || (typeof status === "number" && status >= 500);
}

export class TikTokAdsClient {
  private readonly rateLimiter: TikTokRateLimiter;
  private readonly dynamicReadAuthorization: boolean;
  private readonly readableAdvertisers = new Map<string, Promise<TikTokAdvertiser>>();

  constructor(
    private readonly authorization: TikTokBusinessAuthorizationContext,
    private readonly dependencies: TikTokAdsClientDependencies = defaultDependencies(),
  ) {
    this.rateLimiter = dependencies.rateLimiter ?? getSharedTikTokAdsRateLimiter();
    this.dynamicReadAuthorization = dependencies.dynamicReadAuthorization === true;
  }

  listAuthorizedAdvertisers() {
    return this.authorization.advertisers.map((advertiser) => ({ ...advertiser }));
  }

  getGrantedScopes() {
    return [...this.authorization.grantedScopes];
  }

  assertAdvertiser(advertiserId: string): TikTokAdvertiser {
    const advertiser = this.authorization.advertisers.find(
      (candidate) => candidate.advertiser_id === advertiserId,
    );
    if (!advertiser) {
      throw new Error(`TikTok advertiser is not in the authorized Doppler allowlist: ${advertiserId}`);
    }
    return { ...advertiser };
  }

  isMutationAllowed(advertiserId: string) {
    return this.authorization.advertisers.some((candidate) => candidate.advertiser_id === advertiserId);
  }

  async getLiveAdvertiserInfo(advertiserId: string): Promise<TikTokLiveAdvertiserInfo> {
    if (!/^\d{1,32}$/.test(advertiserId)) throw new Error(`Invalid TikTok advertiser ID: ${advertiserId}`);
    const response = await this.requestInternal<unknown>("account.get", {
      advertiser_id: advertiserId,
      advertiser_ids: [advertiserId],
    }, true);
    const root = response.data && typeof response.data === "object"
      ? response.data as Record<string, unknown>
      : {};
    const nested = root.data && typeof root.data === "object"
      ? root.data as Record<string, unknown>
      : {};
    const candidates = Array.isArray(root.list) ? root.list : Array.isArray(nested.list) ? nested.list : [];
    const matches = candidates.filter((item) => item && typeof item === "object"
      && String((item as Record<string, unknown>).advertiser_id ?? "") === advertiserId) as Record<string, unknown>[];
    if (matches.length === 0) {
      throw new Error(`TikTok did not confirm exact advertiser access: ${advertiserId}`);
    }
    if (matches.length > 1) {
      throw new Error(`TikTok advertiser info did not return exactly one advertiser row: ${advertiserId}`);
    }
    const [match] = matches;
    const advertiserName = typeof match.name === "string"
      ? match.name.trim()
      : typeof match.advertiser_name === "string"
        ? match.advertiser_name.trim()
        : "";
    const currency = typeof match.currency === "string" ? match.currency.trim().toUpperCase() : "";
    const timezone = typeof match.timezone === "string" ? match.timezone.trim() : "";
    if (!advertiserName || !/^[A-Z]{3}$/.test(currency) || !timezone) {
      throw new Error(`TikTok advertiser info is incomplete for launch: ${advertiserId}`);
    }
    const live = {
      advertiser_id: advertiserId,
      advertiser_name: advertiserName,
      currency,
      timezone,
    };
    this.readableAdvertisers.set(advertiserId, Promise.resolve({
      advertiser_id: advertiserId,
      advertiser_name: advertiserName,
    }));
    return live;
  }

  async validateReadableAdvertiser(advertiserId: string, fresh = false): Promise<TikTokAdvertiser> {
    if (!/^\d{1,32}$/.test(advertiserId)) throw new Error(`Invalid TikTok advertiser ID: ${advertiserId}`);
    const stored = this.authorization.advertisers.find((candidate) => candidate.advertiser_id === advertiserId);
    if (stored && !this.dynamicReadAuthorization) return { ...stored };
    if (fresh) this.readableAdvertisers.delete(advertiserId);
    const existing = this.readableAdvertisers.get(advertiserId);
    if (existing) return { ...(await existing) };
    const validation = (async () => {
      const response = await this.requestInternal<unknown>("account.get", {
        advertiser_id: advertiserId,
        advertiser_ids: [advertiserId],
      }, true);
      const root = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
      const nested = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
      const candidates = Array.isArray(root.list) ? root.list : Array.isArray(nested.list) ? nested.list : [];
      const match = candidates.find((item) => item && typeof item === "object"
        && String((item as Record<string, unknown>).advertiser_id ?? "") === advertiserId) as Record<string, unknown> | undefined;
      if (!match) throw new Error(`TikTok did not confirm exact advertiser access: ${advertiserId}`);
      return {
        advertiser_id: advertiserId,
        advertiser_name: typeof match.advertiser_name === "string"
          ? match.advertiser_name
          : typeof match.name === "string" ? match.name : "Unnamed advertiser",
      };
    })();
    this.readableAdvertisers.set(advertiserId, validation);
    try {
      return { ...(await validation) };
    } catch (error) {
      this.readableAdvertisers.delete(advertiserId);
      throw error;
    }
  }

  async request<T = unknown>(
    actionName: TikTokAdsActionName,
    input: TikTokAdsRequestInput,
  ): Promise<TikTokAdsApiResult<T>> {
    return this.requestInternal(actionName, input, false);
  }

  private async requestInternal<T = unknown>(
    actionName: TikTokAdsActionName,
    input: TikTokAdsRequestInput,
    skipAdvertiserAuthorization: boolean,
  ): Promise<TikTokAdsApiResult<T>> {
    const action: TikTokAdsActionDefinition = TIKTOK_ADS_ACTIONS[actionName];
    assertNoTikTokSecrets(input, actionName === "spark.authorize" ? ["auth_code"] : []);
    const advertiserId = input.advertiser_id;
    if (action.advertiserRequired && !skipAdvertiserAuthorization) {
      if (typeof advertiserId !== "string" || advertiserId.length === 0) {
        throw new Error(`advertiser_id is required for ${actionName}`);
      }
      if (action.mutation || !this.dynamicReadAuthorization) this.assertAdvertiser(advertiserId);
      else if (actionName !== "account.get") await this.validateReadableAdvertiser(advertiserId);
    }
    const providerInput = action.stripAdvertiserId
      ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "advertiser_id"))
      : input;

    const maximumAttempts = action.method === "GET" ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      let releaseRateLimitLease: (() => void) | undefined;
      try {
        releaseRateLimitLease = await this.rateLimiter.acquire(actionName);
        const url = action.method === "GET"
          ? buildUrl(action.path, providerInput)
          : buildUrl(action.path, {});
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Access-Token": this.authorization.accessToken,
        };
        let body: BodyInit | undefined;
        if (action.method === "POST") {
          const hasBinaryValue = Object.values(providerInput).some(
            (value) => typeof Blob !== "undefined" && value instanceof Blob,
          );
          const useMultipart = action.multipart
            && (providerInput.upload_type === "UPLOAD_BY_FILE" || hasBinaryValue);
          if (useMultipart) {
            body = toFormData(providerInput);
          } else {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(providerInput);
          }
        }
        const response = await this.dependencies.fetch(url, {
          method: action.method,
          headers,
          body,
          cache: "no-store",
        });
        const raw = await response.json().catch(() => undefined);
        const envelope = TikTokApiEnvelopeSchema.safeParse(raw);
        const providerCode = envelope.success ? envelope.data.code : undefined;
        const providerRateLimited = response.status === 429 || providerCode === 40100;
        const rateLimitDecision = providerRateLimited
          ? this.rateLimiter.registerProviderLimit(
            actionName,
            response.headers.get("Retry-After"),
            inferTikTokProviderRateLimitScope(
              envelope.success ? envelope.data.message : undefined,
            ),
          )
          : undefined;
        const transientHttp = shouldRetry(response.status) && !providerRateLimited;
        const retryable = action.method === "GET" && (providerRateLimited || transientHttp);
        if (!response.ok || !envelope.success || envelope.data.code !== 0) {
          const error = new TikTokAdsApiError("TikTok API request failed", {
            action: actionName,
            kind: providerRateLimited ? "rate_limited" : "api_error",
            httpStatus: response.status,
            providerCode,
            requestId: envelope.success ? envelope.data.request_id : undefined,
            retryable,
            rateLimitSource: rateLimitDecision?.source,
            rateLimitScope: rateLimitDecision?.scope,
            retryAfterMs: rateLimitDecision?.retryAfterMs,
            retryAfterAt: rateLimitDecision?.retryAfterAt,
          });
          const autoRetry = action.method === "GET"
            && attempt < maximumAttempts
            && (transientHttp || rateLimitDecision?.autoRetry === true);
          if (autoRetry) {
            lastError = error;
            releaseRateLimitLease();
            releaseRateLimitLease = undefined;
            if (transientHttp) {
              await this.dependencies.sleep(250 * (2 ** (attempt - 1)));
            }
            continue;
          }
          throw error;
        }
        return {
          data: envelope.data.data as T,
          requestId: envelope.data.request_id,
        };
      } catch (error) {
        if (error instanceof TikTokAdsApiError) throw error;
        if (error instanceof TikTokLocalRateLimitError) {
          throw new TikTokAdsApiError("TikTok API request is rate limited", {
            action: actionName,
            kind: "rate_limited",
            retryable: action.method === "GET",
            rateLimitSource: error.decision.source,
            rateLimitScope: error.decision.scope,
            retryAfterMs: error.decision.retryAfterMs,
            retryAfterAt: error.decision.retryAfterAt,
          });
        }
        lastError = error;
        if (action.method === "GET" && attempt < maximumAttempts) {
          releaseRateLimitLease?.();
          releaseRateLimitLease = undefined;
          await this.dependencies.sleep(250 * (2 ** (attempt - 1)));
          continue;
        }
        throw new TikTokAdsApiError("TikTok API request failed", {
          action: actionName,
          kind: "network_error",
          retryable: action.method === "GET",
          networkMessage: error instanceof Error
            ? error.message.replace(/(access[-_ ]?token|app[-_ ]?secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
            : "Unknown network failure",
        });
      } finally {
        releaseRateLimitLease?.();
      }
    }
    throw lastError;
  }
}

export async function createTikTokAdsClient(options?: {
  authorization?: TikTokBusinessAuthorizationContext;
  dependencies?: TikTokAdsClientDependencies;
}) {
  const authorization = options?.authorization ?? await getTikTokBusinessAuthorizationContext();
  return new TikTokAdsClient(authorization, options?.dependencies);
}

