import { mcpPauseService } from "@/lib/change-control/mcp-pause-service";
import { m03PauseEnvironment } from "@/lib/change-control/mcp-pause-environment";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  let env;
  try { env = await m03PauseEnvironment(); }
  catch { return Response.json({ outcome: "locked", blocker: "pause_credentials_unavailable", correlation_id: crypto.randomUUID() }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  return mcpPauseService(request, undefined, env);
}
