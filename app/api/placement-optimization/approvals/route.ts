import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "Placement exclusions are now published directly after confirmation; a separate approval record is no longer stored." }, { status: 410 });
}
