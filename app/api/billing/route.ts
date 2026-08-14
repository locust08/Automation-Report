import { NextResponse } from "next/server";

import { getBillingReport } from "@/lib/billing/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getBillingReport(url.searchParams), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load Billing Operations." },
      { status: 500 }
    );
  }
}
