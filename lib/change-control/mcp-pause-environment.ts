import { m03BoundedText } from "./bounded-response";
import { PauseBootstrapError } from "./pause-bootstrap-diagnostic";
// Fetch only this service's credentials through the existing server Doppler identity.
// Never copy them to browser-readable configuration or mutate global process.env.
export async function m03PauseEnvironment(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return { ...env, M03_PAUSE_MCP_ENABLED: "false" };
  if (env.VERCEL_ENV === "production" && env.M03_PAUSE_MCP_ENABLED === "true" && env.M03_PAUSE_MCP_CREDENTIAL_SOURCE !== "doppler") throw new PauseBootstrapError("credential_configuration", "invalid_configuration");
  if (env.M03_PAUSE_MCP_ENABLED !== "true" || env.M03_PAUSE_MCP_CREDENTIAL_SOURCE !== "doppler") return env;
  const project = env.M03_PAUSE_MCP_SECRET_PROJECT, config = env.M03_PAUSE_MCP_SECRET_CONFIG;
  const token = env.M03_PAUSE_MCP_DOPPLER_TOKEN || env.DOPPLER_TOKEN;
  if (!project || !config || !token) throw new PauseBootstrapError("credential_configuration", "missing_configuration");
  const required = ["M03_PAUSE_MCP_SERVICE_TOKEN", "M03_PAUSE_MCP_DELEGATION_KEY", "DIGITALBEE_GRANT_VERIFY_TOKEN"];
  const provider = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_API_VERSION", "GOOGLE_ADS_CLOUD_PROJECT_ID", "GOOGLE_ADS_CLOUD_PROJECT_NUMBER", "GOOGLE_ADS_CLOUD_PROJECT_NAME", "GOOGLE_ADS_PROJECT_ACCESS_LEVEL", "NOTION_TOKEN", "NOTION_AD_ACCOUNTS_DATABASE_ID"];
  const names = [...required, ...provider];
  const url = new URL("https://api.doppler.com/v3/configs/config/secrets");
  url.searchParams.set("project", project); url.searchParams.set("config", config); url.searchParams.set("secrets", names.join(","));
  const signal = AbortSignal.timeout(5000);
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "manual", signal });
  } catch (error) {
    throw new PauseBootstrapError("credential_fetch", signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network");
  }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* Preserve the known HTTP failure. */ }
    throw new PauseBootstrapError("credential_fetch", response.status === 401 ? "authentication" : response.status === 403 ? "permission" : "upstream_http", response.status);
  }
  let text: string;
  try { text = await m03BoundedText(response, 65536); }
  catch (error) {
    const reason = signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : error instanceof Error && error.message === "response_too_large" ? "response_size" : "network";
    throw new PauseBootstrapError("credential_response", reason, response.status);
  }
  let values: unknown;
  try { values = JSON.parse(text); }
  catch { throw new PauseBootstrapError("credential_response", "response_json", response.status); }
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(values) || !object(values.secrets)) throw new PauseBootstrapError("credential_response", "response_shape", response.status);
  const scoped = { ...env };
  for (const name of names) {
    const record = Object.hasOwn(values.secrets, name) ? values.secrets[name] : undefined;
    const value = typeof record === "string" ? record : object(record) ? record.computed ?? record.raw : undefined;
    if (required.includes(name) && (typeof value !== "string" || value.length < 32)) throw new PauseBootstrapError("credential_records", record === undefined ? "required_record_missing" : "required_record_malformed", response.status);
    if (typeof value === "string") scoped[name] = value;
  }
  return scoped;
}
