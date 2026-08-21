import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "user") {
    return NextResponse.json({ error: "Campaign access is required." }, { status: 403 });
  }
  return NextResponse.json({
    error: "M04 Stage 2 stores local drafts only. Approval, build, Gate, handoff, and launch actions are disabled.",
  }, { status: 409 });
}
