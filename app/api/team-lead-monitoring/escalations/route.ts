import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { createEscalation, listActiveEscalations, resolveEscalation } from "@/lib/team-lead-monitoring/sqlite-repository";
import type { MonitoringModule } from "@/lib/team-lead-monitoring/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MODULES = new Set<MonitoringModule>(["search_term", "placement"]);

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const sourceModule = url.searchParams.get("module") as MonitoringModule;
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  if (!MODULES.has(sourceModule) || !accountId) return NextResponse.json({ error: "Module and account are required." }, { status: 400 });
  try { return NextResponse.json({ escalations: listActiveEscalations({ module: sourceModule, accountId }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load escalations." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tl", "admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Team Lead access is required." }, { status: 403 });
  const body = await request.json() as { module?: unknown; sourceId?: unknown; accountId?: unknown; note?: unknown };
  const sourceModule = body.module as MonitoringModule;
  const sourceId = Number(body.sourceId);
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!MODULES.has(sourceModule) || !Number.isSafeInteger(sourceId) || sourceId < 1 || !accountId || !note) {
    return NextResponse.json({ error: "Module, source record, account, and escalation note are required." }, { status: 400 });
  }
  try { return NextResponse.json(createEscalation({ module: sourceModule, sourceId, accountId, note, actor: { id: session.sub, email: session.email } })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to escalate this record." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tl", "admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Team Lead access is required." }, { status: 403 });
  const body = await request.json() as { escalationId?: unknown };
  const id = Number(body.escalationId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "A valid escalation ID is required." }, { status: 400 });
  try { return NextResponse.json(resolveEscalation({ id, actor: { id: session.sub, email: session.email } })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to resolve this escalation." }, { status: 500 }); }
}
