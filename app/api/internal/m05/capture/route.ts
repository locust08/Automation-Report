import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { captureBudgetDay } from "@/lib/budget/capture";
import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.M05_CAPTURE_JOB_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const left = Buffer.from(supplied), right = Buffer.from(secret ?? "");
  if (!secret || secret.length < 32 || left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "access_denied" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    if (Number(request.headers.get("content-length") ?? "0") > 1024) throw new DigitalBeeServiceError("invalid_request", 400);
    const raw = await request.text();
    if (raw.length > 1024) throw new DigitalBeeServiceError("invalid_request", 400);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DigitalBeeServiceError("invalid_request", 400);
    const value = body as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "accountId,date") throw new DigitalBeeServiceError("invalid_request", 400);
    const result = await captureBudgetDay(value.accountId as number, value.date as string);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DigitalBeeServiceError ? error.status : 503;
    return NextResponse.json({ error: status === 400 ? "invalid_request" : "capture_unavailable" },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
