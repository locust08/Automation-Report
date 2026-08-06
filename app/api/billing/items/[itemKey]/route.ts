import { NextResponse } from "next/server";

import { mutateBillingItem } from "@/lib/billing/client";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemKey: string }> }
) {
  try {
    const { itemKey } = await context.params;
    const body = (await request.json()) as { reportDate?: unknown; checked?: unknown; remark?: unknown };
    if (typeof body.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)) {
      return NextResponse.json({ message: "A valid reportDate is required." }, { status: 400 });
    }
    if (body.checked !== undefined && typeof body.checked !== "boolean") {
      return NextResponse.json({ message: "checked must be a boolean." }, { status: 400 });
    }
    if (body.remark !== undefined && typeof body.remark !== "string") {
      return NextResponse.json({ message: "remark must be a string." }, { status: 400 });
    }
    const remark = typeof body.remark === "string" ? body.remark.trim().slice(0, 1000) : undefined;
    await mutateBillingItem(itemKey, { reportDate: body.reportDate, checked: body.checked as boolean | undefined, remark });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update the checklist item." },
      { status: 500 }
    );
  }
}
