import { mcpPauseService, type McpPauseDependencies } from "../../../lib/change-control/mcp-pause-service";
import { m03PauseEnvironment } from "../../../lib/change-control/mcp-pause-environment";
import { withM03RuntimeEnvironment } from "../../../lib/change-control/runtime-environment";
import { observeWorker, captureUnexpected, type ObservabilityEnv } from "./observability";

export type Env = Record<string, unknown> & ObservabilityEnv & {
  M03_CANONICAL_ORIGIN?: string;
  M03_WORKER_ENABLED?: string;
  DIGITALBEE_AUTHORITY?: { fetch: typeof fetch };
};
const reply = (outcome: string, status: number) => Response.json({ outcome, correlation_id: crypto.randomUUID() }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

// Dependency injection is only a local test seam; the published entry uses the
// existing Supabase repository, provider transports and durable execution store.
export async function handle(request: Request, bindings: Env, deps?: McpPauseDependencies): Promise<Response> {
  const path = new URL(request.url);
  if (path.pathname !== "/api/service/digitalbee/m03-pause" || path.search) return reply("unavailable", 404);
  if (request.method !== "POST") return reply("unavailable", 405);
  if (bindings.M03_WORKER_ENABLED !== "true") return reply("locked", 503);
  try {
    const origin = new URL(String(bindings.M03_CANONICAL_ORIGIN ?? ""));
    if (origin.protocol !== "https:" || origin.origin !== bindings.M03_CANONICAL_ORIGIN || !bindings.DIGITALBEE_AUTHORITY) return reply("locked", 503);
    const strings = Object.fromEntries(Object.entries(bindings).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const env = await m03PauseEnvironment({ ...strings, NODE_ENV: "production", DEV_AUTH_BYPASS: "false", VERCEL: undefined, VERCEL_ENV: undefined });
    return await withM03RuntimeEnvironment(env, () => mcpPauseService(request, deps, env, {
      canonicalOrigin: origin.origin,
      requireSignedNetwork: true,
      grantFetch: (input, init) => bindings.DIGITALBEE_AUTHORITY!.fetch(input, init),
      onUnexpected: (error, correlationId) => captureUnexpected(error, 'changes.adapter', {correlationId}),
    }));
  } catch (error) {
    captureUnexpected(error, 'changes.adapter');
    // Credential/bootstrap failures contain no provider payload or secret value.
    return reply("locked", 503);
  }
}
const worker = { fetch: (request: Request, env: Env) => handle(request, env) };
export default observeWorker('m03', worker);
