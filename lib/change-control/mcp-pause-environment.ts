import { m03BoundedText } from "./bounded-response";
// Fetch only this service's credentials through the existing server Doppler identity.
// Never copy them to browser-readable configuration or mutate global process.env.
export async function m03PauseEnvironment(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return { ...env, M03_PAUSE_MCP_ENABLED: "false" };
  if (env.VERCEL_ENV === "production" && env.M03_PAUSE_MCP_ENABLED === "true" && env.M03_PAUSE_MCP_CREDENTIAL_SOURCE !== "doppler") throw Error("pause_credentials_unavailable");
  if (env.M03_PAUSE_MCP_ENABLED !== "true" || env.M03_PAUSE_MCP_CREDENTIAL_SOURCE !== "doppler") return env;
  const project = env.M03_PAUSE_MCP_SECRET_PROJECT, config = env.M03_PAUSE_MCP_SECRET_CONFIG;
  const token = env.M03_PAUSE_MCP_DOPPLER_TOKEN || env.DOPPLER_TOKEN;
  if (!project || !config || !token) throw Error("pause_credentials_unavailable");
  const required = ["M03_PAUSE_MCP_SERVICE_TOKEN", "M03_PAUSE_MCP_DELEGATION_KEY", "DIGITALBEE_GRANT_VERIFY_TOKEN"];
  const provider = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_API_VERSION", "GOOGLE_ADS_CLOUD_PROJECT_ID", "GOOGLE_ADS_CLOUD_PROJECT_NUMBER", "GOOGLE_ADS_CLOUD_PROJECT_NAME", "GOOGLE_ADS_PROJECT_ACCESS_LEVEL", "NOTION_TOKEN", "NOTION_AD_ACCOUNTS_DATABASE_ID"];
  const names = [...required, ...provider];
  const url = new URL("https://api.doppler.com/v3/configs/config/secrets");
  url.searchParams.set("project", project); url.searchParams.set("config", config); url.searchParams.set("secrets", names.join(","));
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000) });
  if (!response.ok) { await response.body?.cancel(); throw Error("pause_credentials_unavailable"); }
  const values = JSON.parse(await m03BoundedText(response, 65536)); const scoped = { ...env };
  for (const name of names) {
    const record = values.secrets?.[name];
    const value = typeof record === "string" ? record : record?.computed ?? record?.raw;
    if (required.includes(name) && (typeof value !== "string" || value.length < 32)) throw Error("pause_credentials_unavailable");
    if (typeof value === "string") scoped[name] = value;
  }
  return scoped;
}
