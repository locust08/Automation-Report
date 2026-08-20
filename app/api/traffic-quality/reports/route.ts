import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { generateVerifiedTrafficQualityReport } from "@/lib/traffic-quality/supabase-repository";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ changeSetId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A verified M03 change-set ID is required." }, { status: 400 });
  try {
    return NextResponse.json({ report: await generateVerifiedTrafficQualityReport({ changeSetId: parsed.data.changeSetId, actor: { id: session.sub, email: session.email } }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the report." }, { status: 409 });
  }
}
