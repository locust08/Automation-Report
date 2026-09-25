import { NextResponse } from "next/server";
import { digitalBeeM03EnvelopeSchema, DigitalBeeM03Error, executeDigitalBeeM03Review } from "@/lib/change-control/digitalbee-review";
import { authenticateDigitalBeeRequest, DigitalBeeServiceError, readBoundedJson, requestHash, verifyCurrentDigitalBeeGrant } from "@/lib/digitalbee/service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readBoundedJson(request, 64 * 1024); }
  catch (error) {
    return NextResponse.json({ error: { code: "unsupported_change" } }, { status: error instanceof DigitalBeeServiceError ? error.status : 400 });
  }
  const parsed = digitalBeeM03EnvelopeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "unsupported_change" } }, { status: 400 });
  try {
    const scope = await authenticateDigitalBeeRequest(request, {
      serviceToken: process.env.M03_REVIEW_SERVICE_TOKEN,
      delegationKey: process.env.M03_REVIEW_DELEGATION_KEY,
      connectionRevision: process.env.M03_REVIEW_CONNECTION_REVISION,
      action: parsed.data.action, hash: requestHash(body),
    });
    const grant = await verifyCurrentDigitalBeeGrant(scope, parsed.data.action, {
      url: process.env.DIGITALBEE_GRANT_VERIFY_URL,
      token: process.env.DIGITALBEE_GRANT_VERIFY_TOKEN,
    });
    const result = await executeDigitalBeeM03Review(parsed.data, scope, request, grant.email);
    const finalGrant = await verifyCurrentDigitalBeeGrant(scope, parsed.data.action, {
      url: process.env.DIGITALBEE_GRANT_VERIFY_URL,
      token: process.env.DIGITALBEE_GRANT_VERIFY_TOKEN,
    });
    if (finalGrant.email.toLowerCase() !== grant.email.toLowerCase()) {
      return NextResponse.json({ error: { code: "access_denied" } }, { status: 403 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DigitalBeeServiceError) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    if (error instanceof DigitalBeeM03Error) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "service_unavailable" } }, { status: 503 });
  }
}
