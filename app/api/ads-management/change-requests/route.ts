import { NextRequest, NextResponse } from "next/server";
import { listAccountChangeSets, listEditableAccountChangeSets } from "@/lib/ads-management/supabase";
import { movedToM03Response } from "@/lib/ads-management/moved-to-m03";
import { authSessionFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const searchParams = new URL(request.url).searchParams;
    const accountId = searchParams.get("accountId")?.trim() || "";
    if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });
    const requests = searchParams.get("editable") === "true" ? await listEditableAccountChangeSets(accountId, session.sub) : await listAccountChangeSets(accountId);
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow request failed." }, { status: 500 });
  }
}

export async function POST() {
  return movedToM03Response();
}
