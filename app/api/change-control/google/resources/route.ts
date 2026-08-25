import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, M03RepositoryError } from "@/lib/change-control/repository";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { discoverGoogleSynchronizedResources } from "@/lib/change-control/google-resource-discovery";

export const dynamic = "force-dynamic";
const querySchema = z.object({ account_identity: z.string().min(1).max(64), type: z.enum(["campaign", "ad_group", "ad"]), parent_identity: z.string().max(128).optional(), search: z.string().max(120).optional() });

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Google resource query.", issues: parsed.error.issues }, { status: 400 });
  try {
    await assertM03Operator(buildTrustedRequestContext(request, session));
    return NextResponse.json(await discoverGoogleSynchronizedResources({ accountIdentity: parsed.data.account_identity, type: parsed.data.type, parentIdentity: parsed.data.parent_identity, search: parsed.data.search }));
  } catch (error) {
    const status = error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load synchronized Google resources." }, { status });
  }
}
