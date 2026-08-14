import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    user: { id: session.sub, email: session.email, fullName: session.fullName, role: session.role },
  });
}
