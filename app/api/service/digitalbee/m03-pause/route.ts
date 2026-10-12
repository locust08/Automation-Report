import { mcpPauseService } from "@/lib/change-control/mcp-pause-service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) { return mcpPauseService(request); }
