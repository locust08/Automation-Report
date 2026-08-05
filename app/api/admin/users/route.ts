import { NextResponse } from "next/server";

import { isAdminRole, isAuthRole } from "@/lib/auth/roles";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { createManagedUser, listManagedUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ users: await listManagedUsers() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retrieve users." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
    if (!isAuthRole(body.role)) return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
    const user = await createManagedUser({
      email,
      fullName,
      password,
      role: body.role,
      isActive: body.isActive !== false,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create user." }, { status: 400 });
  }
}
