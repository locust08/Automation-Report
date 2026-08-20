import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DOPPLER_API_HOST = "https://api.doppler.com";

export type DopplerSecretValues = Record<string, string>;

export function getDopplerTarget() {
  const project = process.env.DOPPLER_PROJECT;
  const config = process.env.DOPPLER_CONFIG;
  if (!project || !config) {
    throw new Error(
      "Missing DOPPLER_PROJECT/DOPPLER_CONFIG in runtime. Run with `doppler run -- ...` or provide these env vars in Docker.",
    );
  }
  return { project, config };
}

async function dopplerSetSecretsViaApi(params: {
  secrets: DopplerSecretValues;
  project: string;
  config: string;
  token: string;
}) {
  const url = new URL("/v3/configs/config/secrets", DOPPLER_API_HOST);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      project: params.project,
      config: params.config,
      secrets: params.secrets,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to set Doppler secrets (${res.status})`);
  }
}

async function dopplerGetSecretsViaApi(params: {
  names: string[];
  project: string;
  config: string;
  token: string;
}) {
  const url = new URL("/v3/configs/config/secrets", DOPPLER_API_HOST);
  url.searchParams.set("project", params.project);
  url.searchParams.set("config", params.config);
  url.searchParams.set("secrets", params.names.join(","));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to read Doppler secrets (${res.status})`);
  }

  const json = (await res.json()) as {
    secrets?: Record<string, string | { raw?: unknown; computed?: unknown }>;
  };
  const values: Record<string, string | undefined> = {};
  for (const name of params.names) {
    const secret = json.secrets?.[name];
    if (typeof secret === "string") {
      values[name] = secret;
      continue;
    }
    if (secret && typeof secret.computed === "string") {
      values[name] = secret.computed;
      continue;
    }
    if (secret && typeof secret.raw === "string") {
      values[name] = secret.raw;
    }
  }
  return values;
}

export async function dopplerGetSecrets(params: {
  names: string[];
  project: string;
  config: string;
  token?: string;
}) {
  const token = params.token ?? process.env.DOPPLER_TOKEN;
  if (token) {
    return dopplerGetSecretsViaApi({ ...params, token });
  }

  const values: Record<string, string | undefined> = {};
  for (const name of params.names) {
    try {
      const { stdout } = await execFileAsync(
        "doppler",
        [
          "secrets",
          "get",
          name,
          "--plain",
          "--project",
          params.project,
          "--config",
          params.config,
        ],
        { timeout: 60_000 },
      );
      values[name] = stdout.trim();
    } catch {
      values[name] = undefined;
    }
  }
  return values;
}

export async function dopplerSetSecrets(params: {
  secrets: DopplerSecretValues;
  project: string;
  config: string;
  token?: string;
}) {
  const token = params.token ?? process.env.DOPPLER_TOKEN;
  if (token) {
    await dopplerSetSecretsViaApi({ ...params, token });
    return;
  }

  const assignments = Object.entries(params.secrets).map(
    ([name, value]) => `${name}=${value}`,
  );
  if (assignments.length === 0) return;

  await execFileAsync(
    "doppler",
    [
      "secrets",
      "set",
      ...assignments,
      "--silent",
      "--project",
      params.project,
      "--config",
      params.config,
    ],
    { timeout: 60_000 },
  );
}

export async function dopplerSetSecret(params: {
  name: string;
  value: string;
  project: string;
  config: string;
}) {
  await dopplerSetSecrets({
    secrets: { [params.name]: params.value },
    project: params.project,
    config: params.config,
  });
}


