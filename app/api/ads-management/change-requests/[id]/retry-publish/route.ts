import { NextRequest, NextResponse } from "next/server";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Only administrators can retry Google Ads changes." }, { status: 403 });
    await params;
    return NextResponse.json({ error: "provider_execution_locked", message: "Provider retries are disabled until the future provider-integration phase." }, { status: 423 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish retry failed." }, { status: 400 });
  }
}
