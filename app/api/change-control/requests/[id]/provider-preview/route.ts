import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { assertM03Operator, M03RepositoryError } from "@/lib/change-control/repository";
import { getM03ProviderPreview } from "@/lib/change-control/provider-action";
import { sanitizeM03ProviderPreviewForBrowser } from "@/lib/change-control/detail-response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await assertM03Operator(buildTrustedRequestContext(request, session));
    return NextResponse.json(sanitizeM03ProviderPreviewForBrowser(await getM03ProviderPreview((await params).id)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provider preview failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 });
  }
}
