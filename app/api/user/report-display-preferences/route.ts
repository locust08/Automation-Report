import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { reportingPreferences } from "@/lib/reporting/display-preferences-repository";
export const dynamic = "force-dynamic";
const patchSchema = z.object({ overall: z.boolean().optional(), campaign: z.boolean().optional(), advanced: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ preferences: await reportingPreferences(session.sub) }); }
  catch { return NextResponse.json({ error: "Unable to load report display preferences." }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide recognized page keys with boolean values." }, { status: 400 });
  try { return NextResponse.json({ preferences: await reportingPreferences(session.sub, parsed.data) }); }
  catch { return NextResponse.json({ error: "Unable to save report display preferences." }, { status: 503 }); }
}
