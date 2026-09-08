import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { exclusionCapMutationSchema } from "@/lib/workflow-settings/exclusion-cap";
import { getExclusionCap, saveExclusionCap } from "@/lib/workflow-settings/exclusion-cap-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ setting: await getExclusionCap() });
  } catch {
    return NextResponse.json({ error: "Unable to load the shared exclusion cap." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = exclusionCapMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number from 0 to 2147483647. Use 0 for no limit." }, { status: 400 });
  try {
    return NextResponse.json({ setting: await saveExclusionCap(parsed.data, session.fullName?.trim() || session.email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the exclusion cap." }, { status: 409 });
  }
}
