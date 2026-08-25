import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { assertM03Operator, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ProviderActionSchema } from "@/lib/change-control/schema";
import { assertM03ProviderAction } from "@/lib/change-control/provider-action";
import { ProviderExecutionLockedError } from "@/lib/change-control/provider-adapters";

export async function lockedProviderAction(request: Request, params: Promise<{ id: string }>, action: string) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ProviderActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select the exact approved revision before this action." }, { status: 400 });
  try {
    const context = buildTrustedRequestContext(request, session);
    await assertM03Operator(context);
    await assertM03ProviderAction({ requestId: (await params).id, revisionId: parsed.data.revision_id, revisionHash: parsed.data.revision_hash, context });
    // The provider adapters intentionally have no production mutation transport in this release.
    throw new ProviderExecutionLockedError();
  } catch (error) {
    const status = error instanceof ProviderExecutionLockedError ? 423 : error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : `${action} failed.`, code: error instanceof ProviderExecutionLockedError ? error.code : undefined }, { status });
  }
}
