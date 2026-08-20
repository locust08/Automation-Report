import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getTrafficQualityPolicy, upsertTrafficQualityPolicy } from "@/lib/traffic-quality/supabase-repository";

const accountIdSchema = z.string().regex(/^\d{10}$/);
const policySchema = z.object({ accountId: accountIdSchema, spendThreshold: z.number().positive(), clicksThreshold: z.number().int().positive(), invalidLeadsThreshold: z.number().int().positive(), complaintsThreshold: z.number().int().positive(), recencyDays: z.number().int().positive(), crossCampaignThreshold: z.number().int().positive(), crossClientThreshold: z.number().int().positive() });

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = accountIdSchema.safeParse(new URL(request.url).searchParams.get("accountId"));
  if (!accountId.success) return NextResponse.json({ error: "A valid Google Ads account is required." }, { status: 400 });
  return NextResponse.json({ policy: await getTrafficQualityPolicy(accountId.data) });
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tl", "approver", "admin"].includes(session.role)) return NextResponse.json({ error: "Only a team lead or administrator can update account policy." }, { status: 403 });
  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "All positive policy thresholds are required." }, { status: 400 });
  const { accountId, ...thresholds } = parsed.data;
  return NextResponse.json({ policy: await upsertTrafficQualityPolicy(accountId, thresholds, { id: session.sub, email: session.email }) });
}
