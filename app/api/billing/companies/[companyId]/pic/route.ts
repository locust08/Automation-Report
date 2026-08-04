import { NextResponse } from "next/server";
import { mutateCompanyPic } from "@/lib/billing/client";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    await context.params;
    const body = (await request.json()) as { reportDate?: unknown; accountKeys?: unknown; picKey?: unknown };
    if (typeof body.reportDate !== "string" || !Array.isArray(body.accountKeys) || typeof body.picKey !== "string") {
      return NextResponse.json({ message: "Invalid PIC assignment." }, { status: 400 });
    }
    await mutateCompanyPic({
      reportDate: body.reportDate,
      accountKeys: body.accountKeys.filter((value): value is string => typeof value === "string"),
      picKey: body.picKey,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to assign PIC." }, { status: 500 });
  }
}
