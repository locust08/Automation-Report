import { NextRequest, NextResponse } from "next/server";
import { publishChangeRequest } from "@/lib/ads-management/service";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Your role cannot publish Google Ads changes." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { completionMessage?: string };
    if (body.completionMessage && body.completionMessage.length > 5_000) return NextResponse.json({ error: "Completion message must be 5,000 characters or fewer." }, { status: 400 });
    return NextResponse.json(await publishChangeRequest((await params).id, sessionDisplayName(session), body.completionMessage));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing failed." }, { status: 400 });
  }
}
