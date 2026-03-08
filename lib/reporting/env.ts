interface Credentials {
  metaAccessToken: string;
  googleDeveloperToken: string;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleLoginCustomerId: string | null;
  googleAdsApiVersion: string;
  companyName: string;
  companyNameMap: Record<string, string>;
}

function sanitizeSecret(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || null;
  }

  return trimmed;
}

function resolveEnvValue(name: string): string | undefined {
  const direct = process.env[name];
  if (direct !== undefined) {
    return direct;
  }

  const normalized = name.toUpperCase();
  const fallbackKey = Object.keys(process.env).find((key) => key.toUpperCase() === normalized);
  return fallbackKey ? process.env[fallbackKey] : undefined;
}

function buildCandidateNames(names: string[]): string[] {
  return Array.from(
    new Set(
      names.flatMap((name) => (name.startsWith("DOPPLER_") ? [name] : [name, `DOPPLER_${name}`]))
    )
  );
}

function getDopplerHint(): string {
  return process.env.DOPPLER_CONFIG || process.env.DOPPLER_ENVIRONMENT
    ? "Doppler runtime detected but required secret is missing."
    : "Doppler runtime not detected. Run via `doppler run -- <command>` or inject env vars in deployment.";
}

function readSecret(names: string[], required = true): string | null {
  const candidateNames = buildCandidateNames(names);
  const value = candidateNames
    .map((name) => resolveEnvValue(name))
    .map((item) => sanitizeSecret(item))
    .find((item): item is string => Boolean(item));

  if (value) {
    return value;
  }

  if (!required) {
    return null;
  }

  throw new Error(`Missing credential (${candidateNames.join(" | ")}). ${getDopplerHint()}`);
}

export function getCredentials(): Credentials {
  const googleAccessToken = readSecret(
    ["GOOGLE_ADS_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_WORKSPACE_OAUTH_ACCESS_TOKEN"],
    false
  );
  const googleRefreshToken = readSecret(
    ["GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN"],
    false
  );
  const googleClientId = readSecret(["GOOGLE_ADS_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"], false);
  const googleClientSecret = readSecret(
    ["GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"],
    false
  );

  if (!googleAccessToken && !(googleRefreshToken && googleClientId && googleClientSecret)) {
    throw new Error(
      `Missing Google Ads OAuth credentials. Provide GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or configure GOOGLE_OAUTH_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET. ${getDopplerHint()}`
    );
  }

  const googleLoginCustomerIdRaw = readSecret(["GOOGLE_ADS_LOGIN_CUSTOMER_ID"], false);
  const googleLoginCustomerId = normalizeOptionalGoogleCustomerId(googleLoginCustomerIdRaw);
  const googleAdsApiVersion = normalizeGoogleAdsApiVersion(
    readSecret(["GOOGLE_ADS_API_VERSION"], false)
  );

  return {
    metaAccessToken: readSecret(["META_ACCESS_TOKEN"])!,
    googleDeveloperToken: readSecret(["GOOGLE_ADS_DEVELOPER_TOKEN"])!,
    googleAccessToken,
    googleRefreshToken,
    googleClientId,
    googleClientSecret,
    googleLoginCustomerId,
    googleAdsApiVersion,
    companyName: readSecret(["REPORT_COMPANY_NAME"], false) ?? "Company Name",
    companyNameMap: parseCompanyNameMap(readSecret(["REPORT_COMPANY_NAME_MAP"], false)),
  };
}

export function normalizeGoogleAccountId(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeMetaAccountId(value: string): string {
  return value.replace(/\D/g, "");
}

export function resolveCompanyNameFromAccountId(input: {
  companyName: string;
  companyNameMap: Record<string, string>;
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
}, options?: { fallback?: boolean }): string | null {
  const candidateIds = [input.metaAccountId, input.googleAccountId, input.accountId]
    .map((value) => normalizeOptionalGoogleCustomerId(value))
    .filter((value): value is string => Boolean(value));

  for (const accountId of candidateIds) {
    const mapped = input.companyNameMap[accountId];
    if (mapped) {
      return mapped;
    }
  }

  if (options?.fallback === false) {
    return null;
  }

  const firstId = candidateIds[0];
  if (firstId) {
    return `Account ${firstId}`;
  }

  return input.companyName;
}

function normalizeOptionalGoogleCustomerId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\D/g, "");
  return normalized || null;
}

function normalizeGoogleAdsApiVersion(value: string | null): string {
  if (!value) {
    return "v22";
  }

  const trimmed = value.trim().toLowerCase();
  if (/^v\d+$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return `v${trimmed}`;
  }
  return "v22";
}

function parseCompanyNameMap(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = normalizeOptionalGoogleCustomerId(key);
      if (normalizedKey && typeof value === "string" && value.trim()) {
        acc[normalizedKey] = value.trim();
      }
      return acc;
    }, {});
  } catch {
    return raw
      .split(",")
      .map((segment) => segment.trim())
      .reduce<Record<string, string>>((acc, pair) => {
        const separator = pair.indexOf(":");
        if (separator <= 0) {
          return acc;
        }
        const key = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        const normalizedKey = normalizeOptionalGoogleCustomerId(key);
        if (normalizedKey && value) {
          acc[normalizedKey] = value;
        }
        return acc;
      }, {});
  }
}
