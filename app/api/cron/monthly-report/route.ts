import {
  parseBooleanEnv,
  parseTargetList,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ message: "CRON ENDPOINT LIVE" });
}

export async function POST(request: Request) {
  try {
    console.log("Monthly report cron triggered");
    const body = (await safeReadJson(request)) as
      | {
          forceTestMode?: boolean | string;
          overrideTargets?: MonthlyReportTargetConfig[];
          overrideTargetsJson?: string;
        }
      | null;
    const result = await runMonthlyReportJob({
      forceTestMode:
        typeof body?.forceTestMode === "boolean"
          ? body.forceTestMode
          : parseBooleanEnv(typeof body?.forceTestMode === "string" ? body.forceTestMode : undefined),
      overrideTargets:
        Array.isArray(body?.overrideTargets)
          ? body.overrideTargets
          : parseTargetList(typeof body?.overrideTargetsJson === "string" ? body.overrideTargetsJson : undefined),
    });

    return Response.json({
      success: true,
      message: "CRON STARTED",
      result,
    });
  } catch (error) {
    console.error("CRON ERROR", error);

    return Response.json(
      {
        success: false,
        error: "Internal error",
      },
      { status: 500 }
    );
  }
}

async function safeReadJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    return await request.json();
  } catch {
    return null;
  }
}
