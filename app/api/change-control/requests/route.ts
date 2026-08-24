import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { createMockChangeRequest, listMockChangeRequests, M03RepositoryError } from "@/lib/change-control/repository";
import { m03MockChangeRequestSchema } from "@/lib/change-control/schema";

export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ requests: await listMockChangeRequests(), provider_execution_locked: true }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = m03MockChangeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mock change request.", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await createMockChangeRequest(parsed.data, { id: session.sub, name: session.fullName || session.email || "Administrator" }), { status: 201 }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError ? error.status : 500 }); }
