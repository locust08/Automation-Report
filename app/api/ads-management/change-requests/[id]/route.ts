import { NextRequest, NextResponse } from "next/server";
import { getChangeSet } from "@/lib/ads-management/supabase";
import { movedToM03Response } from "@/lib/ads-management/moved-to-m03";
import { authSessionFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json(await getChangeSet((await params).id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Change request failed." }, { status: 404 });
  }
}

export async function PATCH() {
  return movedToM03Response();
}
