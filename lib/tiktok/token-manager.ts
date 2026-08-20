import {
  dopplerGetSecrets,
  dopplerSetSecrets,
  getDopplerTarget,
  type DopplerSecretValues,
} from "@/lib/doppler";
import type { TikTokAdvertiser, TikTokBusinessTokens } from "@/lib/tiktok/oauth";

export const TIKTOK_BUSINESS_SECRET_NAMES = {
  accessToken: "TIKTOK_BUSINESS_ACCESS_TOKEN",
  grantedScopes: "TIKTOK_BUSINESS_GRANTED_SCOPES",
  authorizedAdvertisers: "TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS",
  updatedAt: "TIKTOK_BUSINESS_TOKEN_UPDATED_AT",
} as const;

const TOKEN_SECRET_NAMES = Object.values(TIKTOK_BUSINESS_SECRET_NAMES);

export function getTikTokBusinessEnvironmentSecrets(
  environment: Record<string, string | undefined> = process.env,
) {
  return Object.fromEntries(
    TOKEN_SECRET_NAMES.flatMap((name) => {
      const value = environment[name];
      return value === undefined ? [] : [[name, value]];
    }),
  ) as Record<string, string | undefined>;
}

export function isTikTokLocalEnvironmentAuthorization(
  environment: Record<string, string | undefined> = process.env,
) {
  return Boolean(environment[TIKTOK_BUSINESS_SECRET_NAMES.accessToken]?.trim());
}

export type TikTokBusinessAuthorizationContext = {
  accessToken: string;
  advertisers: TikTokAdvertiser[];
  grantedScopes: string[];
  updatedAt?: string;
};

export type TikTokBusinessTokenManagerDependencies = {
  readSecrets: (names: string[]) => Promise<Record<string, string | undefined>>;
  writeSecrets: (
    secrets: DopplerSecretValues,
    target?: { config: string; token?: string },
  ) => Promise<void>;
  now: () => number;
  primaryConfig?: string;
  mirrorTargets?: Array<{ config: string; token?: string }>;
};

export class TikTokBusinessAuthError extends Error {
  readonly code = "reauthorization_required" as const;

  constructor(message: string) {
    super(message);
    this.name = "TikTokBusinessAuthError";
  }
}

function defaultDependencies(): TikTokBusinessTokenManagerDependencies {
  const target = getDopplerTarget();
  const mirrorTargets = getTikTokBusinessMirrorTargets(target.config);
  const localEnvironmentAuthorization = isTikTokLocalEnvironmentAuthorization();
  return {
    readSecrets: async (names) => {
      const environmentValues = getTikTokBusinessEnvironmentSecrets();
      const missingNames = names.filter((name) => environmentValues[name] === undefined);
      const dopplerValues = missingNames.length > 0
        ? await dopplerGetSecrets({ names: missingNames, ...target })
        : {};
      return { ...dopplerValues, ...environmentValues };
    },
    writeSecrets: (secrets, destination) => {
      if (localEnvironmentAuthorization) {
        throw new Error(
          "Local TikTok authorization is read-only. Refresh ai-backend/dev, then run the local TikTok secret sync again.",
        );
      }
      return dopplerSetSecrets({
        secrets,
        project: target.project,
        config: destination?.config ?? target.config,
        token: destination?.token,
      });
    },
    now: Date.now,
    primaryConfig: target.config,
    mirrorTargets,
  };
}

function mirrorTokenEnvironmentName(config: string) {
  return `DOPPLER_${config.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_TOKEN`;
}

export function getTikTokBusinessMirrorTargets(primaryConfig: string) {
  const configs = (process.env.TIKTOK_BUSINESS_DOPPLER_MIRROR_CONFIGS ?? "")
    .split(/[,\s]+/)
    .map((config) => config.trim())
    .filter(Boolean)
    .filter((config, index, values) => config !== primaryConfig && values.indexOf(config) === index);

  return configs.map((config) => {
    const token = process.env[mirrorTokenEnvironmentName(config)]?.trim();
    if (process.env.DOPPLER_TOKEN && !token) {
      throw new Error(`Missing scoped Doppler token for mirror config: ${config}`);
    }
    return { config, token };
  });
}

function tokenSecrets(
  tokens: TikTokBusinessTokens,
  advertisers: TikTokAdvertiser[],
  now: number,
): DopplerSecretValues {
  return {
    [TIKTOK_BUSINESS_SECRET_NAMES.accessToken]: tokens.access_token,
    [TIKTOK_BUSINESS_SECRET_NAMES.grantedScopes]: JSON.stringify(tokens.scope),
    [TIKTOK_BUSINESS_SECRET_NAMES.authorizedAdvertisers]: JSON.stringify(advertisers),
    [TIKTOK_BUSINESS_SECRET_NAMES.updatedAt]: new Date(now).toISOString(),
  };
}

export async function saveTikTokBusinessAuthorization(
  tokens: TikTokBusinessTokens,
  advertisers: TikTokAdvertiser[],
  dependencies = defaultDependencies(),
) {
  const secrets = tokenSecrets(tokens, advertisers, dependencies.now());
  await dependencies.writeSecrets(secrets);
  for (const target of dependencies.mirrorTargets ?? []) {
    await dependencies.writeSecrets(secrets, target);
  }
  return [
    ...(dependencies.primaryConfig ? [dependencies.primaryConfig] : []),
    ...(dependencies.mirrorTargets ?? []).map((target) => target.config),
  ];
}

export async function getValidTikTokBusinessAccessToken(options?: {
  dependencies?: TikTokBusinessTokenManagerDependencies;
}) {
  return (await getTikTokBusinessAuthorizationContext(options)).accessToken;
}

function parseAuthorizedAdvertisers(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): TikTokAdvertiser[] => {
      if (!item || typeof item !== "object") return [];
      const advertiserId = "advertiser_id" in item ? item.advertiser_id : undefined;
      const advertiserName = "advertiser_name" in item ? item.advertiser_name : undefined;
      if (typeof advertiserId !== "string" || typeof advertiserName !== "string") return [];
      return [{ advertiser_id: advertiserId, advertiser_name: advertiserName }];
    });
  } catch {
    return [];
  }
}

function parseGrantedScopes(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((scope): scope is string | number => (
        typeof scope === "string" || typeof scope === "number"
      )).map(String)
      : [];
  } catch {
    return [];
  }
}

export async function getTikTokBusinessAuthorizationContext(options?: {
  dependencies?: TikTokBusinessTokenManagerDependencies;
}): Promise<TikTokBusinessAuthorizationContext> {
  const dependencies = options?.dependencies ?? defaultDependencies();
  const values = await dependencies.readSecrets(TOKEN_SECRET_NAMES);
  const accessToken = values[TIKTOK_BUSINESS_SECRET_NAMES.accessToken]?.trim();
  if (!accessToken) {
    throw new TikTokBusinessAuthError("TikTok advertiser authorization is missing or revoked");
  }
  const advertisers = parseAuthorizedAdvertisers(
    values[TIKTOK_BUSINESS_SECRET_NAMES.authorizedAdvertisers],
  );
  return {
    accessToken,
    advertisers,
    grantedScopes: parseGrantedScopes(values[TIKTOK_BUSINESS_SECRET_NAMES.grantedScopes]),
    updatedAt: values[TIKTOK_BUSINESS_SECRET_NAMES.updatedAt],
  };
}
