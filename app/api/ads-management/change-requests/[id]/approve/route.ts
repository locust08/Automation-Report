import { NextRequest, NextResponse } from "next/server";
import { approveChangeRequest } from "@/lib/ads-management/service";
import { authSessionFromRequest, sessionDisplayName } from "@/lib/auth/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!["approver", "tl", "admin"].includes(session.role)) return NextResponse.json({ error: "Your role cannot approve Google Ads changes." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { comment?: string };
    if (body.comment && body.comment.length > 2_000) return NextResponse.json({ error: "Approval comment must be 2,000 characters or fewer." }, { status: 400 });
    return NextResponse.json(await approveChangeRequest((await params).id, sessionDisplayName(session), session.sub, body.comment));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 400 });
  }
}
