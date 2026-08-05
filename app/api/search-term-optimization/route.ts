import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { ManualRunnerOutputRepository } from "@/lib/search-term-optimization/repository";
import { persistDashboardToSqlite } from "@/lib/search-term-optimization/sqlite-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedAccountId = new URL(request.url).searchParams.get("accountId")?.trim() || undefined;
  const accountId = session.role === "admin" ? requestedAccountId : undefined;

  try {
    const repository = new ManualRunnerOutputRepository();
    const dashboard = await repository.getDashboard(accountId);
    return NextResponse.json(persistDashboardToSqlite(dashboard));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load search-term optimization data.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
