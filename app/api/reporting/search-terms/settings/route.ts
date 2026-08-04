import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { updateSearchTermSettings } from "@/lib/search-term-optimization/workflow";

export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      automationEnabled?: boolean;
      cadence?: "off" | "weekly" | "biweekly" | "monthly";
    };
    if (!body.accountId) throw new Error("A Google Ads customer ID is required.");
    const cadence = body.cadence ?? "off";
    if (!["off", "weekly", "biweekly", "monthly"].includes(cadence)) {
      throw new Error("The selected review cadence is invalid.");
    }
    return NextResponse.json(
      await updateSearchTermSettings({
        accountId: body.accountId,
        automationEnabled: body.automationEnabled === true,
        cadence,
      })
    );
  } catch (error) {
    return buildReportingErrorResponse(error, "Unable to save search-term automation settings.");
  }
}
