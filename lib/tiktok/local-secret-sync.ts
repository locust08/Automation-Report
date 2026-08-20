const DOPPLER_SECRETS_URL = "https://api.doppler.com/v3/configs/config/secrets";
const BLOCK_START = "# BEGIN LOCAL TIKTOK BUSINESS SECRETS";
const BLOCK_END = "# END LOCAL TIKTOK BUSINESS SECRETS";

export const TIKTOK_LOCAL_SECRET_NAMES = [
  "TIKTOK_BUSINESS_APP_ID",
  "TIKTOK_BUSINESS_APP_SECRET",
  "TIKTOK_BUSINESS_REDIRECT_URI",
  "TIKTOK_BUSINESS_OAUTH_SCOPES",
  "TIKTOK_BUSINESS_ACCESS_TOKEN",
  "TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS",
  "TIKTOK_BUSINESS_GRANTED_SCOPES",
  "TIKTOK_BUSINESS_TOKEN_UPDATED_AT",
  "TIKTOK_BUSINESS_RATE_LIMIT_LEVEL",
  "TIKTOK_BUSINESS_MAX_QPS",
  "TIKTOK_BUSINESS_MAX_QPM",
  "TIKTOK_BUSINESS_MAX_CONCURRENCY",
] as const;

type TikTokLocalSecretName = (typeof TIKTOK_LOCAL_SECRET_NAMES)[number];
export type TikTokLocalSecrets = Partial<Record<TikTokLocalSecretName, string>>;

const REQUIRED_REPORTING_SECRET_NAMES: TikTokLocalSecretName[] = [
  "TIKTOK_BUSINESS_ACCESS_TOKEN",
  "TIKTOK_BUSINESS_RATE_LIMIT_LEVEL",
  "TIKTOK_BUSINESS_MAX_QPS",
  "TIKTOK_BUSINESS_MAX_QPM",
  "TIKTOK_BUSINESS_MAX_CONCURRENCY",
];

function secretValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const entry = value as { computed?: unknown; raw?: unknown };
  if (typeof entry.computed === "string") return entry.computed;
  return typeof entry.raw === "string" ? entry.raw : undefined;
}

export async function fetchTikTokSecretsFromDoppler(input: {
  token: string;
  project?: string;
  config?: string;
  fetchFn?: typeof fetch;
}): Promise<TikTokLocalSecrets> {
  const token = input.token.trim();
  if (!token) throw new Error("A scoped Doppler service token is required.");
  const url = new URL(DOPPLER_SECRETS_URL);
  url.searchParams.set("project", input.project ?? "ai-backend");
  url.searchParams.set("config", input.config ?? "dev");
  url.searchParams.set("secrets", TIKTOK_LOCAL_SECRET_NAMES.join(","));
  const response = await (input.fetchFn ?? fetch)(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Unable to read the TikTok secret bundle from Doppler (${response.status}).`);
  }
  const body = await response.json() as { secrets?: Record<string, unknown> };
  const values: TikTokLocalSecrets = {};
  for (const name of TIKTOK_LOCAL_SECRET_NAMES) {
    const value = secretValue(body.secrets?.[name]);
    if (value !== undefined) values[name] = value;
  }
  const missing = REQUIRED_REPORTING_SECRET_NAMES.filter((name) => !values[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Doppler is missing required TikTok secrets: ${missing.join(", ")}`);
  }
  return values;
}

export function mergeTikTokSecretsIntoEnv(existing: string, secrets: TikTokLocalSecrets): string {
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const managedBlock = [
    BLOCK_START,
    ...TIKTOK_LOCAL_SECRET_NAMES.flatMap((name) => {
      const value = secrets[name];
      return value === undefined ? [] : [`${name}=${JSON.stringify(value)}`];
    }),
    BLOCK_END,
  ].join(newline);
  const escapedStart = BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\r?\\n?`, "g");
  const preserved = existing.replace(blockPattern, "").replace(/\s+$/, "");
  return `${preserved ? `${preserved}${newline}${newline}` : ""}${managedBlock}${newline}`;
}
