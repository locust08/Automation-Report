// Fetch only this service's credentials through the existing server Doppler identity.
// Never copy them to browser-readable configuration or mutate global process.env.
export async function m03PauseEnvironment(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  if (env.M03_PAUSE_MCP_ENABLED !== "true" || env.M03_PAUSE_MCP_CREDENTIAL_SOURCE !== "doppler") return env;
  const project = env.M03_PAUSE_MCP_SECRET_PROJECT, config = env.M03_PAUSE_MCP_SECRET_CONFIG;
  if (!project || !config || !env.DOPPLER_TOKEN) throw Error("pause_credentials_unavailable");
  const names = ["M03_PAUSE_MCP_SERVICE_TOKEN", "M03_PAUSE_MCP_DELEGATION_KEY", "DIGITALBEE_GRANT_VERIFY_TOKEN"];
  const url = new URL("https://api.doppler.com/v3/configs/config/secrets");
  url.searchParams.set("project", project); url.searchParams.set("config", config); url.searchParams.set("secrets", names.join(","));
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${env.DOPPLER_TOKEN}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) { await response.body?.cancel(); throw Error("pause_credentials_unavailable"); }
  const values = await response.json(); const scoped = { ...env };
  for (const name of names) {
    const record = values.secrets?.[name];
    const value = typeof record === "string" ? record : record?.computed ?? record?.raw;
    if (typeof value !== "string" || value.length < 32) throw Error("pause_credentials_unavailable");
    scoped[name] = value;
  }
  return scoped;
}
