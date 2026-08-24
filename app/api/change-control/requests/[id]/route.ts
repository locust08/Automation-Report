import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await getMockChangeRequest((await params).id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError ? error.status : 500 }); }
}
