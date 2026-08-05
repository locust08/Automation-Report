import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/session";
import { ManualRunnerOutputRepository } from "@/lib/search-term-optimization/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token || !(await verifyAuthToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || undefined;

  try {
    const repository = new ManualRunnerOutputRepository();
    return NextResponse.json(await repository.getDashboard(accountId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load search-term optimization data.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
