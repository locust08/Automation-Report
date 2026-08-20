import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { trafficQualityDecisionService } from "@/lib/traffic-quality/service";

const schema = z.object({ accountId: z.string().regex(/^\d{10}$/), accountName: z.string().trim().min(1).max(200), recommendationIds: z.array(z.string().uuid()).min(1).max(100) });

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["specialist", "co", "approver", "tl", "admin"].includes(session.role)) return NextResponse.json({ error: "Your role cannot create M03 drafts." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Valid account details and recommendation IDs are required." }, { status: 400 });
  try {
    return NextResponse.json(await trafficQualityDecisionService.createChangeSet({ ...parsed.data, actor: { id: session.sub, email: session.email, role: session.role } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the M03 draft." }, { status: 409 });
  }
}
