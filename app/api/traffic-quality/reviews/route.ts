import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { REVIEW_ACTIONS } from "@/lib/traffic-quality/decision-service";
import { trafficQualityDecisionService } from "@/lib/traffic-quality/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  recommendationId: z.string().uuid(),
  accountId: z.string().regex(/^\d{10}$/),
  itemType: z.enum(["search_term", "placement", "url", "account", "other"]).optional(),
  action: z.enum(REVIEW_ACTIONS),
  comment: z.string().trim().max(2_000).optional(),
});

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pms", "specialist", "co", "approver", "tl", "pm", "admin"].includes(session.role)) return NextResponse.json({ error: "Your role cannot review traffic-quality recommendations." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid recommendation, account, action, and comment are required." }, { status: 400 });
  try {
    return NextResponse.json(await trafficQualityDecisionService.review({ ...parsed.data, actor: { id: session.sub, email: session.email, role: session.role } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the decision." }, { status: 409 });
  }
}
