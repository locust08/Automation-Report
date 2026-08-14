import { NextResponse } from "next/server";

import { isAdminRole, isAuthRole } from "@/lib/auth/roles";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { updateManagedUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { userId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (userId === session.sub && (body.isActive === false || (body.role !== undefined && !isAdminRole(body.role)))) {
      return NextResponse.json({ error: "You cannot remove your own administrator access." }, { status: 400 });
    }
    const changes: { fullName?: string; role?: import("@/lib/auth/roles").AuthRole; isActive?: boolean; password?: string } = {};
    if (typeof body.fullName === "string") {
      const fullName = body.fullName.trim();
      if (!fullName) return NextResponse.json({ error: "Full name cannot be empty." }, { status: 400 });
      changes.fullName = fullName;
    }
    if (body.role !== undefined) {
      if (!isAuthRole(body.role)) return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
      changes.role = body.role;
    }
    if (typeof body.isActive === "boolean") changes.isActive = body.isActive;
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
      changes.password = body.password;
    }
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: "No supported changes were supplied." }, { status: 400 });
    const user = await updateManagedUser(userId, changes);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update user." }, { status: 400 });
  }
}
