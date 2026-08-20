import { NextRequest, NextResponse } from "next/server";
import { retryFailedChangeRequestItems } from "@/lib/ads-management/service";
import { canEditAds } from "@/lib/auth/permissions";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!canEditAds(session.role)) return NextResponse.json({ error: "Your role cannot retry failed Google Ads changes." }, { status: 403 });
    return NextResponse.json(await retryFailedChangeRequestItems((await params).id, sessionDisplayName(session)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish retry failed." }, { status: 400 });
  }
}
