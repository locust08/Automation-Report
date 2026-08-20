import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { listAgencyPlacementRisks } from "@/lib/traffic-quality/supabase-repository";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ risks: await listAgencyPlacementRisks() });
}
