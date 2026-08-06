import { NextResponse } from "next/server";
import { retryChangeRequestVerification } from "@/lib/ads-management/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as { actorName?: string };
    return NextResponse.json(await retryChangeRequestVerification((await params).id, body.actorName || ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification retry failed." }, { status: 400 });
  }
}
